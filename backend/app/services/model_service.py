"""Unified model service wrapper for vision, ASR, intent and TTS."""

from __future__ import annotations

import base64
import colorsys
import importlib.util
import io
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any, Literal

from PIL import Image

from ..config import Settings
from .http_client import UpstreamError, post_json


logger = logging.getLogger(__name__)


TutorialIntent = Literal["next", "finish", "question", "silence", "replay"]


@dataclass(frozen=True)
class TranscribeResult:
    has_voice: bool
    transcript: str
    raw_text: str | None = None
    language: str | None = "zh"
    confidence: float | None = None


@dataclass(frozen=True)
class TTSResult:
    audio_url: str | None
    provider: str
    fallback_reason: str | None = None


@dataclass(frozen=True)
class HairColorAnalysis:
    color: dict[str, Any]
    color_options: list[dict[str, Any]]
    raw: dict[str, Any]
    fallback_reason: str | None = None


@dataclass(frozen=True)
class HairProfileVisionAnalysis:
    current_color: dict[str, Any]
    current_color_options: list[dict[str, Any]]
    target_color: dict[str, Any] | None
    target_color_options: list[dict[str, Any]]
    hair_length: str | None
    hair_volume: str | None
    dye_history: str | None
    attribute_confidences: dict[str, float]
    raw: dict[str, Any]
    fallback_reason: str | None = None


class ModelService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._sensevoice = None
        self._siliconflow_asr = None
        self._hair_vision_color_recognizer: ModuleType | None = None
        self._hair_full_pipeline_engine: ModuleType | None = None

    def analyze_hair_profile(
        self,
        *,
        current_image_path: Path,
        target_image_path: Path | None,
    ) -> HairProfileVisionAnalysis | None:
        """Analyze current hair and target reference through a multimodal model."""
        if self.settings.mock_models:
            return None

        if (
            self.settings.vision_provider == "openai_next"
            and self.settings.openai_next_api_key
            and target_image_path is not None
            and target_image_path.exists()
        ):
            try:
                return self._openai_next_analyze_hair_profile(
                    current_image_path=current_image_path,
                    target_image_path=target_image_path,
                )
            except Exception as error:  # pragma: no cover - network/model fallback
                return self._failed_hair_profile_analysis(
                    reason=type(error).__name__,
                    error_message=str(error)[:300],
                )

        fallback = self.analyze_hair_color(current_image_path)
        if fallback is None:
            return None
        return HairProfileVisionAnalysis(
            current_color=fallback.color,
            current_color_options=fallback.color_options,
            target_color=None,
            target_color_options=[],
            hair_length=None,
            hair_volume=None,
            dye_history=None,
            attribute_confidences={"current_color": fallback.color.get("confidence", 0.0)},
            raw=fallback.raw,
            fallback_reason=(
                fallback.fallback_reason
                or ("openai_next_not_configured" if self.settings.vision_provider == "openai_next" else None)
            ),
        )

    def analyze_hair_color(self, image_path: Path) -> HairColorAnalysis | None:
        """Analyze a current-hair image through the local hair vision package.

        Returns None in mock mode so the existing deterministic demo profile stays
        unchanged. In real mode, failures are converted to a conservative fallback
        result instead of breaking the user flow.
        """
        if self.settings.mock_models:
            return None

        if not image_path.exists():
            return self._fallback_hair_color_analysis("image_not_found")

        try:
            engine = self._load_hair_full_pipeline_engine()
            result = engine.extract_color_from_image(
                image_path,
                use_hair_segmentation=False,
            )
            matches = engine.match_to_palette(result["lab"], top_n=3)
            return self._hair_analysis_from_full_pipeline_result(result, matches)
        except Exception as error:  # pragma: no cover - defensive runtime fallback
            full_pipeline_error = type(error).__name__

        try:
            recognizer = self._load_hair_vision_color_recognizer()
            result = recognizer.recognize(str(image_path), top_n=3)
            analysis = self._hair_analysis_from_recognizer_result(result)
            return HairColorAnalysis(
                color=analysis.color,
                color_options=analysis.color_options,
                raw={
                    **analysis.raw,
                    "fallback_from": "hair_full_pipeline",
                    "fallback_reason": full_pipeline_error,
                },
                fallback_reason=f"hair_full_pipeline:{full_pipeline_error}",
            )
        except Exception as error:  # pragma: no cover - defensive runtime fallback
            return self._fallback_hair_color_analysis(
                f"hair_full_pipeline:{full_pipeline_error};hair_vision:{type(error).__name__}"
            )

    def transcribe_audio(self, audio_path: Path, *, original_filename: str = "") -> TranscribeResult:
        if self.settings.mock_models:
            return self._mock_transcribe(original_filename)

        if self.settings.asr_provider == "siliconflow":
            if not self.settings.siliconflow_api_key:
                # Never fail the tutorial over a missing key: fall back to the
                # local model, which is still bundled and fully supported.
                logger.warning("SILICONFLOW_API_KEY missing, falling back to local SenseVoice")
                return self._sensevoice_transcribe(audio_path)
            try:
                return self._siliconflow_transcribe(audio_path)
            except UpstreamError:
                logger.exception("SiliconFlow ASR failed, falling back to local SenseVoice")
                return self._sensevoice_transcribe(audio_path)

        return self._sensevoice_transcribe(audio_path)

    def classify_tutorial_intent(self, transcript: str) -> TutorialIntent:
        normalized = re.sub(r"\s+", "", transcript.strip().lower())
        if not normalized:
            return "silence"

        finish_words = (
            "结束了",
            "结束教程",
            "结束染发",
            "完成染发",
            "染完了",
            "做完了",
            "完成了",
            "搞定了",
            "不用继续",
        )
        next_words = ("下一步", "继续下一步", "好了下一步", "进入下一步", "继续")
        replay_words = ("重新播放", "再播放", "重播", "再看一遍", "重复播放", "放一遍")
        question_marks = ("吗", "么", "?", "？", "怎么", "为什么", "怎么办")

        if any(word in normalized for word in finish_words):
            # Avoid ending on questions like "结束了吗".
            if any(mark in normalized for mark in question_marks) and "结束了" not in normalized:
                return "question"
            return "finish"
        if any(word in normalized for word in replay_words):
            return "replay"
        if any(word in normalized for word in next_words):
            return "next"
        llm_intent = self._openai_next_classify_intent(transcript)
        if llm_intent in {"next", "finish", "question", "silence", "replay"}:
            return llm_intent
        return "question"

    def rewrite_operation_question(self, *, transcript: str, context: dict[str, Any]) -> str:
        fallback = transcript.strip()
        if self.settings.mock_models or not self.settings.openai_next_api_key:
            return fallback

        prompt = (
            "把用户在染发教程中的口语问题改写成适合知识库检索的短查询。"
            "只输出改写后的问题，不要解释。"
            f"当前步骤：{context.get('step_title')}。"
            f"用户原话：{transcript}"
        )
        answer = self._chat_completion(
            system="你只做检索 query 改写，不回答问题。",
            user=prompt,
            max_tokens=80,
            temperature=0.1,
            timeout=self.settings.llm_fast_timeout_seconds,
        )
        return (answer or fallback).strip()[:120]

    def polish_operation_answer(
        self,
        *,
        answer_record: dict[str, Any],
        transcript: str,
        context: dict[str, Any],
    ) -> str:
        fallback = str(answer_record.get("answer_text") or "").strip()
        if self.settings.mock_models or not self.settings.openai_next_api_key:
            return fallback

        answer = self._chat_completion(
            system=(
                "你是染发教程中的实时操作助手。"
                "只能根据给定知识库答案改写成 1-2 句口语化回复，不能新增操作步骤，不能改变安全结论。"
            ),
            user=(
                f"当前步骤：{context.get('step_title')}。\n"
                f"用户问题：{transcript}\n"
                f"知识库答案：{fallback}\n"
                "请输出适合 TTS 播报的中文短回答。"
            ),
            max_tokens=180,
            temperature=0.2,
            timeout=self.settings.llm_answer_timeout_seconds,
        )
        return (answer or fallback).strip()

    def generate_tutorial_answer(self, *, transcript: str, current_step: dict[str, Any]) -> str:
        fallback = self._fallback_tutorial_answer(transcript, current_step)
        if (
            self.settings.mock_models
            or self.settings.vision_provider != "openai_next"
            or not self.settings.openai_next_api_key
        ):
            return fallback

        endpoint = f"{self.settings.openai_next_base_url.rstrip('/')}/v1/chat/completions"
        payload = {
            "model": self.settings.vision_model,
            "temperature": 0.2,
            "max_tokens": 220,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "你是染发教程中的实时操作助手。"
                        "只回答当前步骤相关的操作问题，回答要短、口语化、适合 TTS 播报。"
                        "如果涉及安全风险，提醒用户优先按商品说明或停止操作。"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"当前步骤：{current_step.get('title')}。"
                        f"步骤说明：{current_step.get('description')}。"
                        f"用户问题：{transcript}。"
                        "请用 1-2 句话回答。"
                    ),
                },
            ],
        }
        try:
            raw_response = post_json(
                endpoint,
                payload=payload,
                api_key=self.settings.openai_next_api_key,
                timeout=self.settings.llm_answer_timeout_seconds,
                label="tutorial_answer",
            )
            answer = raw_response["choices"][0]["message"]["content"].strip()
            return answer or fallback
        except Exception:
            return fallback

    def embed_texts(self, texts: list[str]) -> list[list[float] | None]:
        if self.settings.mock_models:
            return [None for _ in texts]

        if self.settings.embedding_provider == "siliconflow":
            return self._siliconflow_embed_texts(texts)
        if self.settings.embedding_provider == "openai_next":
            return self._openai_next_embed_texts(texts)
        return [None for _ in texts]

    def _openai_next_embed_texts(self, texts: list[str]) -> list[list[float] | None]:
        if not self.settings.openai_next_api_key:
            return [None for _ in texts]
        endpoint = f"{self.settings.openai_next_base_url.rstrip('/')}/v1/embeddings"
        return self._embedding_request(
            endpoint=endpoint,
            api_key=self.settings.openai_next_api_key,
            texts=texts,
        )

    def _siliconflow_embed_texts(self, texts: list[str]) -> list[list[float] | None]:
        if not self.settings.siliconflow_api_key:
            return [None for _ in texts]
        endpoint = f"{self.settings.siliconflow_base_url.rstrip('/')}/v1/embeddings"
        return self._embedding_request(
            endpoint=endpoint,
            api_key=self.settings.siliconflow_api_key,
            texts=texts,
        )

    def _embedding_request(
        self,
        *,
        endpoint: str,
        api_key: str,
        texts: list[str],
    ) -> list[list[float] | None]:
        payload = {
            "model": self.settings.embedding_model,
            "input": texts,
            "encoding_format": "float",
        }
        try:
            raw_response = post_json(
                endpoint,
                payload=payload,
                api_key=api_key,
                timeout=self.settings.embedding_timeout_seconds,
                label="embedding",
            )
            data = sorted(raw_response.get("data", []), key=lambda item: item.get("index", 0))
            embeddings: list[list[float] | None] = []
            for item in data:
                embedding = item.get("embedding")
                embeddings.append(embedding if isinstance(embedding, list) else None)
            if len(embeddings) == len(texts):
                return embeddings
        except Exception:
            pass
        return [None for _ in texts]

    def synthesize_speech(self, text: str) -> TTSResult:
        if self.settings.tts_provider == "browser_fallback":
            return TTSResult(
                audio_url=None,
                provider="browser_fallback",
                fallback_reason="server_tts_disabled",
            )
        # Cloud TTS integration is intentionally left behind the interface.
        return TTSResult(
            audio_url=None,
            provider=self.settings.tts_provider,
            fallback_reason="tts_provider_not_implemented",
        )

    def _openai_next_classify_intent(self, transcript: str) -> TutorialIntent | None:
        if self.settings.mock_models or not self.settings.openai_next_api_key:
            return None
        content = self._chat_completion(
            system=(
                "你是染发教程语音指令分类器。"
                "只输出 next、finish、replay、silence、question 之一。"
                "无法确定时输出 question。"
            ),
            user=f"用户语音转写：{transcript}",
            max_tokens=10,
            temperature=0.0,
            timeout=self.settings.llm_fast_timeout_seconds,
        )
        value = (content or "").strip().lower()
        if value in {"next", "finish", "question", "silence", "replay"}:
            return value  # type: ignore[return-value]
        return None

    def _chat_completion(
        self,
        *,
        system: str,
        user: str,
        max_tokens: int,
        temperature: float,
        timeout: float,
    ) -> str | None:
        if not self.settings.openai_next_api_key:
            return None
        endpoint = f"{self.settings.openai_next_base_url.rstrip('/')}/v1/chat/completions"
        payload = {
            "model": self.settings.answer_model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        try:
            raw_response = post_json(
                endpoint,
                payload=payload,
                api_key=self.settings.openai_next_api_key,
                timeout=timeout,
                label="chat_completion",
            )
            return raw_response["choices"][0]["message"]["content"].strip()
        except Exception:
            return None

    def _openai_next_analyze_hair_profile(
        self,
        *,
        current_image_path: Path,
        target_image_path: Path,
    ) -> HairProfileVisionAnalysis:
        if not current_image_path.exists():
            raise RuntimeError("current_image_not_found")

        endpoint = f"{self.settings.openai_next_base_url.rstrip('/')}/v1/chat/completions"
        payload = {
            "model": self.settings.vision_model,
            "temperature": 0.1,
            "max_tokens": 1600,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "你是染发项目的多模态发色识别服务。"
                        "你只负责从图片中提取结构化事实，不判断能不能染。"
                        "必须只输出合法 JSON，不要输出 Markdown。"
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": self._hair_profile_prompt(),
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": self._image_data_url(current_image_path),
                                "detail": self.settings.vision_image_detail,
                            },
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": self._image_data_url(target_image_path),
                                "detail": self.settings.vision_image_detail,
                            },
                        },
                    ],
                },
            ],
        }
        raw_response = post_json(
            endpoint,
            payload=payload,
            api_key=self.settings.openai_next_api_key,
            timeout=self.settings.vision_timeout_seconds,
            label="openai_next",
        )
        content = raw_response["choices"][0]["message"]["content"]
        parsed = self._parse_json_content(content)
        return self._hair_profile_analysis_from_vlm_json(parsed, raw_response)

    @staticmethod
    def _hair_profile_prompt() -> str:
        return """
请分析两张图片：
1. 第一张是用户当前头发照片。
2. 第二张是博主/目标发色参考图。

返回 JSON，字段必须使用以下结构：
{
  "current_hair": {
    "region_mode": "single|root_mid_end|unknown",
    "color": {
      "tone": "black|brown|yellow|orange|red|pink|purple|blue|green|gray|unknown",
      "level": 1-10,
      "saturation": "light|medium|dark",
      "display_name": "中文发色名",
      "rgb": {"r": 0-255, "g": 0-255, "b": 0-255},
      "hsv": {"h": 0-360, "s": 0-100, "v": 0-100},
      "lab": {"l": 0-100, "a": -128-127, "b": -128-127},
      "confidence": 0-1
    },
    "color_options": [最多 3 个候选 color，不要包含 confidence]
  },
  "target_color": {
    "tone": "black|brown|yellow|orange|red|pink|purple|blue|green|gray|unknown",
    "level": 1-10,
    "saturation": "light|medium|dark",
    "display_name": "中文目标色名",
    "rgb": {"r": 0-255, "g": 0-255, "b": 0-255},
    "hsv": {"h": 0-360, "s": 0-100, "v": 0-100},
    "lab": {"l": 0-100, "a": -128-127, "b": -128-127},
    "confidence": 0-1
  },
  "target_color_options": [最多 3 个候选 target_color，不要包含 confidence],
  "hair_length": "ear|shoulder|chest|waist|below_waist|unknown",
  "hair_volume": "low|medium|high|unknown",
  "dye_history": "natural|dyed_no_bleach|bleached_1_2|bleached_3_plus|dyed_black|unknown",
  "attribute_confidences": {
    "hair_length": 0-1,
    "hair_volume": 0-1,
    "dye_history": 0-1,
    "current_color": 0-1,
    "target_color": 0-1
  },
  "analysis_summary": "一句中文摘要"
}

要求：
- 不要决定是否推荐染发。
- 度数 level 表示染发行业常用底色度数，1 最深，10 最浅。
- 如果无法判断，使用 unknown，但仍给出最接近的候选。
""".strip()

    def _hair_profile_analysis_from_vlm_json(
        self,
        parsed: dict[str, Any],
        raw_response: dict[str, Any],
    ) -> HairProfileVisionAnalysis:
        current_hair = parsed.get("current_hair") if isinstance(parsed.get("current_hair"), dict) else {}
        current_color = self._normalize_color(
            current_hair.get("color") if isinstance(current_hair, dict) else None,
            fallback={
                "tone": "brown",
                "level": 5,
                "saturation": "medium",
                "display_name": "棕色",
                "confidence": 0.45,
            },
            include_confidence=True,
        )
        current_options = self._normalize_color_options(current_hair.get("color_options"), current_color)

        target_color = self._normalize_color(
            parsed.get("target_color"),
            fallback={
                "tone": "blue",
                "level": 8,
                "saturation": "medium",
                "display_name": "蓝色",
                "confidence": 0.45,
            },
            include_confidence=True,
        )
        target_options = self._normalize_color_options(parsed.get("target_color_options"), target_color)

        confidences = parsed.get("attribute_confidences")
        if not isinstance(confidences, dict):
            confidences = {}
        attribute_confidences = {
            "hair_length": self._float_0_1(confidences.get("hair_length"), 0.5),
            "hair_volume": self._float_0_1(confidences.get("hair_volume"), 0.5),
            "dye_history": self._float_0_1(confidences.get("dye_history"), 0.35),
            "current_color": self._float_0_1(
                confidences.get("current_color"),
                self._float_0_1(current_color.get("confidence"), 0.45),
            ),
            "target_color": self._float_0_1(
                confidences.get("target_color"),
                self._float_0_1(target_color.get("confidence"), 0.45),
            ),
        }

        return HairProfileVisionAnalysis(
            current_color=current_color,
            current_color_options=current_options,
            target_color=target_color,
            target_color_options=target_options,
            hair_length=self._enum_or_none(
                parsed.get("hair_length"),
                {"ear", "shoulder", "chest", "waist", "below_waist", "unknown"},
            ),
            hair_volume=self._enum_or_none(parsed.get("hair_volume"), {"low", "medium", "high", "unknown"}),
            dye_history=self._enum_or_none(
                parsed.get("dye_history"),
                {
                    "natural",
                    "dyed_no_bleach",
                    "bleached_1_2",
                    "bleached_3_plus",
                    "dyed_black",
                    "unknown",
                },
            ),
            attribute_confidences=attribute_confidences,
            raw={
                "provider": "openai_next",
                "model": self.settings.vision_model,
                "analysis_summary": parsed.get("analysis_summary"),
                "usage": raw_response.get("usage"),
            },
        )

    def _mock_transcribe(self, original_filename: str) -> TranscribeResult:
        filename = original_filename.lower()
        if "finish" in filename or "end" in filename:
            return TranscribeResult(has_voice=True, transcript="结束了", raw_text="mock:finish")
        if "next" in filename:
            return TranscribeResult(has_voice=True, transcript="下一步", raw_text="mock:next")
        if "silence" in filename:
            return TranscribeResult(has_voice=False, transcript="", raw_text="mock:silence")
        return TranscribeResult(
            has_voice=True,
            transcript="这一步需要注意什么？",
            raw_text="mock:question",
        )

    def _sensevoice_transcribe(self, audio_path: Path) -> TranscribeResult:
        if self._sensevoice is None:
            from .sensevoice_service import SenseVoiceService

            self._sensevoice = SenseVoiceService(self.settings)
        return self._sensevoice.transcribe(audio_path)

    def _siliconflow_transcribe(self, audio_path: Path) -> TranscribeResult:
        if self._siliconflow_asr is None:
            from .siliconflow_asr_service import SiliconFlowASRService

            self._siliconflow_asr = SiliconFlowASRService(self.settings)
        return self._siliconflow_asr.transcribe(audio_path)

    def _load_hair_vision_color_recognizer(self) -> ModuleType:
        if self._hair_vision_color_recognizer is not None:
            return self._hair_vision_color_recognizer

        project_root = Path(__file__).resolve().parents[3]
        module_path = project_root / "hair_vision_backend_package" / "color_recognizer.py"
        spec = importlib.util.spec_from_file_location("hair_vision_color_recognizer", module_path)
        if spec is None or spec.loader is None:
            raise RuntimeError("hair_vision_color_recognizer_not_loadable")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self._hair_vision_color_recognizer = module
        return module

    def _load_hair_full_pipeline_engine(self) -> ModuleType:
        if self._hair_full_pipeline_engine is not None:
            return self._hair_full_pipeline_engine

        project_root = Path(__file__).resolve().parents[3]
        module_path = project_root / "hair_full_pipeline" / "hair_dye_engine.py"
        spec = importlib.util.spec_from_file_location("hair_full_pipeline_engine", module_path)
        if spec is None or spec.loader is None:
            raise RuntimeError("hair_full_pipeline_engine_not_loadable")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self._hair_full_pipeline_engine = module
        return module

    def _hair_analysis_from_full_pipeline_result(
        self,
        extracted: dict[str, Any],
        matches: list[dict[str, Any]],
    ) -> HairColorAnalysis:
        best = matches[0] if matches else None
        rgb = tuple(extracted.get("rgb") or (0, 0, 0))
        lab = tuple(extracted.get("lab") or (0.0, 0.0, 0.0))
        hue_family = str(extracted.get("hue_family") or "")
        level = int(extracted.get("level") or self._level_from_lab(lab))
        confidence = self._confidence_from_match(best)

        color = {
            "tone": self._tone_from_full_pipeline_match(hue_family, best),
            "level": level,
            "saturation": self._saturation_from_lab(lab),
            "display_name": self._display_name_from_full_pipeline_match(hue_family, best),
            "rgb": self._rgb_dict(rgb),
            "hsv": self._hsv_dict(rgb),
            "lab": self._lab_dict(lab),
            "confidence": confidence,
        }
        options = [self._color_option_from_full_pipeline_match(item) for item in matches[:3]]
        if not options:
            options = [{key: value for key, value in color.items() if key != "confidence"}]

        return HairColorAnalysis(
            color=color,
            color_options=options,
            raw={
                "provider": "hair_full_pipeline",
                "input": extracted,
                "best_match": best,
                "matches": matches,
                "segmentation": "disabled_center_crop_fallback",
            },
        )

    def _hair_analysis_from_recognizer_result(self, result: dict[str, Any]) -> HairColorAnalysis:
        input_info = result.get("input", {})
        matches = result.get("matches") or []
        best = result.get("best_match") or (matches[0] if matches else None)

        rgb = tuple(input_info.get("rgb") or (0, 0, 0))
        lab = tuple(input_info.get("lab") or (0.0, 0.0, 0.0))
        hue_family = str(input_info.get("hue_family") or "")
        level = int(input_info.get("level") or self._level_from_lab(lab))
        confidence = self._confidence_from_match(best)

        color = {
            "tone": self._tone_from_hue_family(hue_family, best),
            "level": level,
            "saturation": self._saturation_from_lab(lab),
            "display_name": self._display_name(hue_family, best),
            "rgb": self._rgb_dict(rgb),
            "hsv": self._hsv_dict(rgb),
            "lab": self._lab_dict(lab),
            "confidence": confidence,
        }
        options = [self._color_option_from_match(item) for item in matches[:3]]
        if not options:
            options = [{key: value for key, value in color.items() if key != "confidence"}]

        return HairColorAnalysis(
            color=color,
            color_options=options,
            raw={
                "provider": "hair_vision_backend_package",
                "input": input_info,
                "best_match": best,
                "matches": matches,
            },
        )

    def _fallback_hair_color_analysis(self, reason: str) -> HairColorAnalysis:
        color = {
            "tone": "brown",
            "level": 5,
            "saturation": "medium",
            "display_name": "棕色",
            "confidence": 0.0,
        }
        return HairColorAnalysis(
            color=color,
            color_options=[
                {"tone": "brown", "level": 5, "saturation": "medium", "display_name": "棕色"},
                {"tone": "black", "level": 3, "saturation": "dark", "display_name": "自然黑"},
                {"tone": "yellow", "level": 8, "saturation": "medium", "display_name": "金色"},
            ],
            raw={"provider": "hair_vision_backend_package", "error": reason},
            fallback_reason=reason,
        )

    def _failed_hair_profile_analysis(self, *, reason: str, error_message: str) -> HairProfileVisionAnalysis:
        unknown_color = {
            "tone": "unknown",
            "level": 5,
            "saturation": "medium",
            "display_name": "识别失败",
            "rgb": {"r": 0, "g": 0, "b": 0},
            "hsv": {"h": 0, "s": 0, "v": 0},
            "lab": {"l": 50, "a": 0, "b": 0},
            "confidence": 0.0,
        }
        return HairProfileVisionAnalysis(
            current_color=unknown_color,
            current_color_options=[{key: value for key, value in unknown_color.items() if key != "confidence"}],
            target_color=None,
            target_color_options=[],
            hair_length="unknown",
            hair_volume="unknown",
            dye_history="unknown",
            attribute_confidences={
                "hair_length": 0.0,
                "hair_volume": 0.0,
                "dye_history": 0.0,
                "current_color": 0.0,
                "target_color": 0.0,
            },
            raw={
                "provider": "openai_next",
                "model": self.settings.vision_model,
                "error": reason,
                "error_message": error_message,
            },
            fallback_reason=reason,
        )

    @staticmethod
    def _fallback_tutorial_answer(transcript: str, current_step: dict[str, Any]) -> str:
        normalized = transcript.strip()
        title = current_step.get("title") or "当前步骤"
        if any(word in normalized for word in ("多久", "几分钟", "时间")):
            return f"{title} 这一步先按视频节奏来。如果商品包装上的停留时间不同，优先按包装说明。"
        if any(word in normalized for word in ("过敏", "刺痛", "疼", "不舒服")):
            return "如果已经刺痛、发痒或明显不舒服，先停止操作并冲洗，不要硬撑。"
        if any(word in normalized for word in ("涂", "抹", "均匀", "怎么")):
            return f"{title} 要少量多次涂抹，尽量覆盖均匀，发尾和边缘位置可以再检查一遍。"
        return f"{title} 先按当前视频步骤操作。若商品包装说明和教程不同，请以商品官方说明为准。"

    def _image_data_url(self, path: Path) -> str:
        """Base64 a JPEG-encoded, downscaled copy of the image.

        Phone photos routinely arrive at 3000-4000px. Sending them untouched
        made the request body several megabytes and multiplied the image tiles
        the vision model bills for. Longest edge is capped at
        VISION_IMAGE_MAX_EDGE; smaller images are left at their native size.
        Falls back to the original bytes if the file cannot be decoded.
        """
        max_edge = self.settings.vision_image_max_edge
        try:
            with Image.open(path) as image:
                image = image.convert("RGB")
                if max(image.size) > max_edge:
                    image.thumbnail((max_edge, max_edge), Image.LANCZOS)
                buffer = io.BytesIO()
                image.save(
                    buffer,
                    format="JPEG",
                    quality=self.settings.vision_image_quality,
                    optimize=True,
                )
            data = base64.b64encode(buffer.getvalue()).decode("ascii")
            return f"data:image/jpeg;base64,{data}"
        except Exception:
            logger.warning("vision image downscale failed for %s, sending original", path.name)
            data = base64.b64encode(path.read_bytes()).decode("ascii")
            return f"data:image/jpeg;base64,{data}"

    @staticmethod
    def _parse_json_content(content: str) -> dict[str, Any]:
        text = content.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?", "", text).strip()
            text = re.sub(r"```$", "", text).strip()
        parsed = json.loads(text)
        if not isinstance(parsed, dict):
            raise RuntimeError("vision_response_not_object")
        return parsed

    def _normalize_color(
        self,
        value: Any,
        *,
        fallback: dict[str, Any],
        include_confidence: bool,
    ) -> dict[str, Any]:
        source = value if isinstance(value, dict) else {}
        rgb_source = source.get("rgb") if isinstance(source.get("rgb"), dict) else {}
        hsv_source = source.get("hsv") if isinstance(source.get("hsv"), dict) else {}
        lab_source = source.get("lab") if isinstance(source.get("lab"), dict) else {}

        rgb = {
            "r": self._int_range(rgb_source.get("r"), 0, 255, 0),
            "g": self._int_range(rgb_source.get("g"), 0, 255, 0),
            "b": self._int_range(rgb_source.get("b"), 0, 255, 0),
        }
        if rgb == {"r": 0, "g": 0, "b": 0} and isinstance(fallback.get("rgb"), dict):
            rgb = fallback["rgb"]

        hsv = {
            "h": self._int_range(hsv_source.get("h"), 0, 360, self._hsv_dict((rgb["r"], rgb["g"], rgb["b"]))["h"]),
            "s": self._int_range(hsv_source.get("s"), 0, 100, self._hsv_dict((rgb["r"], rgb["g"], rgb["b"]))["s"]),
            "v": self._int_range(hsv_source.get("v"), 0, 100, self._hsv_dict((rgb["r"], rgb["g"], rgb["b"]))["v"]),
        }
        lab = {
            "l": self._float_range(lab_source.get("l"), 0, 100, float(fallback.get("lab", {}).get("l", 50)) if isinstance(fallback.get("lab"), dict) else 50.0),
            "a": self._float_range(lab_source.get("a"), -128, 127, float(fallback.get("lab", {}).get("a", 0)) if isinstance(fallback.get("lab"), dict) else 0.0),
            "b": self._float_range(lab_source.get("b"), -128, 127, float(fallback.get("lab", {}).get("b", 0)) if isinstance(fallback.get("lab"), dict) else 0.0),
        }

        color = {
            "tone": self._enum_or_default(
                source.get("tone"),
                {
                    "black",
                    "brown",
                    "yellow",
                    "orange",
                    "red",
                    "pink",
                    "purple",
                    "blue",
                    "green",
                    "gray",
                    "unknown",
                },
                str(fallback.get("tone", "unknown")),
            ),
            "level": self._int_range(source.get("level"), 1, 10, int(fallback.get("level", 5))),
            "saturation": self._enum_or_default(
                source.get("saturation"),
                {"light", "medium", "dark"},
                str(fallback.get("saturation", "medium")),
            ),
            "display_name": str(source.get("display_name") or fallback.get("display_name") or "未知发色"),
            "rgb": rgb,
            "hsv": hsv,
            "lab": lab,
        }
        if include_confidence:
            color["confidence"] = self._float_0_1(source.get("confidence"), float(fallback.get("confidence", 0.45)))
        return color

    def _normalize_color_options(self, value: Any, selected_color: dict[str, Any]) -> list[dict[str, Any]]:
        options = value if isinstance(value, list) else []
        normalized = [
            self._normalize_color(item, fallback=selected_color, include_confidence=False)
            for item in options[:3]
            if isinstance(item, dict)
        ]
        if normalized:
            return normalized
        return [{key: value for key, value in selected_color.items() if key != "confidence"}]

    @staticmethod
    def _enum_or_none(value: Any, allowed: set[str]) -> str | None:
        if isinstance(value, str) and value in allowed:
            return value
        return None

    @staticmethod
    def _enum_or_default(value: Any, allowed: set[str], default: str) -> str:
        if isinstance(value, str) and value in allowed:
            return value
        return default

    @staticmethod
    def _int_range(value: Any, minimum: int, maximum: int, default: int) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            parsed = default
        return max(minimum, min(maximum, parsed))

    @staticmethod
    def _float_range(value: Any, minimum: float, maximum: float, default: float) -> float:
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            parsed = default
        return round(max(minimum, min(maximum, parsed)), 2)

    @classmethod
    def _float_0_1(cls, value: Any, default: float) -> float:
        return cls._float_range(value, 0.0, 1.0, default)

    @staticmethod
    def _rgb_dict(rgb: tuple[int, int, int]) -> dict[str, int]:
        r, g, b = (int(rgb[0]), int(rgb[1]), int(rgb[2]))
        return {"r": r, "g": g, "b": b}

    @staticmethod
    def _hsv_dict(rgb: tuple[int, int, int]) -> dict[str, int]:
        r, g, b = (max(0, min(255, int(value))) / 255 for value in rgb)
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        return {"h": round(h * 360), "s": round(s * 100), "v": round(v * 100)}

    @staticmethod
    def _lab_dict(lab: tuple[float, float, float]) -> dict[str, float]:
        return {"l": float(lab[0]), "a": float(lab[1]), "b": float(lab[2])}

    @staticmethod
    def _level_from_lab(lab: tuple[float, float, float]) -> int:
        lightness = max(0.0, min(100.0, float(lab[0])))
        thresholds = [15, 25, 35, 45, 55, 65, 75, 85, 95, 100]
        for index, threshold in enumerate(thresholds):
            if lightness <= threshold:
                return index + 1
        return 10

    @staticmethod
    def _saturation_from_lab(lab: tuple[float, float, float]) -> str:
        lightness = float(lab[0])
        if lightness >= 78:
            return "light"
        if lightness <= 38:
            return "dark"
        return "medium"

    @staticmethod
    def _tone_from_hue_family(hue_family: str, match: dict[str, Any] | None) -> str:
        if match and match.get("tone"):
            tone = str(match["tone"])
            tone_mapping = {
                "暖红": "red",
                "冷红": "red",
                "红": "red",
                "橙": "orange",
                "黄": "yellow",
                "暖黄": "yellow",
                "棕": "brown",
                "暖棕": "brown",
                "冷棕": "brown",
                "黑": "black",
                "蓝": "blue",
                "绿": "green",
                "紫": "purple",
                "粉": "pink",
                "灰": "gray",
            }
            if tone in {
                "black",
                "brown",
                "yellow",
                "orange",
                "red",
                "pink",
                "purple",
                "blue",
                "green",
                "gray",
                "unknown",
            }:
                return tone
            return tone_mapping.get(tone, "unknown")
        mapping = {
            "黑/深灰": "black",
            "灰": "gray",
            "白/浅灰": "gray",
            "红": "red",
            "橙": "orange",
            "黄": "yellow",
            "绿": "green",
            "青": "green",
            "蓝": "blue",
            "靛": "blue",
            "紫": "purple",
        }
        return mapping.get(hue_family, "unknown")

    def _tone_from_full_pipeline_match(self, hue_family: str, match: dict[str, Any] | None) -> str:
        family = str(match.get("family_zh") or "") if match else ""
        family_mapping = {
            "黑茶色": "brown",
            "奶茶灰棕": "brown",
            "奶茶金": "yellow",
            "雾霾灰": "gray",
            "银灰色": "gray",
            "红色": "red",
            "树莓红": "red",
            "粉棕色": "pink",
            "粉色": "pink",
            "脏橘色": "orange",
            "橙色": "orange",
            "蓝色": "blue",
            "紫色": "purple",
            "绿色": "green",
        }
        if family in family_mapping:
            return family_mapping[family]
        return self._tone_from_hue_family(hue_family, None)

    @staticmethod
    def _display_name_from_full_pipeline_match(hue_family: str, match: dict[str, Any] | None) -> str:
        if match and match.get("family_zh"):
            return str(match["family_zh"])
        return hue_family or "未知发色"

    @staticmethod
    def _display_name(hue_family: str, match: dict[str, Any] | None) -> str:
        if match and match.get("name"):
            return str(match["name"])
        return hue_family or "未知发色"

    def _color_option_from_match(self, match: dict[str, Any]) -> dict[str, Any]:
        rgb = tuple(match.get("rgb") or (0, 0, 0))
        lab = tuple(match.get("lab") or (0.0, 0.0, 0.0))
        return {
            "tone": self._tone_from_hue_family("", match),
            "level": int(match.get("level") or self._level_from_lab(lab)),
            "saturation": self._saturation_from_lab(lab),
            "display_name": str(match.get("name") or "候选发色"),
            "rgb": self._rgb_dict(rgb),
            "hsv": self._hsv_dict(rgb),
            "lab": self._lab_dict(lab),
        }

    def _color_option_from_full_pipeline_match(self, match: dict[str, Any]) -> dict[str, Any]:
        rgb = tuple(match.get("rgb") or (0, 0, 0))
        lab = tuple(match.get("lab") or (0.0, 0.0, 0.0))
        return {
            "tone": self._tone_from_full_pipeline_match("", match),
            "level": int(match.get("level") or self._level_from_lab(lab)),
            "saturation": self._saturation_from_lab(lab),
            "display_name": str(match.get("family_zh") or "候选发色"),
            "rgb": self._rgb_dict(rgb),
            "hsv": self._hsv_dict(rgb),
            "lab": self._lab_dict(lab),
        }

    @staticmethod
    def _confidence_from_match(match: dict[str, Any] | None) -> float:
        if not match:
            return 0.45
        delta_e = float(match.get("delta_e") or 20.0)
        return round(max(0.45, min(0.95, 1 - delta_e / 35)), 2)
