from dataclasses import dataclass
from celery_app import celery_app
import httpx
import subprocess, os, uuid, logging, json
from dulwich import porcelain
from dotenv import load_dotenv
from langchain.agents import create_agent
from tools import grep, list_files, read_file, update_file
from utils import emit_status, emit_error, emit_done, get_stream_client, get_workspace_path

load_dotenv()

logger = logging.getLogger(__name__)


@dataclass
class ToolContext:
    workspace_id: int
    docker_name: str


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
    clone_directory = get_workspace_path(workspace_id)
    porcelain.clone(repo_url, clone_directory)
    repo = porcelain.open_repo(clone_directory)
    branch_name = None
    if repo:
        branch_name = _generate_branch_name(workspace_id)
        porcelain.branch_create(repo, branch_name)
        porcelain.checkout_branch(repo, branch_name)
    return workspace_id, branch_name

def getWorkspacePath(workspace_id: int):
    path = get_workspace_path(workspace_id)
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

AGENT_SYSTEM_PROMPT = """
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


def _run_agent_session(workspace_id: int, docker_id: str, prompt: str, previousMessages: list | None = None):
    agent = create_agent(
        model="gpt-5-nano",
        tools=[update_file, grep, list_files, read_file],
        system_prompt=AGENT_SYSTEM_PROMPT,
        context_schema=ToolContext
    )

    emit_status(workspace_id, "running", step="agent_start", detail="agent execution started")

    messages = [{"role": "user", "content": prompt}]
    if previousMessages:
        previous_messages_str = json.dumps(previousMessages, default=str)
        messages.insert(0, {"role": "user", "content": previous_messages_str})

    response = agent.invoke(
        {"messages": messages},
        context=ToolContext(
            workspace_id=workspace_id,
            docker_name=docker_id,
        ),
    )
    final_message = response["messages"][-1].content

    msg_response = httpx.post(
        f"http://127.0.0.1:5001/api/internals/workspaces/message/",
        json={"message": final_message, "workspace_id": workspace_id}
    )
    message_id = msg_response.json().get("message_id")

    if message_id:
        persist_tool_calls_from_redis(workspace_id, message_id)

    emit_status(workspace_id, "complete", step="done", detail="Response ready")
    update_workspace_status(workspace_id, "COMPLETED")
    return {"response": str(response["messages"][-1])}


def _run_workspace_job(workspace_id: int, prompt: str, github_repo_name: str | None = None, previous_messages: list | None = None):
    docker_id = str(uuid.uuid4())
    reset_workspace_stream(workspace_id)
    init_detail = "preparing workspace" if github_repo_name else "processing workspace message"
    emit_status(workspace_id, "starting", step="init", detail=init_detail)
    update_workspace_status(workspace_id, "RUNNING")
    success = False
    try:
        if github_repo_name:
            workspaceId, branch_name = createWorkspace(github_repo_name, workspace_id)
            if not workspaceId:
                emit_error(workspace_id, "workspace_not_found", "repository not found", step="create_workspace")
                update_workspace_status(workspace_id, "FAILED")
                return {"error": "repository not found"}
            if not branch_name:
                emit_error(workspace_id, "branch_creation_failed", "failed to create workspace branch", step="create_workspace")
                update_workspace_status(workspace_id, "FAILED")
                return {"error": "branch creation failed"}
        else:
            if not getWorkspacePath(workspace_id):
                emit_error(
                    workspace_id,
                    "workspace_not_initialized",
                    "workspace not initialized. create a workspace first",
                    step="load_workspace"
                )
                update_workspace_status(workspace_id, "FAILED")
                return {"error": "workspace not initialized"}

        if mountWorkspaceToDocker(workspace_id, docker_id) < 0:
            emit_error(workspace_id, "docker_mount_failed", "docker mount failed", step="mount_workspace")
            update_workspace_status(workspace_id, "FAILED")
            return {"error": "docker mount failed"}

        result = _run_agent_session(workspace_id, docker_id, prompt, previous_messages)
        success = True
        return result
    except Exception as exc:
        emit_error(workspace_id, "pipeline_failure", str(exc))
        update_workspace_status(workspace_id, "FAILED")
        raise
    finally:
        emit_done(workspace_id, "success" if success else "error")
        unmountDockerWorkspace(docker_id)


@celery_app.task(name="tasks.pipeline", bind=True)
def pipeline(self, github_repo_name: str, prompt: str, workspace_id: int):
    return _run_workspace_job(workspace_id=workspace_id, prompt=prompt, github_repo_name=github_repo_name)


@celery_app.task(name="tasks.process_workspace_message", bind=True)
def process_workspace_message(self, prompt: str, workspace_id: int, previous_messages):
    return _run_workspace_job(workspace_id=workspace_id, prompt=prompt, previous_messages=previous_messages)
