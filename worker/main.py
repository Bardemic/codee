import shutil
import uuid
import subprocess
from fastapi import FastAPI
from pydantic import BaseModel
import subprocess, os
from dulwich import porcelain
from langchain.agents import create_agent
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

@app.get('/')
async def root():
    return {
        "message": "codee"
    }


class runRequest(BaseModel):
    language: str
    command: str
    repo_id: uuid.UUID

def createWorkspace(repo_id: uuid.UUID):
    path = f"../.data/repos/{repo_id}"
    if not os.path.isdir(path):
        return None
    workspaceId = str(uuid.uuid4())
    shutil.copytree(path, f"../.data/workspaces/{workspaceId}")
    return workspaceId

def getWorkspacePath(workspace_id: uuid.UUID):
    path = f"../.data/workspaces/{workspace_id}"
    if not os.path.isdir(path): return None
    return path


@app.post('/run')
async def run(req: runRequest):

    workspaceId = createWorkspace(req.repo_id)
    if not workspaceId: return {"error": "repository not found"}

    image = "python:3.11-slim"
    cmd = [
        "docker", "run", "--rm",
        "--cpus=1", "--memory=512m", "--network=none",
        "-v", f"../.data/workspaces/{workspaceId}",
        "-w", "/workspace",
        image, "bash", "-c", req.command
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout = 30)
        return {"output": out, "workspaceId": workspaceId}
    except subprocess.CalledProcessError as e:
        return{"error": e.output.decode()}

class repoRequest(BaseModel):
    giturl: str

@app.post('/clone-repo')
async def run(req: repoRequest):
    repo_id = str(uuid.uuid4())
    porcelain.clone(req.giturl, f'../.data/repos/{repo_id}')

class newRequest(BaseModel):
    repo_id: uuid.UUID
    prompt: str

@app.post('/new-request')
async def pipeline(req: newRequest):
    workspaceId = createWorkspace(req.repo_id)
    if not workspaceId: return

    if mountWorkspaceToDocker(workspaceId) < 0: return "error"

    def runGrep(grepCmd: str):
        """Given a grep command, runs command in the docker environment (If error running grep once, STOP RUNNING. Say you fail.)"""
        return grep(grepCmd, workspaceId)

    agent = create_agent(
        model="gpt-5-nano",
        tools=[runGrep],
        system_prompt=
        """
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

    response = agent.invoke({"messages": [{"role": "user", "content": req.prompt}]})
    return {"response": response}

    # unmountDockerWorkspace(workspaceId)

def mountWorkspaceToDocker(workspace_id: uuid.UUID):
    path = getWorkspacePath(workspace_id)
    if not path: return -1
    cmd = [
        "docker", "run", "-d",
        "--name", workspace_id,
        "-v", f"{path}:/app", "nginx:latest"
    ]
    try:
        subprocess.run(cmd)
        return 1
    except subprocess.CalledProcessError as e:
        return -1

def unmountDockerWorkspace(workspace_id: uuid.UUID):
    cmd1 = [
        "docker", "stop", workspace_id
    ]
    cmd2 = [
        "docker", "rm", workspace_id
    ]
    try:
        subprocess.run(cmd1)
        subprocess.run(cmd2)
    except:
        print("error")


#this is dangerous (obviously), fix when done experimenting
def grep(command: str, workspace_id):
    """Given a grep command, runs command in the docker environment"""
    cmd = [
       "docker", "exec", "-it", workspace_id, "sh", "-c", f"cd app && {command}"
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout = 30)
        return out
    except subprocess.CalledProcessError as e:
        return "error running grep: " + e.output.decode()
