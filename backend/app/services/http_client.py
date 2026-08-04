"""Shared HTTP client with connection pooling.

Every upstream call used to open a fresh connection through ``urllib``, paying a
full TCP + TLS handshake each time. Routing through one pooled ``httpx.Client``
keeps connections alive between calls, which matters most for the relay hosts
(openai-next / siliconflow) where the handshake is a cross-border round trip.
"""

from __future__ import annotations

import json
from threading import Lock
from typing import Any

import httpx


USER_AGENT = "Mozilla/5.0 AppleWebKit/537.36 Chrome/126 Safari/537.36"

_client: httpx.Client | None = None
_client_lock = Lock()


class UpstreamError(RuntimeError):
    """Raised for any non-2xx or transport-level upstream failure."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def get_client(*, max_connections: int = 64, max_keepalive: int = 32) -> httpx.Client:
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = httpx.Client(
                    limits=httpx.Limits(
                        max_connections=max_connections,
                        max_keepalive_connections=max_keepalive,
                        keepalive_expiry=60.0,
                    ),
                    headers={"User-Agent": USER_AGENT},
                    follow_redirects=True,
                )
    return _client


def close_client() -> None:
    global _client
    with _client_lock:
        if _client is not None:
            _client.close()
            _client = None


def post_json(
    url: str,
    *,
    payload: dict[str, Any],
    api_key: str | None,
    timeout: float,
    label: str,
) -> dict[str, Any]:
    """POST JSON and return the decoded object.

    ``label`` is used to build error strings in the same
    ``<label>_http_<code>:<detail>`` shape the previous urllib code produced, so
    downstream error handling and stored ``fallback_reason`` values keep working.
    """
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        response = get_client().post(url, json=payload, headers=headers, timeout=timeout)
    except httpx.HTTPError as error:
        raise UpstreamError(f"{label}_network_error:{error}") from error

    if response.status_code >= 400:
        raise UpstreamError(
            f"{label}_http_{response.status_code}:{response.text[:300]}",
            status_code=response.status_code,
        )

    try:
        parsed = response.json()
    except json.JSONDecodeError as error:
        raise UpstreamError(f"{label}_invalid_json:{response.text[:200]}") from error

    if not isinstance(parsed, dict):
        raise UpstreamError(f"{label}_response_not_object")
    return parsed
