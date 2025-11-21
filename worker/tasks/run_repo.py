from celery_app import celery_app
import httpx
import subprocess, os, uuid, time, logging
from typing import Optional
from dulwich import porcelain
from dulwich.repo import Repo
from dotenv import load_dotenv
from langchain.agents import create_agent
import redis

load_dotenv()

logger = logging.getLogger(__name__)

STREAM_REDIS_URL = os.getenv("STREAM_REDIS_URL", "redis://localhost:6379/2")
_stream_client: Optional[redis.Redis] = None


def get_stream_client() -> redis.Redis:
    global _stream_client
    if _stream_client is None:
        _stream_client = redis.Redis.from_url(STREAM_REDIS_URL, decode_responses=True)
    return _stream_client


def publish_stream_event(workspace_id: int, event: str, **fields):
    payload = {
        "event": event,
        "workspace_id": str(workspace_id),
        "ts": str(int(time.time() * 1000)),
        **{key: str(val) for key, val in fields.items() if val is not None}
    }
    try:
        get_stream_client().xadd(
            f"stream:workspace:{workspace_id}",
            payload,
            maxlen=5000,
            approximate=True
        )
    except Exception as exc:
        logger.warning("failed to publish stream event: %s", exc)


def emit_status(workspace_id: int, phase: str, step: str | None = None, detail: str | None = None):
    publish_stream_event(workspace_id, "status", phase=phase, step=step, detail=detail)


def emit_error(workspace_id: int, code: str, message: str, step: str | None = None):
    publish_stream_event(workspace_id, "error", code=code, message=message, step=step)

def emit_done(workspace_id: int, reason: str):
    publish_stream_event(workspace_id, "done", reason=reason)


def update_workspace_status(workspace_id: int, status: str):
    """Update the workspace status in Django"""
    try:
        httpx.post(f"http://127.0.0.1:5001/api/internals/workspaces/{workspace_id}/status/", json={
            "status": status
        }, timeout=10.0)
    except Exception as exc:
        logger.warning("failed to update workspace status: %s", exc)


def persist_tool_calls_from_redis(workspace_id: int, message_id: int):
    try:
        stream_key = f"stream:workspace:{workspace_id}"
        events = get_stream_client().xrange(stream_key, min='-', max='+')
        
        tool_calls_data = []
        for event_id, fields in events:
            if fields.get("event") == "status" and fields.get("step", "").startswith("tool_"):
                event_id_str = event_id if isinstance(event_id, str) else event_id.decode()
                try:
                    tool_calls_data.append({
                        'timestamp_ms': int(event_id_str.split('-')[0]),
                        'tool_name': fields.get("step"),
                        'detail': fields.get('detail', ''),
                        'status': fields.get('phase', 'success'),
                    })
                except (TypeError, ValueError):
                    continue
        
        if tool_calls_data:
            httpx.post(
                f"http://127.0.0.1:5001/api/internals/workspaces/{workspace_id}/bulk-tool-calls/",
                json={'message_id': message_id, 'tool_calls': tool_calls_data},
                timeout=30.0
            )
    except Exception as exc:
        logger.warning("persist issue: %s", exc)


def reset_workspace_stream(workspace_id: int):
    try:
        get_stream_client().delete(f"stream:workspace:{workspace_id}")
    except Exception as exc:
        logger.warning("reset stream error: %s", exc)

def getToken(workspace_id: int):
    r = httpx.get(f"http://127.0.0.1:5001/api/internals/workspaces/{workspace_id}/token/")
    #need to implement error handling for when !token
    return r.json()["token"]

def _generate_branch_name(workspace_id: int) -> str:
    return f"codee/workspace-{workspace_id}-{uuid.uuid4().hex[:8]}"


def createWorkspace(full_name: str, workspace_id: int):
    repo_url = f"https://x-access-token:{getToken(workspace_id)}@github.com/{full_name}.git"
    clone_directory = f"/Users/brandonpieczka/repos/codee/.data/workspaces/{workspace_id}"
    porcelain.clone(repo_url, clone_directory)
    repo = porcelain.open_repo(clone_directory)
    branch_name = None
    if repo:
        branch_name = _generate_branch_name(workspace_id)
        porcelain.branch_create(repo, branch_name)
        porcelain.checkout_branch(repo, branch_name)
    return workspace_id, branch_name

def getWorkspacePath(workspace_id: int):
    path = f"/Users/brandonpieczka/repos/codee/.data/workspaces/{workspace_id}"
    if not os.path.isdir(path): 
        return None
    return path

def mountWorkspaceToDocker(workspace_id: int, docker_name: str):
    path = getWorkspacePath(workspace_id)
    if not path: 
        return -1
    cmd = [
        "docker", "run", "-d",
        "--name", docker_name,
        "-v", f"{path}:/app", "nginx:latest"
    ]
    try:
        subprocess.run(cmd, check=False)
        return 1
    except subprocess.CalledProcessError:
        return -1

def unmountDockerWorkspace(docker_name: str):
    cmd1 = ["docker", "stop", docker_name]
    cmd2 = ["docker", "rm", docker_name]
    try:
        subprocess.run(cmd1, check=False)
        subprocess.run(cmd2, check=False)
    except Exception:
        pass

def grep(command: str, docker_name: str):
    cmd = [
       "docker", "exec", docker_name, "sh", "-c", f"cd app && {command}"
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=30)
        return out.decode("utf-8", errors="replace")
    except subprocess.CalledProcessError as e:
        return "error running grep: " + e.output.decode()

def listFiles(path: str, docker_name: str):
    cmd = [
        "docker", "exec", docker_name, "sh", "-c", f"cd app && ls {path}"
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=30)
        return out.decode("utf-8", errors="replace")
    except subprocess.CalledProcessError as e:
        return "error running ls: " + e.output.decode()

def readFile(path: str, docker_name: str):
    cmd = [
        "docker", "exec", docker_name, "sh", "-c", f"cd app && cat {path}"
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=30)
        return out.decode("utf-8", errors="replace")
    except subprocess.CalledProcessError as e:
        return "error running cat: " + e.output.decode()

def updateFile(path: str, content: str, workspace_id):
    workspacePath = f"/Users/brandonpieczka/repos/codee/.data/workspaces/{workspace_id}"
    if not os.path.isdir(workspacePath):
        return "workspace not found."
    repo = Repo(workspacePath)
    full_path = os.path.join(workspacePath, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)
    repo.get_worktree().stage([path.encode()])
    return "file updated"

@celery_app.task(name="tasks.pipeline", bind=True)
def pipeline(self, github_repo_name: str, prompt: str, workspace_id: int):
    dockerId = str(uuid.uuid4())
    reset_workspace_stream(workspace_id)
    emit_status(workspace_id, "starting", step="init", detail="preparing workspace")
    update_workspace_status(workspace_id, "RUNNING")
    success = False
    try:
        workspaceId, branch_name = createWorkspace(github_repo_name, workspace_id)

        if not workspaceId: 
            emit_error(workspace_id, "workspace_not_found", "repository not found", step="create_workspace")
            return {"error": "repository not found"}
        if not branch_name:
            emit_error(workspace_id, "branch_creation_failed", "failed to create workspace branch", step="create_workspace")
            return {"error": "branch creation failed"}

        if mountWorkspaceToDocker(workspaceId, dockerId) < 0: 
            emit_error(workspace_id, "docker_mount_failed", "docker mount failed", step="mount_workspace")
            return {"error": "docker mount failed"}

        def runUpdateFile(path: str, content: str):
            """Update a file based off path, and given content"""
            emit_status(workspace_id, "running", step="tool_update_file", detail=f"updating: {path}")
            result = updateFile(path, content, workspaceId)
            return result

        def runListFiles(path: str = ""):
            """run ls on the codebase in order to view files. path variable is to see inside folders (for example, a passing in "./backend" will do "ls ./backend"). leave empty to see root."""
            emit_status(workspace_id, "running", step="tool_list_files", detail=f"listing: {path or 'root'}")
            result = listFiles(path, dockerId)
            return result

        def runReadFile(path: str):
            """read a full file's contents using 'cat' from the path."""
            emit_status(workspace_id, "running", step="tool_read_file", detail=f"reading: {path}")
            result = readFile(path, dockerId)
            return result

        def runGrep(grepCmd: str):
            """Given a grep command, runs command in the docker environment"""
            emit_status(workspace_id, "running", step="tool_grep", detail=f"grep: {grepCmd[:50]}")
            result = grep(grepCmd, dockerId)
            return result

        agent = create_agent(
            model="gpt-5-nano",
            tools=[runUpdateFile, runGrep, runListFiles, runReadFile],
            system_prompt="""
            You are the core agent of a coding agent, Codee. Codee is the future of Asynchronous
            coding agents. Users connect a git repo on the website, put in a request, then Codee (you)
            creates a workspace, reads the codebase, understand the request, make changes, create a Pull Request,
            and push it to the git repo.

            <DEVELOPER_NOTES> You are in *EARLY* Beta. We are currently developing your tools.
            You may have none, you may have a few. Act as normal as you can, try to run to best of your capabilities.
            Don't try to run a tool if you don't have it. The prompt/message may be asking you to perform a certain
            action regarding your tools, and if so, just run the tool and return what you think.

            If there is an error running a tool, do NOT continue. Just say that the tool doesn't work. don't try to run it multiple times.
            Sorry... </DEVELOPER_NOTES>
            """
        )

        emit_status(workspace_id, "running", step="agent_start", detail="agent execution started")
        response = agent.invoke({"messages": [{"role": "user", "content": prompt}]})
        final_message = response["messages"][-1].content
        
        msg_response = httpx.post(f"http://127.0.0.1:5001/api/internals/workspaces/message/", json={
            "message": final_message,
            "workspace_id": workspace_id
        })
        message_id = msg_response.json().get("message_id")

        if message_id:
            persist_tool_calls_from_redis(workspace_id, message_id)
        
        emit_status(workspace_id, "complete", step="done", detail="Response ready")
        update_workspace_status(workspace_id, "COMPLETED")
        success = True
        return {"response": str(response["messages"][-1])}
    except Exception as exc:
        emit_error(workspace_id, "pipeline_failure", str(exc))
        update_workspace_status(workspace_id, "FAILED")
        raise
    finally:
        emit_done(workspace_id, "success" if success else "error")
        unmountDockerWorkspace(dockerId)