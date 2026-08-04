"""Cloud ASR through any OpenAI-compatible /v1/audio/transcriptions endpoint.

Covers both relays used by this project (openai-next, siliconflow) since the
request shape is identical: multipart with ``file`` + ``model``, responding with
``{"text": "..."}``.

Running ASR as an API call instead of local FunASR removes the torch / funasr /
modelscope dependency chain and its multi-second cold start from the request
path. It also removes the ffmpeg transcode step: these endpoints accept the
browser's native recording format directly (see AudioConverter usage in main.py).
"""

from __future__ import annotations

import mimetypes
from pathlib import Path

import httpx

from ..config import Settings
from .http_client import UpstreamError, get_client
from .model_service import TranscribeResult


class CloudASRService:
    def __init__(
        self,
        settings: Settings,
        *,
        provider: str,
        base_url: str,
        api_key: str | None,
        model: str,
    ) -> None:
        self.settings = settings
        self.provider = provider
        self.base_url = base_url
        self.api_key = api_key
        self.model = model

    def transcribe(self, audio_path: Path) -> TranscribeResult:
        if not self.api_key:
            raise UpstreamError(f"{self.provider}_asr_api_key_not_configured")
        if not audio_path.exists():
            raise UpstreamError(f"{self.provider}_asr_audio_not_found")

        url = f"{self.base_url.rstrip('/')}/v1/audio/transcriptions"
        mime_type = mimetypes.guess_type(audio_path.name)[0] or "application/octet-stream"

        try:
            with audio_path.open("rb") as audio_file:
                response = get_client().post(
                    url,
                    files={"file": (audio_path.name, audio_file, mime_type)},
                    data={"model": self.model},
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=self.settings.asr_timeout_seconds,
                )
        except httpx.HTTPError as error:
            raise UpstreamError(f"{self.provider}_asr_network_error:{error}") from error

        if response.status_code >= 400:
            raise UpstreamError(
                f"{self.provider}_asr_http_{response.status_code}:{response.text[:300]}",
                status_code=response.status_code,
            )

        try:
            payload = response.json()
        except ValueError as error:
            raise UpstreamError(f"{self.provider}_asr_invalid_json:{response.text[:200]}") from error

        raw_text = str(payload.get("text") or "")
        transcript = raw_text.strip()
        if not transcript:
            return TranscribeResult(has_voice=False, transcript="", raw_text=raw_text, language="zh")
        return TranscribeResult(has_voice=True, transcript=transcript, raw_text=raw_text, language="zh")
