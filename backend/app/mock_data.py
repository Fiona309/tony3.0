"""In-memory domain state used by the P0 Mock API."""

from __future__ import annotations

import csv
import json
from copy import deepcopy
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any
from uuid import uuid4


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:10]}"


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat()


def _qa_summary_statement(text: str, *, topic: str = "") -> str | None:
    raw = " ".join(str(text or "").split())
    if not raw:
        return None
    if "：" in raw:
        raw = raw.split("：", 1)[1].strip()
    elif ":" in raw:
        raw = raw.split(":", 1)[1].strip()
    for prefix in ("好的，", "好的。", "嗯，", "嗯。", "哦，", "哦。", "根据染膏说明书，", "根据染膏说明书的"):
        if raw.startswith(prefix):
            raw = raw[len(prefix) :].strip()
    raw = raw.replace("哦", "").strip()
    if not raw:
        return None
    first_sentence = raw
    for separator in ("。", "！", "？", ";", "；"):
        if separator in first_sentence:
            first_sentence = first_sentence.split(separator, 1)[0].strip()
            break
    if len(first_sentence) < 14 and len(raw) > len(first_sentence):
        first_sentence = raw[:64].rstrip("，,。；; ")
    if len(first_sentence) > 72:
        first_sentence = first_sentence[:72].rstrip("，,。；; ") + "…"
    if topic and topic not in {"OperationQAKB 未命中", "当前步骤操作问答", "问题不明确"}:
        topic = topic.replace("？", "").replace("?", "").strip()
        return f"{topic}：{first_sentence}。"
    return f"{first_sentence}。"


def _color(
    tone: str,
    level: int,
    saturation: str,
    display_name: str,
    confidence: float | None = None,
) -> dict:
    result = {
        "tone": tone,
        "level": level,
        "saturation": saturation,
        "display_name": display_name,
    }
    if confidence is not None:
        result["confidence"] = confidence
    return result


EDITABLE_OPTIONS = {
    "hair_length": [
        {"value": "ear", "label": "齐耳短发"},
        {"value": "shoulder", "label": "齐肩发"},
        {"value": "chest", "label": "齐胸中长发"},
        {"value": "waist", "label": "齐腰长发"},
        {"value": "below_waist", "label": "腰部以下超长发"},
    ],
    "hair_volume": [
        {"value": "low", "label": "少"},
        {"value": "medium", "label": "适中"},
        {"value": "high", "label": "多"},
    ],
    # 漂过 1 次和 2 次必须分开：一次漂浅约 +2 度，是"够不够染这个色"的判定粒度，
    # 旧的 bleached_1_2 把这两档合并，等于把 4 度的差异抹平，判断会失真。
    "dye_history": [
        {"value": "natural", "label": "从未漂过"},
        {"value": "bleached_1", "label": "漂过 1 次"},
        {"value": "bleached_2", "label": "漂过 2 次"},
        {"value": "bleached_3_plus", "label": "漂过 3 次及以上"},
        {"value": "dyed_black", "label": "染过黑发"},
    ],
}

# 旧枚举 -> 现枚举。视觉模型和历史存档里仍可能出现旧值，统一在入口归一化，
# 避免前端 optionLabel 找不到而把 raw 枚举名直接显示给用户。
DYE_HISTORY_LEGACY = {
    "dyed_no_bleach": "natural",  # 染过但没漂过，对"底色够不够浅"的判断等同于从未漂过
    "bleached_1_2": "bleached_1",  # 合并档拆开时取保守的一侧（少算漂浅次数）
    "unknown": "natural",
}


def normalize_dye_history(value: str | None) -> str:
    if not value:
        return "natural"
    return DYE_HISTORY_LEGACY.get(value, value)

CURRENT_GOLD = {
    **_color("yellow", 8, "medium", "金色", 0.78),
    "rgb": {"r": 218, "g": 185, "b": 115},
    "hsv": {"h": 42, "s": 47, "v": 85},
    "lab": {"l": 76, "a": 5, "b": 42},
}
TARGET_BLUE = {
    **_color("blue", 8, "medium", "蓝色", 0.92),
    "rgb": {"r": 65, "g": 105, "b": 225},
    "hsv": {"h": 225, "s": 71, "v": 88},
    "lab": {"l": 46, "a": 22, "b": -66},
}
TARGET_RED = {
    **_color("red", 7, "medium", "红色", 0.92),
    "rgb": {"r": 176, "g": 48, "b": 62},
    "hsv": {"h": 354, "s": 73, "v": 69},
    "lab": {"l": 41, "a": 51, "b": 28},
}
TARGET_PURPLE = {
    **_color("purple", 8, "medium", "紫色", 0.92),
    "rgb": {"r": 112, "g": 76, "b": 154},
    "hsv": {"h": 268, "s": 51, "v": 60},
    "lab": {"l": 38, "a": 30, "b": -37},
}
TARGET_PINK = {
    **_color("pink", 8, "light", "粉色", 0.92),
    "rgb": {"r": 218, "g": 126, "b": 157},
    "hsv": {"h": 340, "s": 42, "v": 85},
    "lab": {"l": 63, "a": 39, "b": 2},
}
TARGET_COLD_TEA = {
    **_color("brown", 6, "light", "冷茶色", 0.92),
    "rgb": {"r": 116, "g": 96, "b": 78},
    "hsv": {"h": 28, "s": 33, "v": 45},
    "lab": {"l": 42, "a": 5, "b": 14},
}
TARGET_COLD_BROWN = {
    **_color("brown", 6, "light", "冷棕色", 0.92),
    "rgb": {"r": 100, "g": 82, "b": 70},
    "hsv": {"h": 24, "s": 30, "v": 39},
    "lab": {"l": 36, "a": 6, "b": 10},
}

TUTORIAL_STEPS = [
    {
        "step_id": "step_01",
        "step_no": 1,
        "total_steps": 5,
        "start_time_ms": 0,
        "end_time_ms": 35000,
        "title": "准备与分区",
        "description": "将头发按区域分开，准备开始上色。",
    },
    {
        "step_id": "step_02",
        "step_no": 2,
        "total_steps": 5,
        "start_time_ms": 35000,
        "end_time_ms": 80000,
        "title": "第一轮上色",
        "description": "从指定区域开始均匀涂抹。",
    },
    {
        "step_id": "step_03",
        "step_no": 3,
        "total_steps": 5,
        "start_time_ms": 80000,
        "end_time_ms": 130000,
        "title": "第二轮上色",
        "description": "继续覆盖剩余区域，确保发根和发尾均匀。",
    },
    {
        "step_id": "step_04",
        "step_no": 4,
        "total_steps": 5,
        "start_time_ms": 130000,
        "end_time_ms": 150000,
        "title": "等待显色",
        "description": "按产品说明等待显色，不要额外加热。",
    },
    {
        "step_id": "step_05",
        "step_no": 5,
        "total_steps": 5,
        "start_time_ms": 150000,
        "end_time_ms": 180000,
        "title": "冲洗与护理",
        "description": "冲洗至水基本清澈，再使用配套护理。",
    },
]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
GENERATED_TUTORIAL_SEGMENT_DIR = PROJECT_ROOT / "docs" / "generated" / "tutorial_segments"


STEP_DISPLAY_DEFAULTS = {
    "介绍与准备": {
        "description": "先看目标效果和染前准备，确认衣服、手套、隔离乳等基础防护已经到位。",
        "points": ["穿不怕弄脏的衣服，戴好手套或披肩。", "发际线、耳后和脖子后侧可以先做隔离防护。"],
        "caution": "正式上头前，先确认皮肤没有明显不适；产品说明优先于视频口播。",
    },
    "产品调配": {
        "description": "按照视频里的比例调配染膏、发膜或护发素，搅拌到颜色和质地基本均匀。",
        "points": ["先少量多次加入产品，避免一次倒太多。", "调配完成后再开始上头，减少局部颜色不均。"],
        "caution": "不要随意改变官方说明里的混合比例。",
    },
    "分区与涂抹": {
        "description": "按视频示范分区涂抹，重点保证发中、发尾和后脑勺都被均匀覆盖。",
        "points": ["头发多时先分层分区，降低漏涂概率。", "涂抹后用手或梳子轻轻带开，让颜色覆盖更均匀。"],
        "caution": "尽量避免染膏大量堆到头皮上，敏感头皮要更保守。",
    },
    "等待与冲洗": {
        "description": "按视频节奏等待显色，再用偏凉水冲洗，直到水色明显变浅。",
        "points": ["等待时不要额外加热，按产品说明控制时间。", "冲洗水温不要太高，减少快速掉色。"],
        "caution": "如果出现明显刺痛或不适，提前冲洗并停止使用。",
        "wait_seconds": 600,
    },
    "护理与效果展示": {
        "description": "完成冲洗、护发和吹干，观察最终颜色、均匀度和发质状态。",
        "points": ["洗后使用护发素或护发精油护理发中发尾。", "吹风温度不要太高，降低掉色和毛躁风险。"],
        "caution": "染后 48 小时尽量减少洗头，后续使用温和洗护。",
    },
}


def _latest_tutorial_segments_csv() -> Path | None:
    if not GENERATED_TUTORIAL_SEGMENT_DIR.exists():
        return None
    candidates = sorted(GENERATED_TUTORIAL_SEGMENT_DIR.glob("tutorial_segments_*.csv"))
    return candidates[-1] if candidates else None


def _clean_segment_text(value: str) -> str:
    text = str(value or "")
    for token in ("🎼", "😊", "😔", "😡"):
        text = text.replace(token, "")
    return " ".join(text.split()).strip(" ，。")


def _segment_points(title: str, notes: str) -> list[str]:
    defaults = STEP_DISPLAY_DEFAULTS.get(title, STEP_DISPLAY_DEFAULTS["分区与涂抹"])
    clean_notes = _clean_segment_text(notes)
    if not clean_notes:
        return list(defaults["points"])
    pieces = [item.strip() for item in clean_notes.replace("！", "。").replace("？", "。").split("。")]
    points = [piece[:42] for piece in pieces if len(piece) >= 10][:2]
    return points or list(defaults["points"])


def _build_tutorial_step(row: dict[str, str]) -> dict:
    tutorial_video_id = row["tutorial_video_id"]
    step_no = int(row["step_no"])
    total_steps = int(row["total_steps"])
    title = row["step_title"]
    defaults = STEP_DISPLAY_DEFAULTS.get(title, STEP_DISPLAY_DEFAULTS["分区与涂抹"])
    description = _clean_segment_text(row.get("description") or "") or defaults["description"]
    step = {
        "step_id": f"{tutorial_video_id}_step_{step_no:02d}",
        "step_no": step_no,
        "total_steps": total_steps,
        "start_time_ms": int(float(row["start_time_ms"])),
        "end_time_ms": int(float(row["end_time_ms"])),
        "title": title,
        "description": description,
        "points": _segment_points(title, row.get("notes") or description),
        "caution": defaults.get("caution"),
        "display_time_range": f"{row.get('start_time', '')}-{row.get('end_time', '')}",
        "source": "sensevoice_auto_segment",
    }
    if defaults.get("wait_seconds"):
        step["wait_seconds"] = defaults["wait_seconds"]
    return step


def _load_tutorial_steps_by_video_id() -> dict[str, list[dict]]:
    csv_path = _latest_tutorial_segments_csv()
    if csv_path is None:
        return {}
    try:
        with csv_path.open(encoding="utf-8-sig", newline="") as csv_file:
            rows = list(csv.DictReader(csv_file))
    except OSError:
        return {}
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        tutorial_video_id = row.get("tutorial_video_id")
        if not tutorial_video_id:
            continue
        try:
            grouped.setdefault(tutorial_video_id, []).append(_build_tutorial_step(row))
        except (KeyError, TypeError, ValueError):
            continue
    for steps in grouped.values():
        steps.sort(key=lambda item: item["step_no"])
        total_steps = len(steps)
        for index, step in enumerate(steps, start=1):
            step["step_no"] = index
            step["total_steps"] = total_steps
    return grouped


TUTORIAL_STEPS_BY_VIDEO_ID = _load_tutorial_steps_by_video_id()


def _tutorial_steps_for_video_id(tutorial_video_id: str | None) -> list[dict]:
    steps = TUTORIAL_STEPS_BY_VIDEO_ID.get(str(tutorial_video_id or ""))
    return deepcopy(steps if steps else TUTORIAL_STEPS)


def _tutorial_display_title(media_item: dict | None) -> str:
    if not media_item:
        return "染发教程"
    if media_item.get("tutorial_title"):
        return str(media_item["tutorial_title"])
    color_name = str(media_item.get("color_name") or "")
    brand = str(media_item.get("brand") or "")
    tutorial_type = str(media_item.get("tutorial_type") or "教程")
    return f"{color_name}{brand}{tutorial_type}教程".strip() or "染发教程"

ENTRY_VIDEO_URL = "/media/video-uploads/a2431c5c23e6/video.mp4"
ENTRY_COVER_URL = "/media/video-mock/frames/step-3-2.jpg"
ENTRY_TARGET_FRAME_URL = "/media/video-mock/frames/step-3-2.jpg"
TUTORIAL_VIDEO_URL = "/media/video-uploads/a2431c5c23e6/video.mp4"
AFTER_VIDEO_URL = "/media/video-uploads/5c74f7db6af0/video.mp4"
AFTER_COVER_URL = "/media/video-uploads/5c74f7db6af0/frames/step-6-2.jpg"
MOCK_MEDIA_LIBRARY = {
    "blue": {
        "video_id": "vid_blue_transition",
        "title": "蓝色颜值转场",
        "tutorial_title": "蓝色卡洛美固色教程",
        "color_name": "蓝色",
        "color_alias": "蓝色",
        "brand": "卡洛美",
        "tutorial_type": "染发/固色",
        "accent": "#4169e1",
        "target_color": TARGET_BLUE,
        "entry_video": "/media/mock-assets/blue/transition.mp4",
        "cover": "/media/mock-assets/blue/after.jpg",
        "target_frame": "/media/mock-assets/blue/after.jpg",
        "trigger_time_ms": 1000,
        "tutorial_video_id": "tutorial_blue",
        "tutorial_url": "/media/mock-assets/blue/tutorial.mp4",
        "product_id": "prod_blue_same",
    },
    "red": {
        "video_id": "vid_red_transition",
        "title": "红色颜值转场",
        "tutorial_title": "红色染鲤染发教程",
        "color_name": "红色",
        "color_alias": "红色",
        "brand": "染鲤",
        "tutorial_type": "染发",
        "accent": "#b0303e",
        "target_color": TARGET_RED,
        "entry_video": "/media/mock-assets/red/transition.mp4",
        "cover": "/media/mock-assets/red/after.jpg",
        "target_frame": "/media/mock-assets/red/after.jpg",
        "trigger_time_ms": 5000,
        "tutorial_video_id": "tutorial_red",
        "tutorial_url": "/media/mock-assets/red/tutorial.mp4",
        "product_id": "prod_red_same",
    },
    "purple": {
        "video_id": "vid_purple_transition",
        "title": "紫色颜值转场",
        "tutorial_title": "紫色卡洛美固色教程",
        "color_name": "紫色",
        "color_alias": "紫色",
        "brand": "卡洛美",
        "tutorial_type": "固色",
        "accent": "#704c9a",
        "target_color": TARGET_PURPLE,
        "entry_video": "/media/mock-assets/purple/transition.mp4",
        "cover": "/media/mock-assets/purple/after.jpg",
        "target_frame": "/media/mock-assets/purple/after.jpg",
        "trigger_time_ms": 85000,
        "tutorial_video_id": "tutorial_purple",
        "tutorial_url": "/media/mock-assets/purple/tutorial.mp4",
        "product_id": "prod_purple_same",
    },
    "pink": {
        "video_id": "vid_pink_tutorial",
        "title": "粉色固色教程",
        "tutorial_title": "粉色 NV 固色教程",
        "color_name": "粉色",
        "color_alias": "粉色",
        "brand": "NV",
        "tutorial_type": "固色",
        "accent": "#da7e9d",
        "target_color": TARGET_PINK,
        "entry_video": "/media/mock-assets/pink/tutorial.mp4",
        "cover": "/media/mock-assets/pink/after.jpg",
        "target_frame": "/media/mock-assets/pink/after.jpg",
        "trigger_time_ms": 70000,
        "tutorial_video_id": "tutorial_pink",
        "tutorial_url": "/media/mock-assets/pink/tutorial.mp4",
        "product_id": "prod_pink_same",
    },
    "cold_tea": {
        "video_id": "vid_cold_tea_tutorial",
        "title": "冷茶短发教程",
        "tutorial_title": "冷茶色施华蔻染发教程",
        "color_name": "冷茶色",
        "color_alias": "冷茶短发",
        "brand": "施华蔻",
        "tutorial_type": "染发",
        "accent": "#74604e",
        "target_color": TARGET_COLD_TEA,
        "entry_video": "/media/mock-assets/cold_tea/tutorial.mp4",
        "cover": "/media/mock-assets/cold_tea/after.jpg",
        "target_frame": "/media/mock-assets/cold_tea/after.jpg",
        "trigger_time_ms": 144000,
        "tutorial_video_id": "tutorial_cold_tea",
        "tutorial_url": "/media/mock-assets/cold_tea/tutorial.mp4",
        "product_id": "prod_cold_tea_same",
    },
    "cold_brown": {
        "video_id": "vid_cold_brown_tutorial",
        "title": "冷棕长发教程",
        "tutorial_title": "冷棕色忆丝芸染发教程",
        "color_name": "冷棕色",
        "color_alias": "冷棕长发",
        "brand": "忆丝芸",
        "tutorial_type": "染发",
        "accent": "#645246",
        "target_color": TARGET_COLD_BROWN,
        "entry_video": "/media/mock-assets/cold_brown/tutorial.mp4",
        "cover": "/media/mock-assets/cold_brown/after.jpg",
        "target_frame": "/media/mock-assets/cold_brown/after.jpg",
        "trigger_time_ms": 134000,
        "tutorial_video_id": "tutorial_cold_brown",
        "tutorial_url": "/media/mock-assets/cold_brown/tutorial.mp4",
        "product_id": "prod_cold_brown_same",
    },
}
MOCK_MEDIA_BY_VIDEO_ID = {
    item["video_id"]: item
    for item in MOCK_MEDIA_LIBRARY.values()
}
MOCK_MEDIA_BY_TUTORIAL_ID = {
    item["tutorial_video_id"]: item
    for item in MOCK_MEDIA_LIBRARY.values()
}
DEMO_CURRENT_COLORS = {
    "blue": {
        **_color("gray", 8, "light", "8 度银灰演示底", 0.8),
        "rgb": {"r": 178, "g": 184, "b": 190},
    },
    "purple": {
        **_color("blue", 8, "medium", "8 度蓝紫演示底", 0.8),
        "rgb": {"r": 98, "g": 112, "b": 170},
    },
    "red": {
        **_color("yellow", 8, "medium", "8 度暖金演示底", 0.78),
        "rgb": {"r": 218, "g": 185, "b": 115},
    },
    "pink": {
        **_color("yellow", 9, "light", "9 度浅金演示底", 0.78),
        "rgb": {"r": 232, "g": 205, "b": 142},
    },
    "cold_tea": {
        **_color("natural_black", 3, "dark", "3 度自然黑演示底", 0.78),
        "rgb": {"r": 38, "g": 31, "b": 27},
    },
    "cold_brown": {
        **_color("yellow", 8, "medium", "8 度暖金演示底", 0.78),
        "rgb": {"r": 218, "g": 185, "b": 115},
    },
}


def _demo_current_color(target_key: str) -> dict:
    return deepcopy(DEMO_CURRENT_COLORS.get(target_key) or CURRENT_GOLD)


def _demo_current_color_options(target_key: str) -> list[dict]:
    primary = _demo_current_color(target_key)
    if target_key == "blue":
        return [
            primary,
            _color("silver", 9, "light", "9 度银色演示底"),
            _color("blue", 8, "medium", "8 度蓝色演示底"),
        ]
    if target_key == "purple":
        return [
            primary,
            _color("purple", 8, "medium", "8 度紫色演示底"),
            _color("red", 7, "medium", "7 度红色演示底"),
        ]
    if target_key == "cold_tea":
        return [
            primary,
            _color("brown", 5, "dark", "5 度棕色演示底"),
            _color("purple", 6, "medium", "6 度紫色演示底"),
        ]
    return [
        primary,
        _color("yellow_orange", 7, "medium", "7 度橘金演示底"),
        _color("yellow", 9, "light", "9 度浅金演示底"),
    ]


class MockStore:
    def __init__(self, media_dir: Path, database: Any | None = None) -> None:
        self.media_dir = media_dir
        self.database = database
        self._create_static_assets()
        self.profiles: dict[str, dict] = {}
        self.plans: dict[str, dict] = {}
        self.preview_tasks: dict[str, dict] = {}
        self.recommendation_records: dict[str, dict] = {}
        self.archives: dict[str, dict] = {}
        self.sessions: dict[str, dict] = {}
        self.after_tasks: dict[str, dict] = {}
        self.voice_events: dict[tuple[str, str], dict] = {}
        self._owners: dict[tuple[str, str], str] = {}

    def load_persistent_state(self) -> None:
        if self.database is None:
            return
        for row in self.database.load_state():
            user_key = self._user_key(row["user_key"])
            entity_type = row["entity_type"]
            entity_id = row["entity_id"]
            payload = row["payload"]
            self._owners[(entity_type, entity_id)] = user_key
            if entity_type == "profile":
                self.profiles[entity_id] = payload
            elif entity_type == "plan":
                self.plans[entity_id] = payload
            elif entity_type == "preview_task":
                if payload.get("status") == "generating":
                    payload["status"] = "queued"
                    payload["started"] = False
                self.preview_tasks[entity_id] = payload
            elif entity_type == "recommendation":
                self.recommendation_records[entity_id] = payload
            elif entity_type == "archive":
                self.archives[entity_id] = payload
            elif entity_type == "session":
                self.sessions[entity_id] = payload
            elif entity_type == "after_task":
                if payload.get("status") == "generating":
                    payload["status"] = "queued"
                    payload["progress_percent"] = 0
                    payload["message"] = "正在排队生成你的染后转场视频。"
                self.after_tasks[entity_id] = payload
            elif entity_type == "voice_event":
                session_id, event_id = entity_id.split(":", 1)
                self.voice_events[(session_id, event_id)] = payload

    def videos(self) -> dict:
        return {
            "videos": [
                {
                    "video_id": item["video_id"],
                    "title": item["title"],
                    "video_type": "dye_related",
                    "url": item["entry_video"],
                    "cover_url": item["cover"],
                    "target_frame_url": item["target_frame"],
                    "trigger_time_ms": item["trigger_time_ms"],
                    "color_name": item["color_name"],
                    "color_alias": item["color_alias"],
                    "accent": item["accent"],
                    # 用户在试色屏换色时要把新的目标色写回画像，前端必须拿得到
                    # 完整的 HairColor（含 level/rgb/lab），不能只靠一个色名去猜
                    "target_color": deepcopy(item["target_color"]),
                    "bound_product_id": item["product_id"],
                    "bound_tutorial_video_id": item["tutorial_video_id"],
                }
                for item in MOCK_MEDIA_LIBRARY.values()
            ]
        }

    def save_image(self, *, content: bytes, suffix: str, media_type: str) -> dict:
        image_id = _id("img_current" if media_type == "current_hair" else "img_after")
        folder = "current" if media_type == "current_hair" else "after"
        extension = suffix if suffix in {".jpg", ".jpeg", ".png", ".webp"} else ".jpg"
        storage_key = f"uploads/{folder}/{image_id}{extension}"
        target = self.media_dir / storage_key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return {
            "image_id": image_id,
            "media_type": media_type,
            "storage_key": storage_key,
            "url": f"/media/{storage_key}",
        }

    def image_path(self, image_id: str, *, media_type: str = "current_hair") -> Path | None:
        folder = "current" if media_type == "current_hair" else "after"
        matches = list((self.media_dir / "uploads" / folder).glob(f"{image_id}.*"))
        return matches[0] if matches else None

    def _image_url(self, image_id: str | None, *, media_type: str = "current_hair") -> str | None:
        if not image_id:
            return None
        path = self.image_path(image_id, media_type=media_type)
        if path is None:
            return None
        try:
            storage_key = path.relative_to(self.media_dir).as_posix()
        except ValueError:
            return None
        return f"/media/{storage_key}"

    def target_reference_path(self, entry_video_id: str) -> Path | None:
        media_item = MOCK_MEDIA_BY_VIDEO_ID.get(entry_video_id)
        if media_item is None:
            return None
        storage_key = media_item["target_frame"].removeprefix("/media/")
        path = self.media_dir / storage_key
        return path if path.exists() else None

    def create_profile(
        self,
        entry_video_id: str,
        current_image_id: str,
        current_color_analysis: dict | None = None,
        vision_analysis: dict | None = None,
        user_key: str | None = None,
    ) -> dict:
        profile_id = _id("profile")
        current_color = deepcopy(CURRENT_GOLD)
        current_color_options = [
            _color("yellow", 8, "medium", "金色"),
            _color("yellow_orange", 7, "medium", "橘金"),
            _color("yellow", 9, "light", "浅金"),
        ]
        media_item = MOCK_MEDIA_BY_VIDEO_ID.get(entry_video_id)
        target_color = deepcopy((media_item or {}).get("target_color") or TARGET_BLUE)
        target_color_options = []
        hair_length = "chest"
        hair_volume = "medium"
        dye_history = "natural"
        current_color_confidence = 0.78
        target_color_confidence = 0.92
        attribute_confidences = {
            "hair_length": 0.85,
            "hair_volume": 0.72,
            "dye_history": 0.68,
            "current_color": current_color_confidence,
            "target_color": target_color_confidence,
        }
        vision_debug = None
        vision_error = None
        if vision_analysis:
            current_color = deepcopy(vision_analysis["current_color"])
            current_color_options = deepcopy(vision_analysis["current_color_options"])
            if media_item is None and vision_analysis.get("target_color"):
                target_color = deepcopy(vision_analysis["target_color"])
            target_color_options = deepcopy(vision_analysis.get("target_color_options") or [])
            hair_length = vision_analysis.get("hair_length") or hair_length
            hair_volume = vision_analysis.get("hair_volume") or hair_volume
            dye_history = normalize_dye_history(vision_analysis.get("dye_history") or dye_history)
            attribute_confidences.update(vision_analysis.get("attribute_confidences") or {})
            vision_debug = {
                "provider": vision_analysis.get("raw", {}).get("provider"),
                "model": vision_analysis.get("raw", {}).get("model"),
                "fallback_reason": vision_analysis.get("fallback_reason"),
                "analysis_summary": vision_analysis.get("raw", {}).get("analysis_summary"),
                "error_message": vision_analysis.get("raw", {}).get("error_message"),
            }
            if vision_analysis.get("fallback_reason"):
                vision_error = (
                    vision_analysis.get("raw", {}).get("error_message")
                    or vision_analysis.get("fallback_reason")
                )
        elif current_color_analysis:
            current_color = deepcopy(current_color_analysis["color"])
            current_color_options = deepcopy(current_color_analysis["color_options"])
            attribute_confidences["current_color"] = float(current_color.get("confidence", 0.0))
            vision_debug = {
                "provider": current_color_analysis.get("raw", {}).get("provider"),
                "fallback_reason": current_color_analysis.get("fallback_reason"),
            }

        profile = {
            "profile_id": profile_id,
            "status": "failed" if vision_error else "need_confirm",
            "entry_video_id": entry_video_id,
            "current_image_id": current_image_id,
            "target_color": target_color,
            "current_hair": {
                "region_mode": "single",
                "color": current_color,
                "color_options": current_color_options,
            },
            "hair_length": hair_length,
            "hair_volume": hair_volume,
            "dye_history": dye_history,
            "attribute_confidences": attribute_confidences,
            "editable_options": deepcopy(EDITABLE_OPTIONS),
        }
        if target_color_options:
            profile["target_color_options"] = target_color_options
        if vision_error:
            profile["vision_error"] = vision_error
        if vision_debug:
            profile["vision_debug"] = vision_debug
        self.profiles[profile_id] = profile
        self._persist("profile", profile_id, profile, user_key)
        return self._public_profile(profile)

    def create_demo_profile(
        self,
        source_profile_id: str,
        entry_video_id: str,
        user_key: str | None = None,
    ) -> dict:
        source = self._require_owned(
            self.profiles,
            source_profile_id,
            "发色画像不存在",
            "profile",
            user_key,
        )
        media_item = MOCK_MEDIA_BY_VIDEO_ID.get(entry_video_id) or MOCK_MEDIA_BY_VIDEO_ID.get(
            source.get("entry_video_id")
        )
        target_color = deepcopy((media_item or {}).get("target_color") or source.get("target_color") or TARGET_BLUE)
        target_key = next(
            (
                key
                for key, item in MOCK_MEDIA_LIBRARY.items()
                if item.get("video_id") == (media_item or {}).get("video_id")
            ),
            "blue",
        )
        current_color = _demo_current_color(target_key)
        current_color_options = _demo_current_color_options(target_key)
        if target_key in {"blue", "purple"}:
            current_hair = {
                "region_mode": "root_mid_end",
                "regions": {
                    "root": {
                        "color": _color("natural_black", 3, "dark", "3 度自然黑新根", 0.88),
                    },
                    "mid": {
                        "color": current_color_options[1],
                    },
                    "end": {
                        "color": current_color,
                        "color_options": deepcopy(current_color_options),
                    },
                },
            }
        else:
            current_hair = {
                "region_mode": "single",
                "color": current_color,
                "color_options": deepcopy(current_color_options),
            }

        profile_id = _id("profile_demo")
        profile = {
            "profile_id": profile_id,
            "status": "confirmed",
            "entry_video_id": (media_item or {}).get("video_id") or entry_video_id,
            "current_image_id": source["current_image_id"],
            "target_color": target_color,
            "current_hair": current_hair,
            "hair_length": "chest",
            "hair_volume": "medium",
            "dye_history": "natural",
            "attribute_confidences": {
                "hair_length": 0.85,
                "hair_volume": 0.72,
                "dye_history": 0.68,
                "current_color": float(current_color.get("confidence", 0.78)),
                "target_color": float(target_color.get("confidence", 0.92)),
            },
            "editable_options": deepcopy(EDITABLE_OPTIONS),
            "demo_mode": True,
            "source_profile_id": source_profile_id,
        }
        self.profiles[profile_id] = profile
        self._persist("profile", profile_id, profile, user_key)
        return self._public_profile(profile)

    def update_profile(self, profile_id: str, update: dict, user_key: str | None = None) -> dict:
        profile = self._require_owned(self.profiles, profile_id, "发色画像不存在", "profile", user_key)
        for field in ("current_hair", "hair_length", "hair_volume", "dye_history", "target_color"):
            if field in update:
                profile[field] = (
                    normalize_dye_history(update[field])
                    if field == "dye_history"
                    else update[field]
                )
        profile["status"] = "confirmed"
        self._persist("profile", profile_id, profile, user_key)
        return {"profile_id": profile_id, "status": "confirmed"}

    def profile_for_rules(self, profile_id: str, user_key: str | None = None) -> dict:
        return deepcopy(self._require_owned(self.profiles, profile_id, "发色画像不存在", "profile", user_key))

    def plan_result(
        self,
        profile_id: str,
        rule_decision: dict | None = None,
        user_key: str | None = None,
    ) -> dict:
        profile = self._require_owned(self.profiles, profile_id, "发色画像不存在", "profile", user_key)
        plan_id = _id("plan")
        task_id = _id("preview")
        black_history = profile["dye_history"] == "dyed_black"
        decision = rule_decision or {
            "feasibility": "salon_required" if black_history else "conditional",
            "summary": (
                "有染黑历史，建议由专业人士处理后再染。"
                if black_history
                else "可以尝试，但金黄底叠加蓝色可能偏青绿。"
            ),
            "reachability_score": 35 if black_history else 78,
            "risks": [
                {
                    "title": "可能偏青绿",
                    "severity": "medium",
                    "reason": "黄底叠加蓝色会影响最终色相。",
                    "suggestion": "可以接受青蓝效果，或先由专业人士处理黄底。",
                }
            ],
            "can_recommend_product": not black_history,
        }
        generation_mode = (
            "current_base"
            if decision["can_recommend_product"]
            else "post_bleach_ideal"
        )
        labels = (
            ["偏深", "标准", "偏浅", "偏色"]
            if generation_mode == "current_base"
            else ["偏深", "标准", "偏浅"]
        )
        # 真实模式下绝不拿演示素材冒充生成结果。任务完成前始终返回空数组。
        images: list[dict] = []
        result = {
            "profile_id": profile_id,
            "plan_id": plan_id,
            "feasibility": decision["feasibility"],
            "summary": decision["summary"],
            "reachability_score": decision["reachability_score"],
            "risks": deepcopy(decision["risks"]),
            "preview_status": "queued",
            "preview_task_id": task_id,
            "preview_images": [],
            "preview_labels": {str(index + 1): label for index, label in enumerate(labels)},
            "route_cards": [
                {"route": "dye", "title": "染色", "recommended": True, "reason": "更接近目标色。"},
                {
                    "route": "color_deposit",
                    "title": "固色",
                    "recommended": False,
                    "reason": "适合浅底色补色或短期改色。",
                },
            ],
            "default_route": "dye",
            "default_preview_level": 2,
            "can_recommend_product": decision["can_recommend_product"],
            "generation_mode": generation_mode,
            "required_base_level": profile.get("target_color", {}).get("level"),
        }
        if "color_rule" in decision:
            result["color_rule"] = deepcopy(decision["color_rule"])
        self.plans[plan_id] = {"result": result, "profile": deepcopy(profile)}
        self.preview_tasks[task_id] = {
            "polls": 0,
            "images": images,
            "labels": labels,
            "profile": deepcopy(profile),
            "rule_decision": deepcopy(decision),
            "generation_mode": generation_mode,
            "status": "queued",
            "error": None,
        }
        self._persist("plan", plan_id, self.plans[plan_id], user_key)
        self._persist("preview_task", task_id, self.preview_tasks[task_id], user_key)
        return deepcopy(result)

    def preview_task(
        self,
        task_id: str,
        user_key: str | None = None,
    ) -> dict:
        task = self._require_owned(self.preview_tasks, task_id, "预览任务不存在", "preview_task", user_key)
        task["polls"] += 1
        self._persist("preview_task", task_id, task, user_key)
        if task.get("status") == "completed":
            return {
                "preview_task_id": task_id,
                "status": "completed",
                "elapsed_seconds": max(1, task["polls"] * 2),
                "preview_images": deepcopy(task["images"]),
            }
        if task.get("status") == "fallback":
            return {
                "preview_task_id": task_id,
                "status": "fallback",
                "elapsed_seconds": max(1, task["polls"] * 2),
                "fallback_message": task.get("error") or "真实生图失败，请稍后重试。",
                "preview_images": deepcopy(task["images"]),
            }
        if task.get("status") == "generating":
            return {
                "preview_task_id": task_id,
                "status": "generating",
                "progress_percent": min(90, max(15, task["polls"] * 15)),
                "elapsed_seconds": max(1, task["polls"] * 2),
                "preview_images": [],
            }
        return {
            "preview_task_id": task_id,
            "status": "queued",
            "progress_percent": 0,
            "elapsed_seconds": max(1, task["polls"] * 2),
            "preview_images": [],
        }

    def begin_preview_generation(self, task_id: str, user_key: str | None = None) -> dict | None:
        task = self._require_owned(self.preview_tasks, task_id, "预览任务不存在", "preview_task", user_key)
        if task.get("status") not in {"queued", "generating"}:
            return None
        task["started"] = True
        task["status"] = "generating"
        self._persist("preview_task", task_id, task, user_key)
        return {
            "profile": deepcopy(task["profile"]),
            "labels": list(task["labels"]),
            "rule_decision": deepcopy(task.get("rule_decision") or {}),
            "generation_mode": task.get("generation_mode", "current_base"),
        }

    def complete_preview_generation(
        self,
        task_id: str,
        images: list[dict],
        user_key: str | None = None,
    ) -> None:
        task = self._require_owned(self.preview_tasks, task_id, "预览任务不存在", "preview_task", user_key)
        task["images"] = deepcopy(images)
        task["status"] = "completed"
        task["error"] = None
        self._persist("preview_task", task_id, task, user_key)

    def fail_preview_generation(
        self,
        task_id: str,
        error: str,
        user_key: str | None = None,
    ) -> None:
        task = self._require_owned(self.preview_tasks, task_id, "预览任务不存在", "preview_task", user_key)
        task["status"] = "fallback"
        task["error"] = f"真实生图失败：{error}"
        self._persist("preview_task", task_id, task, user_key)

    def pending_preview_tasks(self) -> list[tuple[str, str]]:
        tasks: list[tuple[str, str]] = []
        for task_id, task in self.preview_tasks.items():
            if task.get("status") in {"queued", "generating"}:
                tasks.append((task_id, self._owners.get(("preview_task", task_id), "anonymous")))
        return tasks

    def recommendations(
        self,
        request: dict,
        user_key: str | None = None,
        product_kb: Any | None = None,
    ) -> dict:
        plan_record = self._require_owned(self.plans, request["plan_id"], "方案不存在", "plan", user_key)
        plan = plan_record["result"]
        profile = plan_record["profile"]
        recommendation_id = _id("recommendation")
        color_rule = plan.get("color_rule", {})
        result_quality = color_rule.get("result_quality")
        allow_assumed_bleach = plan.get("generation_mode") == "post_bleach_ideal"
        if not plan["can_recommend_product"] and not allow_assumed_bleach:
            risk = plan["risks"][0] if plan.get("risks") else {}
            result = {
                "profile_id": request["profile_id"],
                "plan_id": request["plan_id"],
                "recommendation_id": recommendation_id,
                "status": "no_match",
                "selected_route": request["selected_route"],
                "primary_product": None,
                "other_products": [],
                "message": risk.get("suggestion") or "当前方案不建议居家染发，暂不推荐商品。",
                "color_rule": deepcopy(color_rule) if color_rule else None,
            }
        else:
            products = (
                product_kb.recommend(
                    target_color=profile["target_color"],
                    selected_route=request["selected_route"],
                    budget=request["budget"],
                    hair_length=profile.get("hair_length", "shoulder"),
                )
                if product_kb
                else [self._product_with_plan_risk(plan)]
            )
            if not products:
                result = {
                    "profile_id": request["profile_id"],
                    "plan_id": request["plan_id"],
                    "recommendation_id": recommendation_id,
                    "status": "no_match",
                    "selected_route": request["selected_route"],
                    "primary_product": None,
                    "other_products": [],
                    "message": "商品库中没有同时满足目标色、路线和预算的 SKU。",
                    "color_rule": deepcopy(color_rule) if color_rule else None,
                }
            else:
                result = {
                    "profile_id": request["profile_id"],
                    "plan_id": request["plan_id"],
                    "recommendation_id": recommendation_id,
                    "status": "available",
                    "selected_route": request["selected_route"],
                    "primary_product": products[0],
                    "other_products": products[1:],
                    "color_rule": deepcopy(color_rule) if color_rule else None,
                    "risk_level": "medium" if result_quality == "biased" else "low",
                    "risk_summary": (
                        "以下商品按已经漂到建议底色后的条件推荐。"
                        if allow_assumed_bleach
                        else "当前底色可推荐商品，但需要明确接受偏色风险。"
                        if result_quality == "biased"
                        else "当前底色在官方效果矩阵中为正常推荐。"
                    ),
                }
        self.recommendation_records[recommendation_id] = deepcopy(result)
        self._persist("recommendation", recommendation_id, result, user_key)
        return result

    def create_archive(self, request: dict, user_key: str | None = None) -> dict:
        profile = self._require_owned(self.profiles, request["profile_id"], "发色画像不存在", "profile", user_key)
        plan = self._require_owned(self.plans, request["plan_id"], "方案不存在", "plan", user_key)["result"]
        recommendation = self._require_owned(
            self.recommendation_records,
            request["recommendation_id"],
            "商品推荐不存在",
            "recommendation",
            user_key,
        )
        products = [
            item
            for item in [recommendation.get("primary_product"), *recommendation.get("other_products", [])]
            if item
        ]
        product = next((item for item in products if item.get("sku_id") == request["sku_id"]), None)
        if not product:
            raise ValueError("当前没有可保存的商品推荐")
        media_item = MOCK_MEDIA_BY_VIDEO_ID.get(profile["entry_video_id"])
        selected_preview_level = request.get("selected_preview_level", plan["default_preview_level"])
        selected_preview_image = self._selected_preview_image(
            plan,
            int(selected_preview_level),
            user_key=user_key,
        )
        archive_id = _id("archive")
        detail = {
            "archive_id": archive_id,
            "created_at": _now(),
            "purchase_status": request["purchase_status"],
            "entry_video_id": profile["entry_video_id"],
            "profile_id": profile["profile_id"],
            "current_image_id": profile["current_image_id"],
            "current_image_url": self._image_url(profile["current_image_id"], media_type="current_hair"),
            "selected_preview_image_url": (selected_preview_image or {}).get("url"),
            "profile_snapshot": {
                key: deepcopy(profile[key])
                for key in ("current_hair", "target_color", "hair_length", "hair_volume", "dye_history")
            },
            "plan_snapshot": {
                "plan_id": plan["plan_id"],
                "feasibility": plan["feasibility"],
                "summary": plan["summary"],
                "reachability_score": plan["reachability_score"],
                "selected_route": request.get("selected_route", plan["default_route"]),
                "selected_preview_level": selected_preview_level,
                "default_preview_level": plan["default_preview_level"],
                "risks": deepcopy(plan["risks"]),
            },
            "product_snapshot": {**deepcopy(product), "recommendation_id": request["recommendation_id"]},
            "tutorial_video_id": (media_item or {}).get("tutorial_video_id", "tutorial_001"),
            "tutorial_available": True,
            "after_video_url": None,
        }
        self.archives[archive_id] = detail
        self._persist("archive", archive_id, detail, user_key)
        return {"archive_id": archive_id, "created_at": detail["created_at"]}

    def archive_list(self, user_key: str | None = None) -> dict:
        archives = []
        for detail in sorted(self.archives.values(), key=lambda item: item["created_at"], reverse=True):
            if not self._owned_by("archive", detail["archive_id"], user_key):
                continue
            current_hair = detail["profile_snapshot"]["current_hair"]
            current_color = current_hair.get("color") or current_hair["regions"]["end"]["color"]
            archives.append(
                {
                    "archive_id": detail["archive_id"],
                    "target_color_name": detail["profile_snapshot"]["target_color"]["display_name"],
                    "current_color_name": current_color["display_name"],
                    "product_name": detail["product_snapshot"]["product_name"],
                    "shade_name": detail["product_snapshot"]["shade_name"],
                    "purchase_status": detail["purchase_status"],
                    "created_at": detail["created_at"],
                    "tutorial_available": True,
                }
            )
        return {"archives": archives}

    def archive(self, archive_id: str, user_key: str | None = None) -> dict:
        detail = deepcopy(self._require_owned(self.archives, archive_id, "染发档案不存在", "archive", user_key))
        return self._archive_with_media_urls(detail, user_key=user_key)

    def _archive_with_media_urls(self, detail: dict, user_key: str | None = None) -> dict:
        if not detail.get("current_image_url"):
            detail["current_image_url"] = self._image_url(detail.get("current_image_id"), media_type="current_hair")
        if not detail.get("selected_preview_image_url"):
            plan_id = detail.get("plan_snapshot", {}).get("plan_id")
            preview_level = int(detail.get("plan_snapshot", {}).get("selected_preview_level") or 0)
            plan_record = self.plans.get(plan_id) if plan_id else None
            if plan_record:
                selected_preview = self._selected_preview_image(
                    plan_record["result"],
                    preview_level,
                    user_key=user_key,
                )
                detail["selected_preview_image_url"] = (selected_preview or {}).get("url")
        return detail

    def _selected_preview_image(
        self,
        plan: dict,
        preview_level: int,
        user_key: str | None = None,
    ) -> dict | None:
        preview_images = list(plan.get("preview_images") or [])
        task_id = plan.get("preview_task_id")
        if task_id and self._owned_by("preview_task", task_id, user_key):
            task = self.preview_tasks.get(task_id) or {}
            preview_images = list(task.get("images") or preview_images)
        usable = [item for item in preview_images if item.get("url")]
        # 现在只生成一张标准效果图（preview_level=1），历史上是五档。
        # 找不到指定档位时退回第一张可用的，避免归档丢图。
        return next(
            (item for item in usable if int(item.get("preview_level") or 0) == preview_level),
            usable[0] if usable else None,
        )

    def create_session(self, archive_id: str, user_key: str | None = None) -> dict:
        archive = self._require_owned(self.archives, archive_id, "染发档案不存在", "archive", user_key)
        tutorial_video_id = archive.get("tutorial_video_id") or "tutorial_001"
        media_item = MOCK_MEDIA_BY_TUTORIAL_ID.get(tutorial_video_id)
        tutorial_steps = _tutorial_steps_for_video_id(tutorial_video_id)
        for session in sorted(self.sessions.values(), key=lambda item: item.get("created_at") or "", reverse=True):
            session_id = session.get("tutorial_session_id")
            if (
                session.get("archive_id") == archive_id
                and session.get("status") not in {"completed", "aborted"}
                and session_id
                and self._owned_by("session", session_id, user_key)
            ):
                session["tutorial_video"] = {
                    "video_id": tutorial_video_id,
                    "url": (media_item or {}).get("tutorial_url", TUTORIAL_VIDEO_URL),
                    "title": _tutorial_display_title(media_item),
                    "color_name": (media_item or {}).get("color_name"),
                    "brand": (media_item or {}).get("brand"),
                    "tutorial_type": (media_item or {}).get("tutorial_type"),
                }
                current_step_no = int(session.get("current_step", {}).get("step_no") or 1)
                current_index = min(max(current_step_no - 1, 0), len(tutorial_steps) - 1)
                session["tutorial_steps"] = deepcopy(tutorial_steps)
                session["current_step"] = deepcopy(tutorial_steps[current_index])
                session["completed_step_count"] = min(
                    int(session.get("completed_step_count") or current_index),
                    max(0, len(tutorial_steps) - 1),
                )
                self._persist("session", session_id, session, user_key)
                return deepcopy(session)
        session_id = _id("tutorial_session")
        created_at = _now()
        session = {
            "tutorial_session_id": session_id,
            "archive_id": archive_id,
            "status": "active",
            "created_at": created_at,
            "tutorial_video": {
                "video_id": tutorial_video_id,
                "url": (media_item or {}).get("tutorial_url", TUTORIAL_VIDEO_URL),
                "title": _tutorial_display_title(media_item),
                "color_name": (media_item or {}).get("color_name"),
                "brand": (media_item or {}).get("brand"),
                "tutorial_type": (media_item or {}).get("tutorial_type"),
            },
            "tutorial_steps": deepcopy(tutorial_steps),
            "current_step": deepcopy(tutorial_steps[0]),
            "step_end_tts": {
                "text": "你在这一步的操作过程中有什么问题，随时可以问我。",
                "audio_url": None,
            },
            "awaiting_voice_input": False,
            "last_event_id": None,
            "completed_step_count": 0,
        }
        self.sessions[session_id] = session
        self._persist("session", session_id, session, user_key)
        return deepcopy(session)

    def session(self, session_id: str, user_key: str | None = None) -> dict:
        return deepcopy(self._require_owned(self.sessions, session_id, "教程会话不存在", "session", user_key))

    def voice_event(self, session_id: str, event_id: str, user_key: str | None = None) -> dict | None:
        self._require_owned(self.sessions, session_id, "教程会话不存在", "session", user_key)
        event = self.voice_events.get((session_id, event_id))
        return deepcopy(event) if event is not None else None

    def voice_input(self, session_id: str, current_step_id: str, event_id: str, filename: str) -> dict:
        command = "finish" if "finish" in filename else "next" if "next" in filename else "question"
        transcript = "结束了" if command == "finish" else "下一步" if command == "next" else "这一步需要注意什么？"
        return self.voice_input_from_transcript(
            session_id,
            current_step_id,
            event_id,
            transcript=transcript,
            intent=command,
            tts_audio_url=None,
        )

    def voice_input_from_transcript(
        self,
        session_id: str,
        current_step_id: str,
        event_id: str,
        *,
        transcript: str,
        intent: str,
        tts_audio_url: str | None,
        answer_text: str | None = None,
        answer_meta: dict | None = None,
        user_key: str | None = None,
    ) -> dict:
        event_key = (session_id, event_id)
        if event_key in self.voice_events:
            return deepcopy(self.voice_events[event_key])
        session = self._require_owned(self.sessions, session_id, "教程会话不存在", "session", user_key)
        tutorial_steps = session.get("tutorial_steps") or _tutorial_steps_for_video_id(
            session.get("tutorial_video", {}).get("video_id")
        )
        current_index = next(
            (item["step_no"] - 1 for item in tutorial_steps if item["step_id"] == current_step_id),
            0,
        )
        if intent == "finish" and current_index < len(tutorial_steps) - 1:
            intent = "next"
        if intent == "silence":
            session["awaiting_voice_input"] = True
            result = {
                "action": "silence",
                "tts_text": "我没有听清，请再说一次。",
                "tts_audio_url": tts_audio_url,
            }
        elif intent == "finish":
            session["status"] = "completed"
            result = {
                "action": "capture_after_photo",
                "asr_transcript": transcript,
                "tts_text": "好的，本次染发教程已结束。现在拍摄你的染后照片，生成专属短视频吧。",
                "tts_audio_url": tts_audio_url,
            }
        elif intent == "replay":
            session["awaiting_voice_input"] = False
            result = {
                "action": "replay_current_step",
                "asr_transcript": transcript,
                "current_step": deepcopy(session["current_step"]),
                "tts_text": "好的，我再播放一遍当前步骤。",
                "tts_audio_url": tts_audio_url,
            }
        elif intent == "next":
            if current_index >= len(tutorial_steps) - 1:
                session["status"] = "completed"
                result = {
                    "action": "capture_after_photo",
                    "asr_transcript": transcript,
                    "tts_text": "全部步骤已经完成。现在拍摄你的染后照片吧。",
                    "tts_audio_url": tts_audio_url,
                }
            else:
                session["current_step"] = deepcopy(tutorial_steps[current_index + 1])
                session["completed_step_count"] = current_index + 1
                session["awaiting_voice_input"] = False
                result = {
                    "action": "play_next_step",
                    "asr_transcript": transcript,
                    "current_step": deepcopy(session["current_step"]),
                    "step_end_tts": {
                        "text": "这一步有什么问题，随时可以问我。",
                        "audio_url": tts_audio_url,
                    },
                }
        else:
            session["awaiting_voice_input"] = True
            answer = (
                answer_text
                or "先按当前步骤均匀覆盖。若商品包装说明与教程不同，请以商品官方说明为准。"
            )
            result = {
                "action": "answer",
                "asr_transcript": transcript,
                "tts_text": answer,
                "tts_audio_url": tts_audio_url,
                "answer": answer_meta or {"answer_id": "fallback", "category": "当前步骤操作问答"},
                "next_prompt": "完成后可以说下一步，继续后面的操作。",
            }
        session["last_event_id"] = event_id
        self.voice_events[event_key] = deepcopy(result)
        self._persist("session", session_id, session, user_key)
        self._persist("voice_event", f"{session_id}:{event_id}", result, user_key)
        return result

    def complete_tutorial(
        self,
        session_id: str,
        qa_summary: list[str] | None = None,
        user_key: str | None = None,
    ) -> dict:
        session = self._require_owned(self.sessions, session_id, "教程会话不存在", "session", user_key)
        archive = self._require_owned(self.archives, session["archive_id"], "染发档案不存在", "archive", user_key)
        completed_at = _now()
        session["status"] = "completed"
        session["completed_at"] = completed_at
        total_steps = int(session.get("current_step", {}).get("total_steps") or len(TUTORIAL_STEPS))
        completed_steps = max(total_steps, int(session.get("completed_step_count") or 0))
        total_minutes = self._tutorial_elapsed_minutes(session, completed_at)
        record = {
            "completed_at": completed_at,
            "total_minutes": total_minutes,
            "completed_steps": completed_steps,
            "total_steps": total_steps,
            "qa_summary": self._completion_qa_summary(session_id, qa_summary),
            "care_notes": self._completion_care_notes(archive),
        }
        archive["completion_record"] = deepcopy(record)
        self._persist("session", session_id, session, user_key)
        self._persist("archive", archive["archive_id"], archive, user_key)
        return deepcopy(record)

    def after_photo(self, session_id: str, after_image_id: str, user_key: str | None = None) -> dict:
        session = self._require_owned(self.sessions, session_id, "教程会话不存在", "session", user_key)
        archive = self._require_owned(self.archives, session["archive_id"], "染发档案不存在", "archive", user_key)
        existing_task_id = self._find_after_task(session_id, after_image_id, user_key)
        if existing_task_id is not None:
            existing_task = self._require_owned(
                self.after_tasks,
                existing_task_id,
                "短视频任务不存在",
                "after_task",
                user_key,
            )
            if existing_task.get("status") == "failed":
                existing_task.update(
                    {
                        "polls": 0,
                        "status": "queued",
                        "progress_percent": 0,
                        "message": "正在排队重新生成你的染后转场视频。",
                        "error": None,
                        "fallback_message": None,
                    }
                )
                self._persist("after_task", existing_task_id, existing_task, user_key)
            return self._after_task_response(existing_task_id, existing_task)
        task_id = _id("after_video")
        self.after_tasks[task_id] = {
            "polls": 0,
            "session_id": session_id,
            "archive_id": session["archive_id"],
            "before_image_id": archive.get("current_image_id"),
            "after_image_id": after_image_id,
            "status": "queued",
            "progress_percent": 0,
            "message": "正在排队生成你的染后转场视频。",
            "error": None,
        }
        self._persist("after_task", task_id, self.after_tasks[task_id], user_key)
        return {
            "generation_task_id": task_id,
            "status": "queued",
            "message": "正在排队生成你的染后转场视频。",
        }

    def after_task(self, task_id: str, user_key: str | None = None) -> dict:
        task = self._require_owned(self.after_tasks, task_id, "短视频任务不存在", "after_task", user_key)
        task["polls"] += 1
        self._persist("after_task", task_id, task, user_key)
        return self._after_task_response(task_id, task)

    @staticmethod
    def _after_task_response(task_id: str, task: dict) -> dict:
        status = task.get("status", "queued")
        if status in {"queued", "generating"}:
            return {
                "generation_task_id": task_id,
                "status": "generating",
                "progress_percent": int(task.get("progress_percent") or 0),
                "message": task.get("message") or "正在生成你的染后转场视频，请稍候。",
            }
        if status == "completed":
            return {
                "generation_task_id": task_id,
                "status": "completed",
                "url": task["url"],
                "storage_key": task["storage_key"],
                "cover_url": task["cover_url"],
                "cover_storage_key": task["cover_storage_key"],
            }
        return {
            "generation_task_id": task_id,
            "status": "failed",
            "error_message": task.get("error") or "transition_video_generation_failed",
            "fallback_message": task.get("fallback_message")
            or "转场视频生成失败，可稍后重试；你的教程完成记录不受影响。",
        }

    def begin_after_video_generation(self, task_id: str, user_key: str | None = None) -> dict | None:
        task = self._require_owned(self.after_tasks, task_id, "短视频任务不存在", "after_task", user_key)
        if task.get("status") not in {"queued", "generating"}:
            return None
        before_image_id = task.get("before_image_id")
        after_image_id = task.get("after_image_id")
        before_path = self.image_path(before_image_id, media_type="current_hair") if before_image_id else None
        after_path = self.image_path(after_image_id, media_type="after") if after_image_id else None
        if before_path is None:
            raise RuntimeError("before_image_not_found")
        if after_path is None:
            raise RuntimeError("after_image_not_found")
        task["status"] = "generating"
        task["progress_percent"] = max(12, int(task.get("progress_percent") or 0))
        task["message"] = "正在生成你的染后转场视频，请稍候。"
        self._persist("after_task", task_id, task, user_key)
        return {"before_image_path": before_path, "after_image_path": after_path}

    def complete_after_video_generation(
        self,
        task_id: str,
        result: dict,
        user_key: str | None = None,
    ) -> None:
        task = self._require_owned(self.after_tasks, task_id, "短视频任务不存在", "after_task", user_key)
        task.update(
            {
                "status": "completed",
                "progress_percent": 100,
                "message": "染后转场视频已生成。",
                "url": result["url"],
                "storage_key": result["storage_key"],
                "cover_url": result["cover_url"],
                "cover_storage_key": result["cover_storage_key"],
                "provider": result.get("provider"),
                "model": result.get("model"),
                "prompt": result.get("prompt"),
                "error": None,
            }
        )
        self._persist("after_task", task_id, task, user_key)

    def fail_after_video_generation(
        self,
        task_id: str,
        error: str,
        user_key: str | None = None,
    ) -> None:
        task = self._require_owned(self.after_tasks, task_id, "短视频任务不存在", "after_task", user_key)
        task.update(
            {
                "status": "failed",
                "progress_percent": 0,
                "message": "染后转场视频生成失败。",
                "error": error,
                "fallback_message": "转场视频生成失败，可稍后重试；你的教程完成记录不受影响。",
            }
        )
        self._persist("after_task", task_id, task, user_key)

    def pending_after_video_tasks(self) -> list[tuple[str, str]]:
        tasks: list[tuple[str, str]] = []
        for task_id, task in self.after_tasks.items():
            if task.get("status") in {"queued", "generating"}:
                tasks.append((task_id, self._owners.get(("after_task", task_id), "anonymous")))
        return tasks

    def _find_after_task(
        self,
        session_id: str,
        after_image_id: str,
        user_key: str | None = None,
    ) -> str | None:
        for task_id, task in self.after_tasks.items():
            if (
                task.get("session_id") == session_id
                and task.get("after_image_id") == after_image_id
                and self._owned_by("after_task", task_id, user_key)
            ):
                return task_id
        return None

    @staticmethod
    def _completion_qa_summary_from_event(event: dict) -> str | None:
        if event.get("action") != "answer":
            return None
        answer = str(event.get("tts_text") or "").strip()
        if not answer:
            return None
        answer_meta = event.get("answer") if isinstance(event.get("answer"), dict) else {}
        topic = str(answer_meta.get("matched_query") or answer_meta.get("category") or "").strip()
        return _qa_summary_statement(answer, topic=topic)

    def _completion_qa_summary(
        self,
        session_id: str,
        submitted_summary: list[str] | None,
    ) -> list[str]:
        merged: list[str] = []
        for item in submitted_summary or []:
            text = _qa_summary_statement(str(item))
            if text and text not in merged:
                merged.append(text)
        for event_session_id, _event_id in self.voice_events:
            if event_session_id != session_id:
                continue
            text = self._completion_qa_summary_from_event(self.voice_events[(event_session_id, _event_id)])
            if text and text not in merged:
                merged.append(text)
        return merged[-4:]

    @staticmethod
    def _tutorial_elapsed_minutes(session: dict, completed_at: str) -> int:
        started_at = session.get("created_at")
        if started_at:
            try:
                start = datetime.fromisoformat(str(started_at))
                end = datetime.fromisoformat(completed_at)
                return max(1, round((end - start).total_seconds() / 60))
            except ValueError:
                pass
        tutorial_steps = session.get("tutorial_steps") or _tutorial_steps_for_video_id(
            session.get("tutorial_video", {}).get("video_id")
        )
        duration_seconds = sum(
            max(0, int(step["end_time_ms"]) - int(step["start_time_ms"]))
            for step in tutorial_steps
        ) / 1000
        return max(1, round(duration_seconds / 60))

    @staticmethod
    def _completion_care_notes(archive: dict) -> list[str]:
        notes = [
            "前 48 小时尽量减少洗头。",
            "使用温和、偏凉的水清洗，减少快速掉色。",
        ]
        risks = archive.get("plan_snapshot", {}).get("risks") or []
        if risks:
            notes.append(str(risks[0].get("suggestion") or risks[0].get("reason") or "如头皮出现持续不适，请停止使用并及时咨询专业人士。"))
        else:
            notes.append("如头皮出现持续不适，请停止使用并及时咨询专业人士。")
        return notes

    @staticmethod
    def _require(items: dict, key: str, message: str) -> dict:
        item = items.get(key)
        if item is None:
            raise KeyError(message)
        return item

    def _require_owned(
        self,
        items: dict,
        key: str,
        message: str,
        entity_type: str,
        user_key: str | None,
    ) -> dict:
        item = self._require(items, key, message)
        if not self._owned_by(entity_type, key, user_key):
            raise KeyError(message)
        return item

    def _owned_by(self, entity_type: str, entity_id: str, user_key: str | None) -> bool:
        owner = self._owners.get((entity_type, entity_id))
        return owner is None or owner == self._user_key(user_key)

    def _persist(
        self,
        entity_type: str,
        entity_id: str,
        payload: dict,
        user_key: str | None,
    ) -> None:
        normalized_user_key = self._user_key(user_key)
        self._owners[(entity_type, entity_id)] = normalized_user_key
        if self.database is None:
            return
        self.database.save_state(
            user_key=normalized_user_key,
            entity_type=entity_type,
            entity_id=entity_id,
            payload=json.loads(json.dumps(payload, ensure_ascii=False)),
        )

    @staticmethod
    def _user_key(user_key: str | None) -> str:
        return user_key.strip() if user_key else "anonymous"

    @staticmethod
    def _public_profile(profile: dict) -> dict:
        public = {
            key: deepcopy(value)
            for key, value in profile.items()
            if key not in {"entry_video_id", "current_image_id", "vision_debug"}
        }
        # 磁盘上可能存着拆分前写入的旧枚举，出口统一归一化，
        # 否则前端 optionLabel 找不到会把 bleached_1_2 这种原始值显示给用户
        if "dye_history" in public:
            public["dye_history"] = normalize_dye_history(public["dye_history"])
        if isinstance(public.get("editable_options"), dict):
            public["editable_options"] = deepcopy(EDITABLE_OPTIONS)
        return public

    def _product_with_plan_risk(self, plan: dict) -> dict:
        product = self._product()
        color_rule = plan.get("color_rule", {})
        if color_rule.get("result_quality") != "biased":
            return product

        risk = plan["risks"][0] if plan.get("risks") else {}
        risk_reason = risk.get("reason") or "当前底色命中偏色规则。"
        official_color = color_rule.get("official_result_color")
        product["suitable_reason"] = (
            f"{product['suitable_reason']} 但当前底色命中官方效果图偏色标记，适合能接受近似效果的用户。"
        )
        product["possible_risk"] = risk_reason
        product["color_rule_risk"] = {
            "result_quality": color_rule.get("result_quality"),
            "matched_color_name": color_rule.get("matched_color_name"),
            "current_level": color_rule.get("current_level"),
            "matrix_color_id": color_rule.get("matrix_color_id"),
            "official_result_color": official_color,
            "risk_reason": risk_reason,
            "suggestion": risk.get("suggestion"),
        }
        return product

    @staticmethod
    def _product() -> dict:
        return {
            "sku_id": "sku_ranli_blue_001",
            "brand": "染鲤",
            "product_name": "染发膏",
            "shade_name": "蓝色",
            "product_type": "dye",
            "badge": "视频同款商品",
            "is_video_same_product": True,
            "url": "/media/assets/ranli_blue.svg",
            "suitable_reason": "适合当前底色和本次选择的染色方案。",
            "possible_risk": "发尾有旧色残留时，最终颜色可能更深或不均匀。",
            "usage": {
                "units_needed": 2,
                "units_label": "建议购买 2 支",
                "method": "干发使用",
                "waiting_minutes": 30,
                "short_instruction": "干发分区涂抹，均匀覆盖后停留 30 分钟。",
            },
            "price": {
                "unit_price": 89,
                "total_price": 178,
                "currency": "CNY",
                "collected_at": "2026-07-25",
            },
            "purchase_url": "https://example.com/product/ranli-blue",
            "purchase_mode": "external_link",
            "duration": "维持时间受洗头频率和后续护理影响。",
        }

    def _create_static_assets(self) -> None:
        self._write_svg("assets/blue_cover.svg", "蓝色染发灵感", "#294667", "#89b9db")
        self._write_svg("assets/blue_target.svg", "目标色：海盐蓝", "#264f77", "#add8ee")
        self._write_svg("assets/ranli_blue.svg", "染鲤 蓝色染发膏", "#1e4e7a", "#d4ecff")
        self._write_svg("assets/after_cover.svg", "你的染后效果", "#496e9a", "#bed9f1")

    def _write_svg(self, storage_key: str, label: str, base: str, accent: str) -> None:
        path = self.media_dir / storage_key
        if path.exists():
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            f"""<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{base}"/><stop offset="1" stop-color="{accent}"/></linearGradient></defs>
<rect width="800" height="1000" fill="url(#g)"/>
<circle cx="400" cy="360" r="190" fill="#ffffff" fill-opacity=".15"/>
<path d="M260 665c25-230 255-230 280 0v120H260z" fill="#ffffff" fill-opacity=".23"/>
<text x="400" y="850" fill="#ffffff" font-family="Arial, sans-serif" font-size="42" font-weight="700" text-anchor="middle">{escape(label)}</text>
<text x="400" y="905" fill="#ffffff" fill-opacity=".78" font-family="Arial, sans-serif" font-size="24" text-anchor="middle">莓发 Mock API</text>
</svg>""",
            encoding="utf-8",
        )
