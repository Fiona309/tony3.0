"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


@dataclass(frozen=True)
class Settings:
    app_name: str
    api_prefix: str
    host: str
    port: int
    cors_origins: tuple[str, ...]
    data_dir: Path
    media_dir: Path
    database_path: Path
    chroma_dir: Path
    mock_models: bool
    vision_provider: str
    vision_model: str
    answer_model: str
    embedding_provider: str
    embedding_model: str
    openrouter_base_url: str
    openrouter_api_key: str | None
    openrouter_image_model: str
    vision_timeout_seconds: int
    llm_fast_timeout_seconds: int
    llm_answer_timeout_seconds: int
    embedding_timeout_seconds: int
    vision_image_max_edge: int
    vision_image_quality: int
    vision_image_detail: str
    openai_next_base_url: str
    openai_next_api_key: str | None
    draw_base_url: str
    draw_api_key: str | None
    transition_video_provider: str
    transition_video_model: str
    transition_video_endpoint: str
    transition_video_wan_resolution: str
    transition_video_timeout_seconds: int
    transition_video_poll_interval_seconds: int
    siliconflow_base_url: str
    siliconflow_api_key: str | None
    siliconflow_asr_model: str
    audio_upload_dir: Path
    model_cache_dir: Path
    asr_provider: str
    sensevoice_model: str
    sensevoice_device: str
    sensevoice_vad_model: str
    asr_timeout_seconds: int
    tts_provider: str
    tts_timeout_seconds: int
    request_worker_threads: int
    preview_worker_count: int
    after_video_worker_count: int


def _origins() -> tuple[str, ...]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    return tuple(origin.strip() for origin in raw.split(",") if origin.strip())


def get_settings() -> Settings:
    _load_dotenv(BACKEND_ROOT / ".env")
    data_dir = Path(os.getenv("DATA_DIR", BACKEND_ROOT / "data")).resolve()
    media_dir = Path(os.getenv("MEDIA_DIR", data_dir / "media")).resolve()
    database_path = Path(os.getenv("DB_PATH", data_dir / "meifa.db")).resolve()
    chroma_dir = Path(os.getenv("CHROMA_DIR", data_dir / "chroma_data")).resolve()
    audio_upload_dir = Path(
        os.getenv("AUDIO_UPLOAD_DIR", media_dir / "uploads" / "audio")
    ).resolve()
    model_cache_dir = Path(os.getenv("MODEL_CACHE_DIR", data_dir / "models")).resolve()
    return Settings(
        app_name="莓发 Mock API",
        api_prefix="/api",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        cors_origins=_origins(),
        data_dir=data_dir,
        media_dir=media_dir,
        database_path=database_path,
        chroma_dir=chroma_dir,
        mock_models=os.getenv("MOCK_MODELS", "true").lower() == "true",
        vision_provider=os.getenv("VISION_PROVIDER", "openai_next"),
        vision_model=os.getenv("VISION_MODEL", "gpt-4o-mini"),
        answer_model=os.getenv("ANSWER_MODEL", os.getenv("VISION_MODEL", "gpt-4o-mini")),
        embedding_provider=os.getenv("EMBEDDING_PROVIDER", "siliconflow"),
        embedding_model=os.getenv("EMBEDDING_MODEL", "BAAI/bge-large-zh-v1.5"),
        openrouter_base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY"),
        openrouter_image_model=os.getenv("OPENROUTER_IMAGE_MODEL", "google/gemini-2.5-flash-image"),
        vision_timeout_seconds=int(os.getenv("VISION_TIMEOUT_SECONDS", "30")),
        # Tiered timeouts. Intent classification returns ~10 tokens and query
        # rewriting ~80; making them wait out the 30s vision budget turns a
        # hiccup into a half-minute stall on the voice path.
        llm_fast_timeout_seconds=int(os.getenv("LLM_FAST_TIMEOUT_SECONDS", "8")),
        llm_answer_timeout_seconds=int(os.getenv("LLM_ANSWER_TIMEOUT_SECONDS", "15")),
        embedding_timeout_seconds=int(os.getenv("EMBEDDING_TIMEOUT_SECONDS", "10")),
        # Phone photos are often 3000px+. Downscaling before base64 shrinks both
        # the upload and the number of image tiles the vision model is billed for.
        vision_image_max_edge=int(os.getenv("VISION_IMAGE_MAX_EDGE", "1024")),
        vision_image_quality=int(os.getenv("VISION_IMAGE_QUALITY", "85")),
        vision_image_detail=os.getenv("VISION_IMAGE_DETAIL", "high"),
        openai_next_base_url=os.getenv("OPENAI_NEXT_BASE_URL", "https://api.openai-next.com"),
        openai_next_api_key=os.getenv("OPENAI_NEXT_API_KEY"),
        draw_base_url=os.getenv("DRAW_BASE_URL", "https://draw.openai-next.com"),
        draw_api_key=os.getenv("DRAW_API_KEY"),
        transition_video_provider=os.getenv("TRANSITION_VIDEO_PROVIDER", "seedance").lower(),
        transition_video_model=os.getenv("TRANSITION_VIDEO_MODEL", "wan2.2-kf2v-flash"),
        transition_video_endpoint=os.getenv("TRANSITION_VIDEO_ENDPOINT", "/v1/video/generations"),
        transition_video_wan_resolution=os.getenv("TRANSITION_VIDEO_WAN_RESOLUTION", "480P"),
        transition_video_timeout_seconds=int(os.getenv("TRANSITION_VIDEO_TIMEOUT_SECONDS", "360")),
        # Was hardcoded to 30s for wan, so a task finishing right after a poll
        # sat idle for up to 30 extra seconds before anyone noticed.
        transition_video_poll_interval_seconds=int(
            os.getenv("TRANSITION_VIDEO_POLL_INTERVAL_SECONDS", "5")
        ),
        siliconflow_base_url=os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn"),
        siliconflow_api_key=os.getenv("SILICONFLOW_API_KEY"),
        siliconflow_asr_model=os.getenv("SILICONFLOW_ASR_MODEL", "FunAudioLLM/SenseVoiceSmall"),
        audio_upload_dir=audio_upload_dir,
        model_cache_dir=model_cache_dir,
        # Defaults to the cloud SenseVoiceSmall endpoint (same model as the local
        # path). Set ASR_PROVIDER=sensevoice to force local torch/funasr inference.
        asr_provider=os.getenv("ASR_PROVIDER", "siliconflow"),
        sensevoice_model=os.getenv("SENSEVOICE_MODEL", "iic/SenseVoiceSmall"),
        sensevoice_device=os.getenv("SENSEVOICE_DEVICE", "cpu"),
        sensevoice_vad_model=os.getenv("SENSEVOICE_VAD_MODEL", "fsmn-vad"),
        asr_timeout_seconds=int(os.getenv("ASR_TIMEOUT_SECONDS", "8")),
        tts_provider=os.getenv("TTS_PROVIDER", "browser_fallback"),
        tts_timeout_seconds=int(os.getenv("TTS_TIMEOUT_SECONDS", "10")),
        # Sync endpoints and run_in_threadpool calls share this pool. Slow
        # upstreams (vision ~10s, ASR ~1s) hold a thread for their whole
        # duration, so the pool must be larger than anyio's default of 40.
        request_worker_threads=int(os.getenv("REQUEST_WORKER_THREADS", "64")),
        # Background generators. Raising these increases upstream concurrency,
        # so lower them again if OpenRouter / draw API rate limits bite.
        preview_worker_count=int(os.getenv("PREVIEW_WORKER_COUNT", "2")),
        after_video_worker_count=int(os.getenv("AFTER_VIDEO_WORKER_COUNT", "2")),
    )
