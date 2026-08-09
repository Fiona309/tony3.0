"""Generate first-pass tutorial video segments with SenseVoice transcripts.

Run from the backend directory:
    python -m app.scripts.generate_tutorial_segments

The script extracts audio from each configured tutorial video, transcribes
short windows with SenseVoice, then writes a review report and CSV segment
draft. It prefers model timestamps when available; otherwise each transcript
window is used as an approximate timestamp. Segment boundaries are estimated
by transcript text volume, so dense operation sections get more timeline
attention than music or short closing sections.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime
from importlib import import_module
from pathlib import Path
from typing import Any

from ..config import get_settings


TUTORIAL_VIDEOS = [
    ("tutorial_blue", "蓝色", "卡洛美", "染发/固色", "mock-assets/blue/tutorial.mp4"),
    ("tutorial_red", "红色", "染鲤", "染发", "mock-assets/red/tutorial.mp4"),
    ("tutorial_purple", "紫色", "卡洛美", "固色", "mock-assets/purple/tutorial.mp4"),
    ("tutorial_pink", "粉色", "NV", "固色", "mock-assets/pink/tutorial.mp4"),
    ("tutorial_cold_tea", "冷茶色", "施华蔻", "染发", "mock-assets/cold_tea/tutorial.mp4"),
    ("tutorial_cold_brown", "冷棕色", "忆丝芸", "染发", "mock-assets/cold_brown/tutorial.mp4"),
]

STEP_KEYWORDS = [
    ("介绍与准备", ("教程", "准备", "工具", "衣服", "披肩", "手套", "耳套", "凡士林", "乳膏")),
    ("产品调配", ("调配", "混合", "搅拌", "搅", "比例", "1比1", "发膜", "护发素", "染发剂", "显发剂", "精油")),
    ("分区与涂抹", ("分区", "涂", "抹", "染膏", "上色", "发根", "发尾", "发中", "梳开", "均匀")),
    ("补涂与检查", ("补", "检查", "遗漏", "覆盖", "后脑勺", "反面", "揉", "揉搓")),
    ("等待与冲洗", ("等待", "等", "停留", "分钟", "计时", "显色", "冲", "洗掉", "洗完", "清洗", "冲洗")),
    ("护理与效果展示", ("护理", "护发", "吹干", "发质", "效果", "光泽", "显白", "掉色", "维持")),
]


@dataclass(frozen=True)
class TutorialVideo:
    tutorial_video_id: str
    color: str
    brand: str
    tutorial_type: str
    path: Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate tutorial segment drafts from SenseVoice transcripts.")
    parser.add_argument("--chunk-seconds", type=int, default=20, help="Fallback transcript window size.")
    parser.add_argument("--output-dir", default="../docs/generated/tutorial_segments", help="Output directory.")
    parser.add_argument("--only", default="", help="Comma separated tutorial_video_id filter.")
    parser.add_argument("--transcript-json", default="", help="Reuse an existing transcript JSON and only regenerate CSV/report.")
    args = parser.parse_args()

    settings = get_settings()

    output_dir = (Path.cwd() / args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    work_dir = output_dir / "_audio_chunks"
    work_dir.mkdir(parents=True, exist_ok=True)

    selected_ids = {item.strip() for item in args.only.split(",") if item.strip()}
    videos = [
        TutorialVideo(tutorial_id, color, brand, kind, settings.media_dir / relative_path)
        for tutorial_id, color, brand, kind, relative_path in TUTORIAL_VIDEOS
        if not selected_ids or tutorial_id in selected_ids
    ]

    if args.transcript_json:
        all_transcripts = load_transcripts(Path(args.transcript_json), selected_ids)
        all_segments = []
        for item in all_transcripts:
            if item.get("error"):
                continue
            video = TutorialVideo(
                str(item["tutorial_video_id"]),
                str(item.get("color") or ""),
                str(item.get("brand") or ""),
                str(item.get("tutorial_type") or ""),
                Path(str(item.get("video_path") or "")),
            )
            all_segments.extend(suggest_segments(video, int(item["duration_ms"]), item.get("chunks", [])))
    else:
        ensure_tool("ffmpeg")
        ensure_tool("ffprobe")
        model = load_sensevoice_model(settings)
        postprocess = import_module("funasr.utils.postprocess_utils").rich_transcription_postprocess

        all_transcripts = []
        all_segments = []
        for video in videos:
            if not video.path.exists():
                all_transcripts.append(
                    {
                        "tutorial_video_id": video.tutorial_video_id,
                        "error": f"video_not_found:{video.path}",
                    }
                )
                continue
            duration_ms = probe_duration_ms(video.path)
            chunks = transcribe_video_chunks(
                model=model,
                postprocess=postprocess,
                video=video,
                duration_ms=duration_ms,
                chunk_seconds=args.chunk_seconds,
                work_dir=work_dir,
            )
            segments = suggest_segments(video, duration_ms, chunks)
            all_transcripts.append(
                {
                    "tutorial_video_id": video.tutorial_video_id,
                    "color": video.color,
                    "brand": video.brand,
                    "tutorial_type": video.tutorial_type,
                    "video_path": str(video.path),
                    "duration_ms": duration_ms,
                    "chunks": chunks,
                }
            )
            all_segments.extend(segments)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    transcript_path = output_dir / f"tutorial_transcripts_{timestamp}.json"
    csv_path = output_dir / f"tutorial_segments_{timestamp}.csv"
    report_path = output_dir / f"tutorial_segments_report_{timestamp}.md"

    transcript_path.write_text(json.dumps(all_transcripts, ensure_ascii=False, indent=2), encoding="utf-8")
    write_segments_csv(csv_path, all_segments)
    report_path.write_text(render_report(all_transcripts, all_segments), encoding="utf-8")

    print("generated:")
    print(transcript_path)
    print(csv_path)
    print(report_path)


def load_transcripts(path: Path, selected_ids: set[str]) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise RuntimeError("transcript_json_must_be_list")
    result = [item for item in data if isinstance(item, dict)]
    if selected_ids:
        result = [item for item in result if item.get("tutorial_video_id") in selected_ids]
    return result


def load_sensevoice_model(settings: Any):
    os.environ.setdefault("MODELSCOPE_CACHE", str(settings.model_cache_dir))
    os.environ.setdefault("HF_HOME", str(settings.model_cache_dir / "huggingface"))
    auto_model = import_module("funasr").AutoModel
    return auto_model(
        model=settings.sensevoice_model,
        vad_model=settings.sensevoice_vad_model,
        vad_kwargs={"max_single_segment_time": 30000},
        device=settings.sensevoice_device,
    )


def transcribe_video_chunks(
    *,
    model: Any,
    postprocess: Any,
    video: TutorialVideo,
    duration_ms: int,
    chunk_seconds: int,
    work_dir: Path,
) -> list[dict[str, Any]]:
    chunks = []
    chunk_ms = chunk_seconds * 1000
    for start_ms in range(0, max(duration_ms, 1), chunk_ms):
        end_ms = min(duration_ms, start_ms + chunk_ms)
        wav_path = work_dir / f"{video.tutorial_video_id}_{start_ms:08d}_{end_ms:08d}.wav"
        extract_audio_chunk(video.path, wav_path, start_ms, end_ms)
        raw_result = model.generate(
            input=str(wav_path),
            language="zh",
            use_itn=True,
            batch_size_s=60,
        )
        item = raw_result[0] if raw_result else {}
        raw_text = item.get("text", "") if isinstance(item, dict) else ""
        text = postprocess(raw_text).strip() if raw_text else ""
        timestamp_items = extract_timestamp_items(item, start_ms)
        chunks.append(
            {
                "start_ms": start_ms,
                "end_ms": end_ms,
                "start_time": format_ms(start_ms),
                "end_time": format_ms(end_ms),
                "text": text,
                "raw_text": raw_text,
                "model_timestamps": timestamp_items,
            }
        )
    return chunks


def extract_timestamp_items(item: dict[str, Any], offset_ms: int) -> list[dict[str, Any]]:
    if not isinstance(item, dict):
        return []
    sentence_info = item.get("sentence_info")
    if isinstance(sentence_info, list):
        result = []
        for sentence in sentence_info:
            if not isinstance(sentence, dict):
                continue
            start = to_int(sentence.get("start") or sentence.get("start_time"))
            end = to_int(sentence.get("end") or sentence.get("end_time"))
            text = str(sentence.get("text") or "").strip()
            if start is not None and end is not None:
                result.append(
                    {
                        "start_ms": offset_ms + start,
                        "end_ms": offset_ms + end,
                        "text": text,
                    }
                )
        return result
    timestamps = item.get("timestamp")
    if isinstance(timestamps, list) and timestamps and isinstance(timestamps[0], list):
        return [
            {"start_ms": offset_ms + int(pair[0]), "end_ms": offset_ms + int(pair[1]), "text": ""}
            for pair in timestamps
            if len(pair) >= 2
        ]
    return []


def suggest_segments(video: TutorialVideo, duration_ms: int, chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    non_empty = [chunk for chunk in chunks if str(chunk.get("text") or "").strip()]
    source = non_empty or chunks
    if not source:
        return []

    target_count = choose_step_count(duration_ms, source)
    groups = split_chunks_by_text_weight(source, target_count)

    rows = []
    for index, group in enumerate(groups, start=1):
        if not group:
            continue
        start_ms = int(group[0]["segment_start_ms"])
        end_ms = int(group[-1]["segment_end_ms"])
        text = " ".join(str(item.get("text") or "").strip() for item in group).strip()
        title = guess_step_title(text, index, len(groups))
        rows.append(
            {
                "tutorial_video_id": video.tutorial_video_id,
                "color": video.color,
                "brand": video.brand,
                "tutorial_type": video.tutorial_type,
                "step_no": index,
                "total_steps": len(groups),
                "step_title": title,
                "start_time": format_ms(start_ms),
                "end_time": format_ms(end_ms),
                "start_time_ms": start_ms,
                "end_time_ms": end_ms,
                "description": summarize_text(text, title),
                "step_end_tts": "你在这一步有什么问题，可以随时问我～",
                "notes": text,
            }
        )
    return rows


def choose_step_count(duration_ms: int, chunks: list[dict[str, Any]]) -> int:
    total_chars = sum(text_weight(str(chunk.get("text") or "")) for chunk in chunks)
    by_duration = 3
    if duration_ms > 170_000:
        by_duration = 5
    elif duration_ms > 110_000:
        by_duration = 4
    by_text = 3
    if total_chars > 900:
        by_text = 5
    elif total_chars > 560:
        by_text = 4
    count = max(3, min(5, max(by_duration, by_text)))
    return min(count, len(chunks))


def split_chunks_by_text_weight(chunks: list[dict[str, Any]], target_count: int) -> list[list[dict[str, Any]]]:
    weighted_chunks = []
    for chunk in chunks:
        weight = text_weight(str(chunk.get("text") or ""))
        weighted_chunks.append({**chunk, "text_weight": max(1, weight)})

    total_weight = sum(item["text_weight"] for item in weighted_chunks)
    if total_weight <= target_count:
        return [
            [
                {
                    **chunk,
                    "segment_start_ms": int(chunk["start_ms"]),
                    "segment_end_ms": int(chunk["end_ms"]),
                }
            ]
            for chunk in weighted_chunks
        ]

    groups = []
    current = []
    current_weight = 0.0
    next_boundary = total_weight / target_count
    accumulated = 0.0

    for index, chunk in enumerate(weighted_chunks):
        remaining_chunks = len(weighted_chunks) - index
        remaining_groups = target_count - len(groups)
        start_ms = int(chunk["start_ms"])
        end_ms = int(chunk["end_ms"])
        chunk_weight = float(chunk["text_weight"])
        piece_start_ms = start_ms
        piece_start_ratio = 0.0
        text = str(chunk.get("text") or "")

        while (
            len(groups) < target_count - 1
            and accumulated + chunk_weight > next_boundary
            and remaining_chunks >= remaining_groups
        ):
            before_boundary = next_boundary - accumulated
            ratio = max(0.0, min(1.0, before_boundary / chunk_weight))
            split_ms = int(piece_start_ms + (end_ms - piece_start_ms) * ratio)
            split_ms = max(piece_start_ms + 1, min(end_ms, split_ms))
            piece_end_ratio = piece_start_ratio + (1.0 - piece_start_ratio) * ratio
            current.append(
                {
                    **chunk,
                    "text": slice_text_by_ratio(text, piece_start_ratio, piece_end_ratio),
                    "segment_start_ms": piece_start_ms,
                    "segment_end_ms": split_ms,
                }
            )
            groups.append(current)
            current = []
            used_weight = chunk_weight * ratio
            chunk_weight -= used_weight
            accumulated = next_boundary
            current_weight = 0.0
            next_boundary = total_weight * (len(groups) + 1) / target_count
            piece_start_ms = split_ms
            piece_start_ratio = piece_end_ratio

        current.append(
            {
                **chunk,
                "text": slice_text_by_ratio(text, piece_start_ratio, 1.0),
                "segment_start_ms": piece_start_ms,
                "segment_end_ms": end_ms,
            }
        )
        current_weight += chunk_weight
        accumulated += chunk_weight

    if current:
        groups.append(current)

    return merge_extra_groups(groups, target_count)


def merge_extra_groups(groups: list[list[dict[str, Any]]], target_count: int) -> list[list[dict[str, Any]]]:
    while len(groups) > target_count:
        last = groups.pop()
        groups[-1].extend(last)
    return groups


def text_weight(text: str) -> int:
    compact = clean_transcript_text(text)
    chinese_chars = re.findall(r"[\u4e00-\u9fff]", compact)
    ascii_words = re.findall(r"[A-Za-z0-9]+", compact)
    return len(chinese_chars) + len(ascii_words)


def clean_transcript_text(text: str) -> str:
    text = re.sub(r"[🎼😊😔😡]+", "", text)
    text = re.sub(r"\s+", "", text)
    return text


def slice_text_by_ratio(text: str, start_ratio: float, end_ratio: float) -> str:
    if not text:
        return ""
    start = max(0, min(len(text), int(len(text) * start_ratio)))
    end = max(start, min(len(text), int(len(text) * end_ratio)))
    return text[start:end].strip()


def guess_step_title(text: str, step_no: int, total_steps: int) -> str:
    scores = []
    for title, keywords in STEP_KEYWORDS:
        score = sum(text.count(keyword) for keyword in keywords)
        if step_no == 1 and title == "介绍与准备":
            score += 1
        if step_no == total_steps and title == "护理与效果展示":
            score += 2
        scores.append((score, title))
    best_score, best_title = max(scores, key=lambda item: item[0])
    if step_no == 1 and any(keyword in text for keyword in ("教程", "准备", "染之前", "衣服", "披肩", "手套", "凡士林", "乳膏")):
        return "介绍与准备"
    if step_no == 1 and best_title == "护理与效果展示":
        return "介绍与准备"
    if step_no == total_steps and any(keyword in text for keyword in ("冲", "洗", "护理", "护发", "吹干", "效果", "光泽")):
        return "护理与效果展示"
    if best_score > 1:
        return best_title
    fallback = ["介绍与准备", "产品调配", "分区与涂抹", "补涂与检查", "等待与冲洗", "护理与效果展示"]
    if step_no == total_steps:
        return "护理与效果展示"
    return fallback[min(step_no - 1, len(fallback) - 1)]


def summarize_text(text: str, title: str) -> str:
    compact = re.sub(r"\\s+", "", text)
    if compact:
        return compact[:48]
    defaults = {
        "介绍与准备": "介绍目标效果并完成染前准备。",
        "产品调配": "按教程比例调配染膏或固色产品。",
        "分区与涂抹": "按教程顺序分区并均匀涂抹产品。",
        "补涂与检查": "检查遗漏区域并补涂。",
        "等待与冲洗": "按说明等待显色并冲洗。",
        "护理与效果展示": "完成护理并查看最终效果。",
    }
    return defaults.get(title, "按当前步骤操作。")


def write_segments_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fieldnames = [
        "tutorial_video_id",
        "color",
        "brand",
        "tutorial_type",
        "step_no",
        "total_steps",
        "step_title",
        "start_time",
        "end_time",
        "start_time_ms",
        "end_time_ms",
        "description",
        "step_end_tts",
        "notes",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def render_report(transcripts: list[dict[str, Any]], segments: list[dict[str, Any]]) -> str:
    by_video = {}
    for row in segments:
        by_video.setdefault(row["tutorial_video_id"], []).append(row)
    lines = ["# 教程视频自动转录与分区建议", ""]
    for item in transcripts:
        tutorial_id = item["tutorial_video_id"]
        lines.append(f"## {tutorial_id} {item.get('color', '')} {item.get('brand', '')}")
        if item.get("error"):
            lines.extend([f"- 错误：{item['error']}", ""])
            continue
        lines.append(f"- 视频：`{item['video_path']}`")
        lines.append(f"- 时长：{format_ms(int(item['duration_ms']))}")
        lines.append("")
        lines.append("| 步骤 | 标题 | 开始 | 结束 | 说明 |")
        lines.append("|---|---|---:|---:|---|")
        for row in by_video.get(tutorial_id, []):
            lines.append(
                f"| {row['step_no']}/{row['total_steps']} | {row['step_title']} | "
                f"{row['start_time']} | {row['end_time']} | {row['description']} |"
            )
        lines.append("")
        lines.append("<details><summary>转录时间块</summary>")
        lines.append("")
        for chunk in item.get("chunks", []):
            text = chunk.get("text") or "(无有效语音)"
            lines.append(f"- `{chunk['start_time']}-{chunk['end_time']}` {text}")
        lines.append("")
        lines.append("</details>")
        lines.append("")
    return "\n".join(lines)


def extract_audio_chunk(source: Path, target: Path, start_ms: int, end_ms: int) -> None:
    command = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{start_ms / 1000:.3f}",
        "-t",
        f"{max(0.1, (end_ms - start_ms) / 1000):.3f}",
        "-i",
        str(source),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        str(target),
    ]
    run(command)


def probe_duration_ms(path: Path) -> int:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    completed = run(command)
    return int(float(completed.stdout.strip()) * 1000)


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or f"command_failed:{command[0]}")
    return completed


def ensure_tool(name: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(f"missing_required_tool:{name}")


def format_ms(value: int) -> str:
    total_seconds = max(0, round(value / 1000))
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def to_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


if __name__ == "__main__":
    main()
