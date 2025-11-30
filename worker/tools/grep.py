import subprocess
from langchain.tools import tool, ToolRuntime
from utils import emit_status


@tool
def grep(command: str, runtime: ToolRuntime) -> str:
    """Given a grep command, runs command in the docker environment"""
    ctx = runtime.context
    docker_name = ctx.docker_name
    agent_id = ctx.agent_id
    
    emit_status(agent_id, "running", step="tool_grep", detail=f"grep: {command[:50]}")
    
    cmd = [
       "docker", "exec", docker_name, "sh", "-c", f"cd app && {command}"
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=30)
        return out.decode("utf-8", errors="replace")
    except subprocess.CalledProcessError as e:
        return "error running grep: " + e.output.decode()

