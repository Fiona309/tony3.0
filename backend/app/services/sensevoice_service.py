"""SenseVoice ASR + FSMN-VAD adapter."""

from __future__ import annotations

from importlib import import_module
import os
from pathlib import Path

from ..config import Settings
from .model_service import TranscribeResult


class SenseVoiceService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._model = None

    def transcribe(self, audio_path: Path) -> TranscribeResult:
        postprocess_module = import_module("funasr.utils.postprocess_utils")
        rich_transcription_postprocess = postprocess_module.rich_transcription_postprocess
        model = self._load_model()
        result = model.generate(
            input=str(audio_path),
            language="zh",
            use_itn=True,
            batch_size_s=60,
        )
        raw_text = result[0].get("text", "") if result else ""
        transcript = rich_transcription_postprocess(raw_text).strip()
        if not transcript:
            return TranscribeResult(
                has_voice=False,
                transcript="",
                raw_text=raw_text,
                language="zh",
            )
        return TranscribeResult(
            has_voice=True,
            transcript=transcript,
            raw_text=raw_text,
            language="zh",
        )

    def _load_model(self):
        if self._model is None:
            os.environ.setdefault("MODELSCOPE_CACHE", str(self.settings.model_cache_dir))
            os.environ.setdefault("HF_HOME", str(self.settings.model_cache_dir / "huggingface"))
            funasr_module = import_module("funasr")
            auto_model = funasr_module.AutoModel

            self._model = auto_model(
                model=self.settings.sensevoice_model,
                vad_model=self.settings.sensevoice_vad_model,
                vad_kwargs={"max_single_segment_time": 30000},
                device=self.settings.sensevoice_device,
            )
        return self._model
