"""SenseVoiceSmall ASR through the SiliconFlow cloud API.

Same model as the local FunASR path (``FunAudioLLM/SenseVoiceSmall``), so
transcription quality is unchanged. Running it as an API call removes the
torch / funasr / modelscope dependency chain and its multi-second cold start
from the request path.

The endpoint is OpenAI-compatible: POST /v1/audio/transcriptions, multipart with
``file`` + ``model``, responding with ``{"text": "..."}``.
"""

from __future__ import annotations

import mimetypes
from pathlib import Path

import httpx

from ..config import Settings
from .http_client import UpstreamError, get_client
from .model_service import TranscribeResult


class SiliconFlowASRService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def transcribe(self, audio_path: Path) -> TranscribeResult:
        if not self.settings.siliconflow_api_key:
            raise UpstreamError("siliconflow_asr_api_key_not_configured")
        if not audio_path.exists():
            raise UpstreamError("siliconflow_asr_audio_not_found")

        url = f"{self.settings.siliconflow_base_url.rstrip('/')}/v1/audio/transcriptions"
        mime_type = mimetypes.guess_type(audio_path.name)[0] or "audio/wav"

        try:
            with audio_path.open("rb") as audio_file:
                response = get_client().post(
                    url,
                    files={"file": (audio_path.name, audio_file, mime_type)},
                    data={"model": self.settings.siliconflow_asr_model},
                    headers={"Authorization": f"Bearer {self.settings.siliconflow_api_key}"},
                    timeout=self.settings.asr_timeout_seconds,
                )
        except httpx.HTTPError as error:
            raise UpstreamError(f"siliconflow_asr_network_error:{error}") from error

        if response.status_code >= 400:
            raise UpstreamError(
                f"siliconflow_asr_http_{response.status_code}:{response.text[:300]}",
                status_code=response.status_code,
            )

        try:
            payload = response.json()
        except ValueError as error:
            raise UpstreamError(f"siliconflow_asr_invalid_json:{response.text[:200]}") from error

        raw_text = str(payload.get("text") or "")
        transcript = raw_text.strip()
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
