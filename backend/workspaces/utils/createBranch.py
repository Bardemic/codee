from pathlib import Path
import os

from dulwich import porcelain
from dulwich.repo import Repo
from rest_framework.exceptions import APIException
from integrations.models import IntegrationConnection
from integrations.services.github_app import get_installation_token
from workspaces.models import Agent


current_file = Path(__file__).resolve()
default_root = current_file.parents[3] if len(current_file.parents) > 3 else current_file.parent
WORKSPACES_ROOT = Path(os.getenv("WORKSPACES_ROOT", str(default_root / ".data/agents")))


def _get_agent_repo_path(agent_id: int) -> Path:
    repo_path = WORKSPACES_ROOT / str(agent_id)
    if not repo_path.is_dir():
        raise APIException("agent directory not found")
    return repo_path


def _get_installation_token_for_agent(agent: Agent) -> str:
    connection = IntegrationConnection.objects.filter(user=agent.workspace.user, provider__slug="github_app").first()
    if not connection:
        raise APIException("no GitHub connection found for user")
    config = connection.getDataConfig()
    installation_id = config.get("installation_id")
    if not installation_id:
        raise APIException("installation_id missing for GitHub connection")
    token = get_installation_token(installation_id)
    if not token:
        raise APIException("unable to fetch GitHub installation token")
    return token


def createBranch(agent: Agent, commit_message: str | None = None) -> str:
    repo_path = _get_agent_repo_path(agent.id)
    repo = Repo(str(repo_path))

    head_ref = repo.refs.get_symrefs().get(b'HEAD')
    if not head_ref or not head_ref.decode().startswith("refs/heads/"):
        raise APIException("unable to determine current branch")
    branch_name = head_ref.decode().removeprefix("refs/heads/")

    porcelain.add(str(repo_path))
    message = commit_message or f"Codee changes for agent {agent.id}"
    repo.get_worktree().commit(message.encode())

    token = _get_installation_token_for_agent(agent)
    repo_url = f"https://x-access-token:{token}@github.com/{agent.workspace.github_repository_name}.git"
    
    config = repo.get_config()
    config.set((b'remote', b'origin'), b'url', repo_url.encode())
    config.set((b'branch', branch_name.encode()), b'remote', b'origin')
    config.set((b'branch', branch_name.encode()), b'merge', head_ref)
    config.write_to_path()

    porcelain.push(repo, 'origin', refspecs=[f"{head_ref.decode()}:{head_ref.decode()}"])

    agent.github_branch_name = branch_name
    agent.save(update_fields=['github_branch_name'])
    return branch_name

