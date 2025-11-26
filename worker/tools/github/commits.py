import time
from io import StringIO
from dulwich import porcelain
from dulwich.repo import Repo
from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig
from utils import get_workspace_path, emit_status

@tool
def list_commits(n: int, config: RunnableConfig) -> str:
    """List the recent n commits."""
    workspace_id = config.get("configurable", {}).get("workspace_id")
    if not workspace_id:
        return "Error: workspace_id missing"
    
    emit_status(workspace_id, "running", step="tool_list_commits", detail=f"listing last {n} commits")

    path = get_workspace_path(workspace_id)
    try:
        repo = Repo(path)
        commits = []
        
        count = 0
        for entry in repo.get_walker(max_entries=n):
            commit = entry.commit
            sha = commit.id.decode()
            author = commit.author.decode()
            commit_time = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(commit.commit_time))
            message = commit.message.decode().strip().split('\n')[0]
            
            commits.append(f"{sha} - {author}, {commit_time} : {message}")
            count += 1
            
        return "\n".join(commits)
    except Exception as e:
        return f"Error listing commits: {str(e)}"

@tool
def view_commit_details(commit_sha: str, config: RunnableConfig) -> str:
    """View details (diff) of a specific commit."""
    workspace_id = config.get("configurable", {}).get("workspace_id")
    if not workspace_id:
        return "Error: workspace_id missing"
        
    emit_status(workspace_id, "running", step="tool_view_commit", detail=f"viewing commit {commit_sha}")

    path = get_workspace_path(workspace_id)
    try:
        repo = Repo(path)
        out = StringIO()
        porcelain.show(repo, objects=[commit_sha.encode()], outstream=out)
        return out.getvalue()
    except Exception as e:
        return f"Error viewing commit: {str(e)}"

def get_tools():
    return [list_commits, view_commit_details]

prompt = """
<github/commits>
Tools to interact with the git repository of the workspace.
Do NOT do ANYTHING regarding Git if not using these tools.
They will NOT work. You are NOT given access to Git via the terminal, you MUST
USE these tools.
tools:
[
    "list_commits",
    "view_commit_details"
]
</github/commits>
"""

