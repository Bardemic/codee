import os
from dulwich.repo import Repo
from langchain.tools import tool, ToolRuntime
from utils import emit_status, get_workspace_path


@tool
def update_file(path: str, content: str, runtime: ToolRuntime) -> str:
    """Update a file based off path, and given content"""
    ctx = runtime.context
    workspace_id = ctx.workspace_id

    workspace_path = get_workspace_path(workspace_id)
    if not os.path.isdir(workspace_path):
        return "workspace not found."

    emit_status(workspace_id, "running", step="tool_update_file", detail=f"updating: {path}")
    
    repo = Repo(workspace_path)
    full_path = os.path.join(workspace_path, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)
    repo.get_worktree().stage([path.encode()])
    return "file updated"

