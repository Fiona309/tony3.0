"""Audio conversion utilities for ASR input."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


class AudioConverter:
    def __init__(self, ffmpeg_binary: str = "ffmpeg") -> None:
        self.ffmpeg_binary = ffmpeg_binary

    def to_sensevoice_wav(self, source: Path) -> Path:
        """Convert uploaded audio to 16 kHz mono WAV for SenseVoice."""
        target = source.with_suffix(".16k.wav")
        if source.suffix.lower() == ".wav":
            # Still normalize sample rate/channel count for model stability.
            target = source.with_name(f"{source.stem}.16k.wav")

        if shutil.which(self.ffmpeg_binary) is None:
            raise RuntimeError("未找到 ffmpeg，无法转码浏览器音频")

        command = [
            self.ffmpeg_binary,
            "-y",
            "-i",
            str(source),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-f",
            "wav",
            str(target),
        ]
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
        if completed.returncode != 0:
            stderr = completed.stderr.strip() or "unknown ffmpeg error"
            raise RuntimeError(f"音频转码失败: {stderr}")
        return target
