import subprocess
from langchain.tools import tool, ToolRuntime
from utils import emit_status


@tool
def read_file(path: str, runtime: ToolRuntime) -> str:
    """Read a full file's contents using 'cat' from the path"""
    ctx = runtime.context
    docker_name = ctx.docker_name
    agent_id = ctx.agent_id
    
    emit_status(agent_id, "running", step="tool_read_file", detail=f"reading: {path}")
    
    cmd = [
        "docker", "exec", docker_name, "sh", "-c", f"cd app && cat {path}"
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=30)
        return out.decode("utf-8", errors="replace")
    except subprocess.CalledProcessError as e:
        return "error running cat: " + e.output.decode()

