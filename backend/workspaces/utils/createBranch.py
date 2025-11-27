from pathlib import Path

from dulwich import porcelain
from dulwich.repo import Repo
from rest_framework.exceptions import APIException
from integrations.models import IntegrationConnection
from integrations.services.github_app import get_installation_token
from workspaces.models import Workspace


WORKSPACES_ROOT = Path("/Users/brandonpieczka/repos/codee/.data/workspaces")


def _get_workspace_repo_path(workspace_id: int) -> Path:
    repo_path = WORKSPACES_ROOT / str(workspace_id)
    if not repo_path.is_dir():
        raise APIException("workspace directory not found")
    return repo_path


def _get_installation_token_for_workspace(workspace: Workspace) -> str:
    connection = IntegrationConnection.objects.filter(user=workspace.user, provider__slug="github_app").first()
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


def createBranch(workspace: Workspace, commit_message: str | None = None) -> str:
    repo_path = _get_workspace_repo_path(workspace.id)
    repo = Repo(str(repo_path))

    head_ref = repo.refs.get_symrefs().get(b'HEAD')
    if not head_ref or not head_ref.decode().startswith("refs/heads/"):
        raise APIException("unable to determine current branch")
    branch_name = head_ref.decode().removeprefix("refs/heads/")

    porcelain.add(str(repo_path))
    message = commit_message or f"Codee changes for workspace {workspace.id}"
    repo.get_worktree().commit(message.encode())

    token = _get_installation_token_for_workspace(workspace)
    repo_url = f"https://x-access-token:{token}@github.com/{workspace.github_repository_name}.git"
    
    config = repo.get_config()
    config.set((b'remote', b'origin'), b'url', repo_url.encode())
    config.set((b'branch', branch_name.encode()), b'remote', b'origin')
    config.set((b'branch', branch_name.encode()), b'merge', head_ref)
    config.write_to_path()

    porcelain.push(repo, 'origin', refspecs=[f"{head_ref.decode()}:{head_ref.decode()}"])

    workspace.github_branch_name = branch_name
    workspace.save(update_fields=['github_branch_name'])
    return branch_name

