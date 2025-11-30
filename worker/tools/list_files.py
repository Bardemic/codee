import subprocess
from langchain.tools import tool, ToolRuntime
from utils import emit_status


@tool
def list_files(path: str, runtime: ToolRuntime) -> str:
    """List files in a given path using ls command. Use empty string or '.' to list root directory."""
    ctx = runtime.context
    docker_name = ctx.docker_name
    agent_id = ctx.agent_id
    
    emit_status(agent_id, "running", step="tool_list_files", detail=f"listing: {path if path != '.' else 'root'}")
    
    cmd = [
        "docker", "exec", docker_name, "sh", "-c", f"cd app && ls {path}"
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=30)
        return out.decode("utf-8", errors="replace")
    except subprocess.CalledProcessError as e:
        return "error running ls: " + e.output.decode()

