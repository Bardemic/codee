import asyncio
import importlib
import inspect
import json
from typing import Any

from .grep import grep
from .list_files import list_files
from .read_file import read_file
from .update_file import update_file

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import StructuredTool
from mcp.shared.exceptions import McpError
from utils import emit_status

__all__ = ["grep", "list_files", "read_file", "update_file", "load_tools"]


def _stringify_payload(payload: Any) -> str:
    try:
        text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False, default=str)
    except Exception:
        text = str(payload)
    return text if len(text) <= 5000 else text[:5000] + "..."


def _prepare_arguments_snapshot(args: tuple[Any, ...], kwargs: dict[str, Any]) -> Any:
    filtered = {key: val for key, val in kwargs.items() if key not in {"run_manager", "config"}}
    return args[0] if len(args) == 1 and not filtered else (filtered if not args else {"args": args, "kwargs": filtered})


def _prepare_result_snapshot(result: Any) -> Any:
    return (
        {"content": result[0], "artifact": result[1]}
        if isinstance(result, tuple) and len(result) == 2
        else result
    )


def _emit_tool_record(agent_id: int | None, tool_name: str, phase: str, arguments: Any, result: Any):
    if agent_id:
        emit_status(
            agent_id,
            phase,
            step=f"tool_{tool_name}",
            detail=_stringify_payload(result),
            arguments=_stringify_payload(arguments),
        )


def _ensure_sync_tool(tool):
    if not (isinstance(tool, StructuredTool) and tool.func is None and tool.coroutine):
        return tool

    def _sync_func(*args, config: RunnableConfig, **kwargs):
        agent_id = config.get("configurable").get("agent_id")
        args_snapshot = _prepare_arguments_snapshot(args, kwargs)

        try:
            res = asyncio.run(tool.coroutine(*args, **kwargs))
            _emit_tool_record(agent_id, tool.name, "success", args_snapshot, _prepare_result_snapshot(res))
            return res
        except McpError as exc:
            msg = f"MCP tool '{tool.name}' failed: {exc}"
            _emit_tool_record(agent_id, tool.name, "failed", args_snapshot, {"error": msg})
            return (msg, None) if getattr(tool, "response_format", "content") == "content_and_artifact" else msg
        except Exception as exc:
            _emit_tool_record(agent_id, tool.name, "failed", args_snapshot, {"error": str(exc)})
            raise

    tool.func = _sync_func
    return tool


async def load_tools(slugs: list[str]) -> tuple[list, list]:
    loaded = []
    prompts = []
    for slug in slugs:
        if "/" not in slug:
            raise ValueError("Slug must be in the format '<folder>/<file>'")
        folder, fname = slug.split("/", 1)
        mod = importlib.import_module(f"{__name__}.{folder}.{fname}")
        if not (getter := getattr(mod, "get_tools", None)):
            raise AttributeError(f"{mod.__name__} missing get_tools")
        if not (prompt := getattr(mod, "prompt", None)):
            raise AttributeError(f"{mod.__name__} missing prompts")
        
        tools = getter()
        if inspect.isawaitable(tools):
            tools = await tools
        loaded.extend(_ensure_sync_tool(t) for t in tools)
        prompts.append(prompt)
    return (loaded, prompts)

