"""Pre-download local model assets used by the backend.

Run from backend directory:
    python -m app.scripts.download_models
"""

from __future__ import annotations

from importlib import import_module
import os

from ..config import get_settings


def main() -> None:
    funasr_module = import_module("funasr")
    auto_model = funasr_module.AutoModel
    settings = get_settings()
    os.environ.setdefault("MODELSCOPE_CACHE", str(settings.model_cache_dir))
    os.environ.setdefault("HF_HOME", str(settings.model_cache_dir / "huggingface"))
    auto_model(
        model=settings.sensevoice_model,
        vad_model=settings.sensevoice_vad_model,
        vad_kwargs={"max_single_segment_time": 30000},
        device=settings.sensevoice_device,
    )
    print(
        "downloaded models:",
        settings.sensevoice_model,
        settings.sensevoice_vad_model,
    )


if __name__ == "__main__":
    main()
