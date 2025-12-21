import redis
import os
import time
import logging
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)

STREAM_REDIS_URL = os.getenv("STREAM_REDIS_URL", "redis://localhost:6379/2")
_stream_client: Optional[redis.Redis] = None

current_file = Path(__file__).resolve()
default_root = current_file.parents[1] if len(current_file.parents) > 1 else current_file.parent
WORKSPACES_ROOT = Path(os.getenv("WORKSPACES_ROOT", str(default_root / ".data/agents")))


def get_stream_client() -> redis.Redis:
    global _stream_client
    if _stream_client is None:
        _stream_client = redis.Redis.from_url(STREAM_REDIS_URL, decode_responses=True)
    return _stream_client


def publish_stream_event(agent_id: int, event: str, **fields):
    payload = {
        "event": event,
        "agent_id": str(agent_id),
        "ts": str(int(time.time() * 1000)),
        **{key: str(val) for key, val in fields.items() if val is not None}
    }
    try:
        get_stream_client().xadd(
            f"stream:agent:{agent_id}",
            payload,
            maxlen=5000,
            approximate=True
        )
    except Exception as exc:
        logger.warning("failed to publish stream event: %s", exc)


def emit_status(
    agent_id: int,
    phase: str,
    step: str | None = None,
    detail: str | None = None,
    **extra_fields,
):
    publish_stream_event(
        agent_id,
        "status",
        phase=phase,
        step=step,
        detail=detail,
        **{key: value for key, value in extra_fields.items() if value is not None},
    )


def emit_error(agent_id: int, code: str, message: str, step: str | None = None):
    publish_stream_event(agent_id, "error", code=code, message=message, step=step)


def emit_done(agent_id: int, reason: str):
    publish_stream_event(agent_id, "done", reason=reason)


def get_workspace_path(agent_id: int) -> str:
    return str(WORKSPACES_ROOT / str(agent_id))

