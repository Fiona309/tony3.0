"""Transition video generation through the OpenAI-Next draw endpoint."""

from __future__ import annotations

import base64
import io
import json
import mimetypes
import time
from pathlib import Path
from typing import Any, Optional
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

from ..config import Settings


MAX_TRANSITION_IMAGE_SIZE = 1024
TRANSITION_IMAGE_JPEG_QUALITY = 85

TRANSITION_PROMPT = """一镜到底的真实染发前后转场，5 秒竖屏 9:16。

第 0 秒严格匹配第一张图：人物正面展示染前发色。镜头缓慢靠近，人物轻轻甩头或抬手拨动头发；在发丝自然摆动的瞬间，发色从发梢开始柔和流动、逐步染开至整头。第 4 至 5 秒严格匹配第二张图：同一人物、同一发型长度、同一刘海、同一脸部、同一背景和机位，只呈现目标染后发色的光泽与层次，最后稳定定格。

效果必须是自然的头发颜色渐变，不要改变脸型、五官、发型结构、衣服、姿势或背景；不要新增人物或手；不要文字、字幕、贴纸、水印、滤镜、卡通感或夸张特效。真实手机美发记录质感，自然光，保留发丝纹理。"""


class TransitionVideoService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def generate(
        self,
        *,
        task_id: str,
        before_image_path: Path,
        after_image_path: Path,
    ) -> dict[str, Any]:
        if not self._api_key:
            raise RuntimeError(f"{self.settings.transition_video_provider}_API_KEY_not_configured")
        if not before_image_path.exists():
            raise RuntimeError("before_image_not_found")
        if not after_image_path.exists():
            raise RuntimeError("after_image_not_found")

        output_dir = self.settings.media_dir / "generated" / "after-videos" / task_id
        output_dir.mkdir(parents=True, exist_ok=True)

        response = self._request_generation(before_image_path, after_image_path)
        video_bytes = self._extract_video_bytes(response)
        video_path = output_dir / "transition.mp4"
        video_path.write_bytes(video_bytes)

        cover_path = output_dir / "cover.jpg"
        cover_path.write_bytes(after_image_path.read_bytes())

        storage_key = video_path.relative_to(self.settings.media_dir).as_posix()
        cover_storage_key = cover_path.relative_to(self.settings.media_dir).as_posix()
        return {
            "url": f"/media/{storage_key}",
            "storage_key": storage_key,
            "cover_url": f"/media/{cover_storage_key}",
            "cover_storage_key": cover_storage_key,
            "provider": f"openai-next-{self.settings.transition_video_provider}",
            "model": self.settings.transition_video_model,
            "prompt": TRANSITION_PROMPT,
        }

    def _request_generation(self, before_image_path: Path, after_image_path: Path) -> dict[str, Any]:
        if self._is_wan:
            payload = {
                "model": self.settings.transition_video_model,
                "input": {
                    "first_frame_url": self._image_data_url(before_image_path),
                    "last_frame_url": self._image_data_url(after_image_path),
                    "prompt": TRANSITION_PROMPT,
                },
                "parameters": {
                    "resolution": self.settings.transition_video_wan_resolution,
                    "prompt_extend": False,
                },
            }
            return self._post_json(
                "/wan/api/v1/services/aigc/image2video/video-synthesis",
                payload,
                extra_headers={"X-DashScope-Async": "enable"},
            )

        endpoint = self.settings.transition_video_endpoint
        payload = {
            "model": self.settings.transition_video_model,
            "prompt": TRANSITION_PROMPT,
            "duration": 5,
            "size": "480x854",
            "aspect_ratio": "9:16",
            "images": [
                self._image_data_url(before_image_path),
                self._image_data_url(after_image_path),
            ],
            "first_frame_image": self._image_data_url(before_image_path),
            "last_frame_image": self._image_data_url(after_image_path),
        }
        return self._post_json(endpoint, payload)

    def _post_json(
        self,
        endpoint: str,
        payload: dict[str, Any],
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        url = f"{self._base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "User-Agent": "meifa-backend/1.0",
        }
        if extra_headers:
            headers.update(extra_headers)
        request = urlrequest.Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urlrequest.urlopen(
                request,
                timeout=self.settings.transition_video_timeout_seconds,
            ) as response:
                body = response.read().decode("utf-8")
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"{self.settings.transition_video_provider}_api_http_{error.code}:{detail[:500]}"
            ) from error
        except URLError as error:
            raise RuntimeError(
                f"{self.settings.transition_video_provider}_api_network_error:{error.reason}"
            ) from error
        parsed = json.loads(body)
        if not isinstance(parsed, dict):
            raise RuntimeError(f"{self.settings.transition_video_provider}_api_response_not_object")
        return parsed

    def _extract_video_bytes(self, response: dict[str, Any]) -> bytes:
        immediate = self._video_bytes_from_response(response)
        if immediate is not None:
            return immediate

        task_id = self._task_id_from_response(response)
        if task_id:
            return self._wait_for_task_video(task_id)

        raise RuntimeError(f"draw_api_missing_video_url:{json.dumps(response, ensure_ascii=False)[:500]}")

    def _video_bytes_from_response(self, response: dict[str, Any]) -> Optional[bytes]:
        item = self._primary_item(response)
        if not isinstance(item, dict):
            return None

        b64_video = self._find_value(item, {"b64_json", "video_b64", "base64", "video_base64"})
        if isinstance(b64_video, str) and b64_video.strip():
            return base64.b64decode(b64_video)

        video_url = self._find_value(
            item,
            {"url", "video_url", "output_url", "download_url", "file_url"},
        )
        if isinstance(video_url, str) and video_url.strip():
            return self._download_video(video_url)
        return None

    def _wait_for_task_video(self, task_id: str) -> bytes:
        deadline = time.monotonic() + self.settings.transition_video_timeout_seconds
        last_response: dict[str, Any] | None = None
        while time.monotonic() < deadline:
            time.sleep(30 if self._is_wan else 5)
            last_response = self._request_task(task_id)
            video_bytes = self._video_bytes_from_response(last_response)
            if video_bytes is not None:
                return video_bytes
            status = self._task_status(last_response)
            if status in {"completed", "complete", "succeeded", "success"}:
                if self._is_wan:
                    continue
                return self._download_task_content(task_id)
            if status in {"failed", "fail", "error", "cancelled", "canceled"}:
                raise RuntimeError(
                    f"draw_task_failed:{json.dumps(last_response, ensure_ascii=False)[:500]}"
                )
        detail = json.dumps(last_response or {}, ensure_ascii=False)[:500]
        raise RuntimeError(f"draw_task_timeout:{task_id}:{detail}")

    def _request_task(self, task_id: str) -> dict[str, Any]:
        endpoint = f"/wan/api/v1/tasks/{task_id}" if self._is_wan else f"/v1/tasks/{task_id}"
        url = f"{self._base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        request = urlrequest.Request(
            url,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "User-Agent": "meifa-backend/1.0",
            },
            method="GET",
        )
        try:
            with urlrequest.urlopen(
                request,
                timeout=self.settings.transition_video_timeout_seconds,
            ) as response:
                body = response.read().decode("utf-8")
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"draw_task_http_{error.code}:{detail[:500]}") from error
        except URLError as error:
            raise RuntimeError(f"draw_task_network_error:{error.reason}") from error
        parsed = json.loads(body)
        if not isinstance(parsed, dict):
            raise RuntimeError("draw_task_response_not_object")
        return parsed

    def _download_task_content(self, task_id: str) -> bytes:
        endpoint = self.settings.transition_video_endpoint.rstrip("/")
        url = f"{self._base_url.rstrip('/')}/{endpoint.lstrip('/')}/{task_id}/content"
        request = urlrequest.Request(
            url,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "User-Agent": "meifa-backend/1.0",
            },
            method="GET",
        )
        try:
            with urlrequest.urlopen(
                request,
                timeout=self.settings.transition_video_timeout_seconds,
            ) as response:
                return response.read()
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"draw_task_content_http_{error.code}:{detail[:500]}") from error
        except URLError as error:
            raise RuntimeError(f"draw_task_content_network_error:{error.reason}") from error

    @property
    def _is_wan(self) -> bool:
        return self.settings.transition_video_provider == "wan"

    @property
    def _base_url(self) -> str:
        if self._is_wan:
            return self.settings.openai_next_base_url
        return self.settings.draw_base_url

    @property
    def _api_key(self) -> str | None:
        if self._is_wan:
            return self.settings.openai_next_api_key
        return self.settings.draw_api_key

    @staticmethod
    def _primary_item(response: dict[str, Any]) -> dict[str, Any]:
        data = response.get("data")
        if isinstance(data, list) and data and isinstance(data[0], dict):
            return data[0]
        if isinstance(data, dict):
            return data
        return response

    @classmethod
    def _task_id_from_response(cls, response: dict[str, Any]) -> Optional[str]:
        item = cls._primary_item(response)
        task_id = cls._find_value(
            item,
            {"id", "task_id", "taskId", "generation_id", "generationId"},
        )
        return str(task_id) if task_id else None

    @classmethod
    def _task_status(cls, response: dict[str, Any]) -> str:
        item = cls._primary_item(response)
        status = cls._find_value(item, {"status", "state", "task_status", "taskStatus"})
        normalized = str(status or "").strip().lower()
        if normalized:
            return normalized
        progress = cls._find_value(item, {"progress"})
        if str(progress or "").strip() == "100%":
            return "completed"
        return ""

    @classmethod
    def _find_value(cls, data: Any, keys: set[str]) -> Any:
        if isinstance(data, dict):
            for key in keys:
                if key in data and data[key]:
                    return data[key]
            for value in data.values():
                found = cls._find_value(value, keys)
                if found:
                    return found
        elif isinstance(data, list):
            for item in data:
                found = cls._find_value(item, keys)
                if found:
                    return found
        return None

    def _download_video(self, video_url: str) -> bytes:
        request = urlrequest.Request(
            video_url,
            headers={"User-Agent": "meifa-backend/1.0"},
            method="GET",
        )
        try:
            with urlrequest.urlopen(
                request,
                timeout=self.settings.transition_video_timeout_seconds,
            ) as response:
                return response.read()
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"draw_video_download_http_{error.code}:{detail[:500]}") from error
        except URLError as error:
            raise RuntimeError(f"draw_video_download_network_error:{error.reason}") from error

    @staticmethod
    def _image_data_url(path: Path) -> str:
        try:
            from PIL import Image

            with Image.open(path) as image:
                image = image.convert("RGB")
                image.thumbnail((MAX_TRANSITION_IMAGE_SIZE, MAX_TRANSITION_IMAGE_SIZE), Image.LANCZOS)
                buffer = io.BytesIO()
                image.save(buffer, format="JPEG", quality=TRANSITION_IMAGE_JPEG_QUALITY, optimize=True)
            mime_type = "image/jpeg"
            raw = buffer.getvalue()
        except Exception:
            mime_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
            raw = path.read_bytes()
        data = base64.b64encode(raw).decode("ascii")
        return f"data:{mime_type};base64,{data}"
