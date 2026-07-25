"""Audio upload persistence helpers."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile


@dataclass(frozen=True)
class StoredAudio:
    original_path: Path
    original_filename: str
    content_type: str | None


class AudioStorage:
    def __init__(self, upload_dir: Path) -> None:
        self.upload_dir = upload_dir

    async def save_upload(
        self,
        *,
        file: UploadFile,
        tutorial_session_id: str,
        client_event_id: str,
    ) -> StoredAudio:
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in {".webm", ".mp3", ".wav", ".m4a", ".ogg"}:
            suffix = ".webm"

        target_dir = self.upload_dir / tutorial_session_id
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"{client_event_id}{suffix}"

        content = await file.read()
        if not content:
            raise ValueError("音频文件为空")
        if len(content) > 15 * 1024 * 1024:
            raise ValueError("单段音频不能超过 15 MB")
        target.write_bytes(content)

        return StoredAudio(
            original_path=target,
            original_filename=file.filename or "",
            content_type=file.content_type,
        )
