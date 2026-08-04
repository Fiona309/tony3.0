"""FastAPI entrypoint for the frontend integration Mock API."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
import importlib
import logging
import os
from pathlib import Path
import sys
from threading import Lock
from typing import Any
from uuid import uuid4

import anyio.to_thread
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image

from .config import get_settings
from .database import Database
from .kb.color_rule_kb import ColorRuleKB
from .kb.operation_qa_kb import OperationQAKB
from .kb.product_kb import ProductKB
from .mock_data import MockStore
from .services.audio_converter import AudioConverter
from .services.audio_storage import AudioStorage
from .services.http_client import close_client
from .services.model_service import ModelService
from .services.transition_video_service import TransitionVideoService
from .services.tutorial_service import TutorialService


settings = get_settings()
PROJECT_ROOT = Path(__file__).resolve().parents[2]
database = Database(settings.database_path)
store = MockStore(settings.media_dir, database=database)
color_rule_kb = ColorRuleKB(settings.database_path)
product_kb = ProductKB(settings.database_path)
audio_storage = AudioStorage(settings.audio_upload_dir)
audio_converter = AudioConverter()
model_service = ModelService(settings)
operation_qa_kb = OperationQAKB(
    database_path=settings.database_path,
    chroma_dir=settings.chroma_dir,
    embedding_function=model_service.embed_texts,
)
tutorial_service = TutorialService(
    store=store,
    model_service=model_service,
    operation_qa_kb=operation_qa_kb,
)
transition_video_service = TransitionVideoService(settings)
preview_executor = ThreadPoolExecutor(
    max_workers=settings.preview_worker_count,
    thread_name_prefix="preview-generator",
)
after_video_executor = ThreadPoolExecutor(
    max_workers=settings.after_video_worker_count,
    thread_name_prefix="after-video-generator",
)
asr_prewarm_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="asr-prewarm")
preview_task_lock = Lock()
after_video_task_lock = Lock()
active_preview_tasks: set[str] = set()
active_after_video_tasks: set[str] = set()
hair_full_generator_module: Any | None = None
hair_full_engine_module: Any | None = None
logger = logging.getLogger(__name__)


def trace_id() -> str:
    return f"trace_{uuid4().hex[:12]}"


def ok(data: Any, message: str = "ok") -> dict[str, Any]:
    return {"code": 0, "message": message, "data": data, "trace_id": trace_id()}


def failure(message: str, status_code: int = 400, code: int = 40001) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "code": code,
            "message": message,
            "data": {"status": "failed"},
            "trace_id": trace_id(),
        },
    )


def user_key(request: Request) -> str:
    return request.headers.get("X-User-Key") or "anonymous"


def prewarm_asr_model() -> None:
    if settings.mock_models or settings.asr_provider != "sensevoice":
        return
    try:
        from .services.sensevoice_service import SenseVoiceService

        service = SenseVoiceService(settings)
        service._load_model()
        model_service._sensevoice = service
        logger.info("SenseVoice ASR model prewarmed")
    except Exception:
        logger.exception("SenseVoice ASR model prewarm failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Sync endpoints run here; the default cap of 40 is too low once a single
    # vision request can occupy a thread for the full 30s timeout window.
    anyio.to_thread.current_default_thread_limiter().total_tokens = (
        settings.request_worker_threads
    )
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    settings.audio_upload_dir.mkdir(parents=True, exist_ok=True)
    settings.model_cache_dir.mkdir(parents=True, exist_ok=True)
    settings.chroma_dir.mkdir(parents=True, exist_ok=True)
    database.initialize()
    store.load_persistent_state()
    operation_qa_kb.initialize()
    asr_prewarm_executor.submit(prewarm_asr_model)
    for preview_task_id, owner_user_key in store.pending_preview_tasks():
        enqueue_preview_generation(preview_task_id, owner_user_key)
    for after_task_id, owner_user_key in store.pending_after_video_tasks():
        enqueue_after_video_generation(after_task_id, owner_user_key)
    yield
    preview_executor.shutdown(wait=False, cancel_futures=False)
    after_video_executor.shutdown(wait=False, cancel_futures=False)
    asr_prewarm_executor.shutdown(wait=False, cancel_futures=False)
    close_client()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/media", StaticFiles(directory=settings.media_dir, check_dir=False), name="media")


@app.middleware("http")
async def audit_request(request: Request, call_next):
    response = await call_next(request)
    if request.url.path != "/health":
        database.record_event(
            user_key=request.headers.get("X-User-Key"),
            method=request.method,
            path=request.url.path,
            trace_id=response.headers.get("X-Trace-Id", trace_id()),
        )
    return response


@app.exception_handler(KeyError)
async def not_found_handler(_: Request, error: KeyError):
    return failure(str(error), status_code=404, code=40401)


@app.exception_handler(ValueError)
async def validation_handler(_: Request, error: ValueError):
    return failure(str(error))


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "mock_models": settings.mock_models,
        "asr_provider": settings.asr_provider,
        "tts_provider": settings.tts_provider,
        "vision_provider": settings.vision_provider,
        "vision_model": settings.vision_model,
        "vision_configured": bool(settings.openai_next_api_key),
    }


@app.get("/api/debug/state")
def debug_state(request: Request):
    current_user_key = user_key(request)
    persisted_rows = database.load_state()
    total_counts: dict[str, int] = {}
    current_user_counts: dict[str, int] = {}
    known_user_keys: set[str] = set()
    for row in persisted_rows:
        entity_type = row["entity_type"]
        row_user_key = row["user_key"]
        known_user_keys.add(row_user_key)
        total_counts[entity_type] = total_counts.get(entity_type, 0) + 1
        if row_user_key == current_user_key:
            current_user_counts[entity_type] = current_user_counts.get(entity_type, 0) + 1
    return ok(
        {
            "current_user_key": current_user_key,
            "database_path": str(settings.database_path),
            "api_mode_hint": "real requests must include the same X-User-Key to see prior data",
            "current_user_counts": current_user_counts,
            "total_counts": total_counts,
            "known_user_key_count": len(known_user_keys),
            "known_user_key_prefixes": sorted(key[:8] for key in known_user_keys),
            "memory_counts": {
                "profiles": len(store.profiles),
                "plans": len(store.plans),
                "preview_tasks": len(store.preview_tasks),
                "recommendations": len(store.recommendation_records),
                "archives": len(store.archives),
                "sessions": len(store.sessions),
                "after_tasks": len(store.after_tasks),
                "voice_events": len(store.voice_events),
            },
        }
    )


@app.get("/api/mock/videos")
async def get_mock_videos():
    return ok(store.videos())


@app.post("/api/media/images")
async def upload_image(
    file: UploadFile = File(...),
    media_type: str = Form("current_hair"),
):
    if media_type not in {"current_hair", "after_hair"}:
        return failure("media_type 只支持 current_hair 或 after_hair")
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        return failure("只支持 JPEG、PNG、WEBP 图片")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        return failure("单张图片不能超过 10 MB")
    # save_image writes up to 10 MB to disk; keep that off the event loop.
    return ok(
        await run_in_threadpool(
            store.save_image,
            content=content,
            suffix=Path(file.filename or "").suffix.lower(),
            media_type=media_type,
        )
    )


@app.post("/api/hair-profiles")
def create_hair_profile(payload: dict[str, Any], request: Request):
    for key in ("entry_video_id", "current_image_id"):
        if key not in payload:
            return failure(f"缺少字段: {key}")
    current_image_path = store.image_path(payload["current_image_id"], media_type="current_hair")
    target_image_path = store.target_reference_path(payload["entry_video_id"])
    analysis = model_service.analyze_hair_profile(
        current_image_path=current_image_path or settings.media_dir / "__missing_current_image__",
        target_image_path=target_image_path,
    )
    vision_analysis = None
    if analysis is not None:
        vision_analysis = {
            "current_color": analysis.current_color,
            "current_color_options": analysis.current_color_options,
            "target_color": analysis.target_color,
            "target_color_options": analysis.target_color_options,
            "hair_length": analysis.hair_length,
            "hair_volume": analysis.hair_volume,
            "dye_history": analysis.dye_history,
            "attribute_confidences": analysis.attribute_confidences,
            "raw": analysis.raw,
            "fallback_reason": analysis.fallback_reason,
        }
    return ok(
        store.create_profile(
            payload["entry_video_id"],
            payload["current_image_id"],
            vision_analysis=vision_analysis,
            user_key=user_key(request),
        )
    )


@app.patch("/api/hair-profiles/{profile_id}")
def update_hair_profile(profile_id: str, payload: dict[str, Any], request: Request):
    return ok(store.update_profile(profile_id, payload, user_key=user_key(request)))


@app.post("/api/demo-profiles")
def create_demo_profile(payload: dict[str, Any], request: Request):
    for key in ("source_profile_id", "entry_video_id"):
        if key not in payload:
            return failure(f"缺少字段: {key}")
    return ok(
        store.create_demo_profile(
            payload["source_profile_id"],
            payload["entry_video_id"],
            user_key=user_key(request),
        )
    )


@app.post("/api/agent/plan-result")
def get_plan_result(payload: dict[str, Any], request: Request):
    current_user_key = user_key(request)
    profile = store.profile_for_rules(payload["profile_id"], user_key=current_user_key)
    rule_decision = color_rule_kb.evaluate_profile(profile)
    result = store.plan_result(payload["profile_id"], rule_decision, user_key=current_user_key)
    if result.get("preview_status") in {"queued", "generating"} and result.get("can_recommend_product"):
        enqueue_preview_generation(result["preview_task_id"], current_user_key)
    return ok(result)


@app.get("/api/preview-tasks/{preview_task_id}")
def get_preview_task(preview_task_id: str, request: Request):
    return ok(store.preview_task(preview_task_id, user_key=user_key(request)))


def enqueue_preview_generation(preview_task_id: str, owner_user_key: str) -> None:
    with preview_task_lock:
        if preview_task_id in active_preview_tasks:
            return
        active_preview_tasks.add(preview_task_id)
    preview_executor.submit(run_preview_generation, preview_task_id, owner_user_key)


def run_preview_generation(preview_task_id: str, owner_user_key: str) -> None:
    try:
        task = store.begin_preview_generation(preview_task_id, user_key=owner_user_key)
        if task is None:
            return
        images = generate_preview_images(
            preview_task_id,
            task["profile"],
            task["labels"],
            task["rule_decision"],
        )
        store.complete_preview_generation(preview_task_id, images, user_key=owner_user_key)
    except Exception as error:
        try:
            store.fail_preview_generation(
                preview_task_id,
                str(error),
                user_key=owner_user_key,
            )
        except Exception:
            pass
    finally:
        with preview_task_lock:
            active_preview_tasks.discard(preview_task_id)


def enqueue_after_video_generation(task_id: str, owner_user_key: str) -> None:
    with after_video_task_lock:
        if task_id in active_after_video_tasks:
            return
        active_after_video_tasks.add(task_id)
    after_video_executor.submit(run_after_video_generation, task_id, owner_user_key)


def run_after_video_generation(task_id: str, owner_user_key: str) -> None:
    try:
        task = store.begin_after_video_generation(task_id, user_key=owner_user_key)
        if task is None:
            return
        result = transition_video_service.generate(
            task_id=task_id,
            before_image_path=task["before_image_path"],
            after_image_path=task["after_image_path"],
        )
        store.complete_after_video_generation(task_id, result, user_key=owner_user_key)
    except Exception as error:
        try:
            store.fail_after_video_generation(task_id, str(error), user_key=owner_user_key)
        except Exception:
            pass
    finally:
        with after_video_task_lock:
            active_after_video_tasks.discard(task_id)


def generate_preview_images(
    preview_task_id: str,
    profile: dict,
    labels: list[str],
    rule_decision: dict | None = None,
) -> list[dict]:
    _ = labels
    generated_dir = settings.media_dir / "generated" / "previews" / preview_task_id
    generated_dir.mkdir(parents=True, exist_ok=True)
    current_hair = profile.get("current_hair", {})
    current_color = current_hair.get("color")
    if current_color is None and current_hair.get("regions"):
        current_color = current_hair["regions"].get("end", {}).get("color")
    target_color = profile.get("target_color", {})
    current_image_path = store.image_path(profile.get("current_image_id", ""), media_type="current_hair")
    if current_image_path is None or not current_image_path.exists():
        raise RuntimeError("hair_full_pipeline_current_image_not_found")

    rule_decision = rule_decision or {}
    color_rule = rule_decision.get("color_rule") or {}
    result_quality = color_rule.get("result_quality")

    target_family = color_rule.get("matched_color_name") or target_color.get("display_name") or "目标色"
    target_level = _int_or_default(target_color.get("level"), 8)
    current_level = _int_or_default((current_color or {}).get("level"), _int_or_default(color_rule.get("current_level"), 8))
    pipeline_plan = _hair_full_generation_plan(
        user_level=current_level,
        target_family=target_family,
        target_level=target_level,
        target_name=f"{target_family}{target_level}度",
    )
    if not pipeline_plan or not pipeline_plan.get("variants"):
        target_rgb = _rgb_tuple(target_color.get("rgb"))
        if target_rgb is None:
            raise RuntimeError("hair_full_pipeline_generation_plan_unavailable")
        pipeline_plan = {
            "base_color": {
                "rgb": list(target_rgb),
                "hex": _hex_from_rgb(target_rgb),
            },
            "variants": [
                {"key": key}
                for key in ("low", "cool", "standard", "warm", "high")
            ],
            "risk_variant": None,
        }
    base_color = pipeline_plan.get("base_color") or {}
    target_rgb = _rgb_tuple(base_color.get("rgb")) or _rgb_tuple(target_color.get("rgb"))
    if target_rgb is None:
        raise RuntimeError("hair_full_pipeline_target_rgb_unavailable")
    target_hex = str(base_color.get("hex") or _hex_from_rgb(target_rgb))
    has_risk = result_quality == "biased" or bool(pipeline_plan.get("risk_variant"))

    generator = _hair_full_generator()
    with Image.open(current_image_path).convert("RGB") as before_image:
        pipeline_result = generator.generate_hair_images(
            before_pil=before_image.copy(),
            target_family=target_family,
            target_level=target_level,
            target_rgb=target_rgb,
            target_hex=target_hex,
            user_level=current_level,
            has_risk=has_risk,
            output_dir=str(generated_dir),
        )

    selected_variants = _select_pipeline_preview_variants(
        pipeline_result.get("variants") or [],
        has_risk=has_risk,
    )
    if len(selected_variants) < 5:
        raise RuntimeError(f"hair_full_pipeline_generated_only_{len(selected_variants)}_variants")

    images: list[dict[str, Any]] = []
    for index, variant in enumerate(selected_variants[:5], start=1):
        output_path = Path(variant["path"])
        if not output_path.exists():
            raise RuntimeError(f"hair_full_pipeline_missing_variant:{variant.get('key')}")
        url = f"/media/generated/previews/{preview_task_id}/{output_path.name}"
        images.append({
            "preview_level": index,
            "label": variant["label"],
            "url": url,
            "storage_key": url.removeprefix("/media/"),
            "enabled": True,
        })

    return images


def _hair_full_generator() -> Any:
    global hair_full_generator_module
    if hair_full_generator_module is None:
        hair_full_generator_module = _import_hair_full_pipeline_module("glm_hair_generator")
    _configure_hair_full_generator(hair_full_generator_module)
    return hair_full_generator_module


def _hair_full_engine() -> Any:
    global hair_full_engine_module
    if hair_full_engine_module is None:
        hair_full_engine_module = _import_hair_full_pipeline_module("hair_dye_engine")
    return hair_full_engine_module


def _import_hair_full_pipeline_module(module_name: str) -> Any:
    pipeline_dir = PROJECT_ROOT / "hair_full_pipeline"
    original_path = list(sys.path)
    sys.path.insert(0, str(pipeline_dir))
    try:
        return importlib.import_module(module_name)
    finally:
        sys.path[:] = original_path


def _configure_hair_full_generator(module: Any) -> None:
    pipeline_settings = getattr(module, "settings", None)
    current_api_key = str(getattr(pipeline_settings, "OPENROUTER_API_KEY", "") or "")
    current_model = str(getattr(pipeline_settings, "OPENROUTER_MODEL", "") or "")
    current_api_url = str(getattr(pipeline_settings, "OPENROUTER_API_URL", "") or "")
    api_key = settings.openrouter_api_key or os.getenv("OPENROUTER_API_KEY") or current_api_key
    model = os.getenv("OPENROUTER_IMAGE_MODEL") or os.getenv("OPENROUTER_MODEL") or current_model or settings.openrouter_image_model
    api_url = (
        os.getenv("OPENROUTER_API_URL")
        or current_api_url
        or f"{settings.openrouter_base_url.rstrip('/')}/chat/completions"
    )
    os.environ["OPENROUTER_API_KEY"] = api_key
    os.environ["OPENROUTER_MODEL"] = model
    os.environ["OPENROUTER_API_URL"] = api_url
    if pipeline_settings is not None:
        setattr(pipeline_settings, "OPENROUTER_API_KEY", api_key)
        setattr(pipeline_settings, "OPENROUTER_MODEL", model)
        setattr(pipeline_settings, "OPENROUTER_API_URL", api_url)


def _select_pipeline_preview_variants(variants: list[dict[str, Any]], *, has_risk: bool) -> list[dict[str, Any]]:
    by_key = {
        str(variant.get("key")): variant
        for variant in variants
        if variant.get("key") and variant.get("path")
    }
    preferred_keys = (
        ["risk", "low", "standard", "cool", "high"]
        if has_risk and "risk" in by_key
        else ["low", "cool", "standard", "warm", "high"]
    )
    selected = [by_key[key] for key in preferred_keys if key in by_key]
    selected_keys = {str(variant.get("key")) for variant in selected}
    for variant in variants:
        key = str(variant.get("key"))
        if key not in selected_keys and variant.get("path"):
            selected.append(variant)
            selected_keys.add(key)
    return selected


def _hair_full_generation_plan(
    *,
    user_level: int,
    target_family: str,
    target_level: int,
    target_name: str,
) -> dict[str, Any] | None:
    try:
        module = _hair_full_engine()
        plan = module.plan_generation(user_level, target_family, target_level, target_name)
        return plan if isinstance(plan, dict) else None
    except Exception:
        return None


def _rgb_tuple(value: Any) -> tuple[int, int, int] | None:
    if isinstance(value, dict):
        value = [value.get("r"), value.get("g"), value.get("b")]
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        return None
    try:
        return (int(value[0]), int(value[1]), int(value[2]))
    except (TypeError, ValueError):
        return None


def _hex_from_rgb(rgb: tuple[int, int, int]) -> str:
    r, g, b = rgb
    return f"#{r:02X}{g:02X}{b:02X}"


def _int_or_default(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@app.post("/api/agent/product-recommendations")
def get_product_recommendations(payload: dict[str, Any], request: Request):
    for key in ("profile_id", "plan_id", "selected_route", "selected_preview_level", "budget"):
        if key not in payload:
            return failure(f"缺少字段: {key}")
    return ok(store.recommendations(payload, user_key=user_key(request), product_kb=product_kb))


@app.post("/api/hair-dye-archives")
def create_archive(payload: dict[str, Any], request: Request):
    for key in ("profile_id", "plan_id", "recommendation_id", "sku_id", "purchase_status"):
        if key not in payload:
            return failure(f"缺少字段: {key}")
    return ok(store.create_archive(payload, user_key=user_key(request)))


@app.get("/api/hair-dye-archives")
def get_archives(request: Request):
    return ok(store.archive_list(user_key=user_key(request)))


@app.get("/api/hair-dye-archives/{archive_id}")
def get_archive(archive_id: str, request: Request):
    return ok(store.archive(archive_id, user_key=user_key(request)))


@app.post("/api/tutorial-sessions")
def create_tutorial_session(payload: dict[str, Any], request: Request):
    return ok(store.create_session(payload["archive_id"], user_key=user_key(request)))


@app.get("/api/tutorial-sessions/{tutorial_session_id}")
def get_tutorial_session(tutorial_session_id: str, request: Request):
    return ok(store.session(tutorial_session_id, user_key=user_key(request)))


@app.post("/api/tutorial-sessions/{tutorial_session_id}/completion-record")
def complete_tutorial(tutorial_session_id: str, payload: dict[str, Any], request: Request):
    qa_summary = payload.get("qa_summary") or []
    if not isinstance(qa_summary, list):
        return failure("qa_summary 必须是数组")
    record = store.complete_tutorial(tutorial_session_id, qa_summary=qa_summary, user_key=user_key(request))
    return ok(record)


@app.post("/api/tutorial-sessions/{tutorial_session_id}/voice-input")
async def voice_input(
    tutorial_session_id: str,
    request: Request,
    audio: UploadFile = File(...),
    current_step_id: str = Form(...),
    client_event_id: str = Form(...),
):
    if not current_step_id or not client_event_id:
        return failure("current_step_id 和 client_event_id 为必填字段")
    current_user_key = user_key(request)
    existing_event = store.voice_event(tutorial_session_id, client_event_id, user_key=current_user_key)
    if existing_event is not None:
        return ok(existing_event)

    stored_audio = await audio_storage.save_upload(
        file=audio,
        tutorial_session_id=tutorial_session_id,
        client_event_id=client_event_id,
    )

    # ffmpeg transcoding, local ASR inference and the downstream LLM/KB calls are
    # all synchronous and slow. Running them inline would block the event loop for
    # the whole request, stalling every other user. Hand them to the threadpool.
    return ok(
        await run_in_threadpool(
            _process_voice_input,
            stored_audio=stored_audio,
            tutorial_session_id=tutorial_session_id,
            current_step_id=current_step_id,
            client_event_id=client_event_id,
            current_user_key=current_user_key,
        )
    )


def _process_voice_input(
    *,
    stored_audio: Any,
    tutorial_session_id: str,
    current_step_id: str,
    client_event_id: str,
    current_user_key: str,
) -> dict[str, Any]:
    """Blocking half of the voice pipeline, executed off the event loop."""
    asr_input_path = stored_audio.original_path
    # Only the local SenseVoice model needs a 16 kHz mono WAV. Cloud endpoints
    # accept the browser's native recording directly, so transcoding there just
    # spawns an ffmpeg subprocess for nothing — and makes ffmpeg a hard install
    # requirement it does not need to be.
    if not settings.mock_models and settings.asr_provider == "sensevoice":
        asr_input_path = audio_converter.to_sensevoice_wav(stored_audio.original_path)

    transcribe_result = model_service.transcribe_audio(
        asr_input_path,
        original_filename=stored_audio.original_filename,
    )
    return tutorial_service.handle_voice_input(
        tutorial_session_id=tutorial_session_id,
        current_step_id=current_step_id,
        client_event_id=client_event_id,
        transcribe_result=transcribe_result,
        user_key=current_user_key,
    )


@app.post("/api/tutorial-sessions/{tutorial_session_id}/after-photo")
def submit_after_photo(tutorial_session_id: str, payload: dict[str, Any], request: Request):
    current_user_key = user_key(request)
    result = store.after_photo(tutorial_session_id, payload["after_image_id"], user_key=current_user_key)
    enqueue_after_video_generation(result["generation_task_id"], current_user_key)
    return ok(result, message="generating")


@app.get("/api/after-video-tasks/{generation_task_id}")
def get_after_video_task(generation_task_id: str, request: Request):
    return ok(store.after_task(generation_task_id, user_key=user_key(request)))
