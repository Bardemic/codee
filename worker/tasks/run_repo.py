import asyncio
from dataclasses import dataclass
from celery_app import celery_app
import httpx
import subprocess, os, uuid, logging, json
from dulwich import porcelain
from dotenv import load_dotenv
from langchain.agents import create_agent
from tools import grep, list_files, read_file, update_file, load_tools
from utils import emit_status, emit_error, emit_done, get_stream_client, get_workspace_path
from posthog import Posthog
from posthog.ai.langchain import CallbackHandler

load_dotenv()

logger = logging.getLogger(__name__)


@dataclass
class ToolContext:
    agent_id: int
    docker_name: str

def update_agent_status(agent_id: int, status: str):
    try:
        httpx.post(f"http://127.0.0.1:5001/api/internals/agents/{agent_id}/status/", json={
            "status": status
        }, timeout=10.0)
    except Exception as exc:
        logger.warning("failed to update agent status: %s", exc)


def persist_tool_calls_from_redis(agent_id: int, message_id: int):
    try:
        stream_key = f"stream:agent:{agent_id}"
        events = get_stream_client().xrange(stream_key, min='-', max='+')
        
        tool_calls_data = []
        for event_id, fields in events:
            if fields.get("event") != "status" or not fields.get("step", "").startswith("tool_"):
                continue
            
            event_id_str = event_id if isinstance(event_id, str) else event_id.decode()
            try:
                timestamp_ms = int(event_id_str.split('-')[0])
                arguments_raw = fields.get('arguments', '{}')
                try:
                    arguments = json.loads(arguments_raw) if arguments_raw else {}
                except json.JSONDecodeError:
                    arguments = {"raw": arguments_raw}
                
                tool_calls_data.append({
                    'timestamp_ms': timestamp_ms,
                    'tool_name': fields.get("step"),
                    'arguments': arguments,
                    'detail': fields.get('detail', ''),
                    'status': fields.get('phase', 'success'),
                })
            except (TypeError, ValueError):
                continue
        
        if tool_calls_data:
            httpx.post(
                f"http://127.0.0.1:5001/api/internals/agents/{agent_id}/bulk-tool-calls/",
                json={'message_id': message_id, 'tool_calls': tool_calls_data},
                timeout=30.0
            )
    except Exception as exc:
        logger.warning("persist issue: %s", exc)


def reset_agent_stream(agent_id: int):
    try:
        get_stream_client().delete(f"stream:agent:{agent_id}")
    except Exception as exc:
        logger.warning("reset stream error: %s", exc)

def getToken(agent_id: int):
    r = httpx.get(f"http://127.0.0.1:5001/api/internals/agents/{agent_id}/token/")
    #need to implement error handling for when !token
    return r.json()["token"]

def _generate_branch_name(agent_id: int) -> str:
    return f"codee/agent-{agent_id}-{uuid.uuid4().hex[:8]}"


def createAgentWorkspace(full_name: str, agent_id: int):
    repo_url = f"https://x-access-token:{getToken(agent_id)}@github.com/{full_name}.git"
    clone_directory = get_workspace_path(agent_id)
    os.makedirs(clone_directory, exist_ok=True)
    porcelain.clone(repo_url, clone_directory)
    repo = porcelain.open_repo(clone_directory)
    branch_name = None
    if repo:
        branch_name = _generate_branch_name(agent_id)
        porcelain.branch_create(repo, branch_name)
        porcelain.checkout_branch(repo, branch_name)
    return agent_id, branch_name

def getAgentWorkspacePath(agent_id: int):
    path = get_workspace_path(agent_id)
    if not os.path.isdir(path): 
        return None
    return path

def mountAgentToDocker(agent_id: int, docker_name: str):
    path = getAgentWorkspacePath(agent_id)
    if not path: 
        return -1
    cmd = [
        "docker", "run", "-d",
        "--name", docker_name,
        "-v", f"{path}:/app", "nginx:latest"
    ]
    try:
        subprocess.run(cmd, check=True)
        return 1
    except subprocess.CalledProcessError:
        return -1

def unmountDocker(docker_name: str):
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

A part of Codee is the ability to add tools to your agent toolkit.
Users can integrate with different services, and when they integrate, they're able to give you certain access to tools.
These tools will connect with different services and give you more capabilities.
Sometimes the best solution will be through these tools, sometimes the best solution will not be through these tools.
You have to figure that out for yourself.
For Git/Github-related queries: the user outside of the tools has access to create a commit and create a branch and create a merge request.
If a user requests you to do these, do not intend to do it for them. This is their job to figure that out.

You are also given access to some tools, which you will always have. These are crucial. They are how you interact with the codebase.
You may technically be able to perform the same action in multiple ways via different tools.
For example, you may be able to figure out some loopholes to modify a file in more than one way.
This is bad. The point is that those tools are the best way to perform that certain action.
If you want to perform a certain action that has a tool associated with it, use that tool.
"""

TOOLS_PROMPT = """
The user has selected different functions for their integrations. Each set of user-selected function
includes one or multiple tools. The prompt for each function is styled similarly to XML, such as the following:

<provider/function_name>prompt</provider/function_name>.

Use these prompts to understand the point of certain included prompts, and how they relate to the user's request.
"""

def _run_agent_session(agent_id: int, docker_id: str, prompt: str, tool_slugs: list[str], previousMessages: list | None = None):
    dynamic_tools, prompts = asyncio.run(load_tools(tool_slugs, agent_id=agent_id))
    posthog = Posthog(
        (os.environ.get("POSTHOG_API_KEY", "")),
        host=os.environ.get("POSTHOG_HOST", "https://us.i.posthog.com"),
    )

    callback_handler = CallbackHandler(
        client=posthog,
        properties={"agent_id": agent_id},
    )
    
    agent = create_agent(
        model="gpt-5-mini",
        tools=[update_file, grep, list_files, read_file, *dynamic_tools],
        system_prompt=AGENT_SYSTEM_PROMPT,
        context_schema=ToolContext
    )
    emit_status(agent_id, "running", step="agent_start", detail="agent execution started")

    messages = [{"role": "user", "content": prompt}]

    if prompts:
        messages = [
            {"role": "developer", "content": TOOLS_PROMPT},
            {"role": "developer", "content": "\n\n\n".join(prompts)}
        ] + messages
    if previousMessages:
        previous_messages_str = json.dumps(previousMessages, default=str)
        messages.insert(0, {"role": "user", "content": previous_messages_str})

    response = agent.invoke(
        {"messages": messages},
        context=ToolContext(
            agent_id=agent_id,
            docker_name=docker_id,
        ),
        config={"callbacks": [callback_handler], "configurable": {"agent_id": agent_id}},
    )
    final_message = response["messages"][-1].content

    msg_response = httpx.post(
        f"http://127.0.0.1:5001/api/internals/agents/message/",
        json={"message": final_message, "agent_id": agent_id}
    )
    message_id = msg_response.json().get("message_id")

    if message_id:
        persist_tool_calls_from_redis(agent_id, message_id)

    emit_status(agent_id, "complete", step="done", detail="Response ready")
    update_agent_status(agent_id, "COMPLETED")
    return {"response": str(response["messages"][-1])}


def _run_agent_job(agent_id: int, prompt: str, tool_slugs: list[str], github_repo_name: str | None = None, previous_messages: list | None = None):
    docker_id = str(uuid.uuid4())
    reset_agent_stream(agent_id)
    init_detail = "preparing agent workspace" if github_repo_name else "processing agent message"
    emit_status(agent_id, "starting", step="init", detail=init_detail)
    update_agent_status(agent_id, "RUNNING")
    success = False
    try:
        if github_repo_name:
            created_agent_id, branch_name = createAgentWorkspace(github_repo_name, agent_id)
            if not created_agent_id:
                emit_error(agent_id, "workspace_not_found", "repository not found", step="create_workspace")
                update_agent_status(agent_id, "FAILED")
                return {"error": "repository not found"}
            if not branch_name:
                emit_error(agent_id, "branch_creation_failed", "failed to create agent branch", step="create_workspace")
                update_agent_status(agent_id, "FAILED")
                return {"error": "branch creation failed"}
        else:
            if not getAgentWorkspacePath(agent_id):
                emit_error(
                    agent_id,
                    "workspace_not_initialized",
                    "agent workspace not initialized. create a workspace first",
                    step="load_workspace"
                )
                update_agent_status(agent_id, "FAILED")
                return {"error": "workspace not initialized"}

        if mountAgentToDocker(agent_id, docker_id) < 0:
            emit_error(agent_id, "docker_mount_failed", "docker mount failed", step="mount_workspace")
            update_agent_status(agent_id, "FAILED")
            return {"error": "docker mount failed"}

        result = _run_agent_session(
            agent_id,
            docker_id,
            prompt,
            tool_slugs,
            previous_messages,
        )
        success = True
        return result
    except Exception as exc:
        emit_error(agent_id, "pipeline_failure", str(exc))
        update_agent_status(agent_id, "FAILED")
        raise
    finally:
        emit_done(agent_id, "success" if success else "error")
        unmountDocker(docker_id)


@celery_app.task(name="tasks.pipeline", bind=True)
def pipeline(self, github_repo_name: str, prompt: str, agent_id: int, tool_slugs: list[str]):
    return _run_agent_job(
        agent_id=agent_id,
        prompt=prompt,
        github_repo_name=github_repo_name,
        tool_slugs=tool_slugs,
    )


@celery_app.task(name="tasks.process_agent_message", bind=True)
def process_agent_message(self, prompt: str, agent_id: int, previous_messages, tool_slugs: list[str]):
    return _run_agent_job(
        agent_id=agent_id,
        prompt=prompt,
        previous_messages=previous_messages,
        tool_slugs=tool_slugs,
    )
