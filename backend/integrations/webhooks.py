import hashlib
import hmac
import json
import re
from django.http import JsonResponse
import httpx

from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError, NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from workspaces.models import WorkerDefinition, Workspace, Message, WorkspaceTool

from .models import IntegrationProvider, IntegrationConnection
from .services.github_app import get_installation_token
from workspaces.utils.llm import generateTitle


def createWorkspaceFromWebhook(workerDefinition: WorkerDefinition, repository_name: str, data: dict, title: str):
        prompt = workerDefinition.prompt + "\n\n\n" + f"Here is data from the service: {str(data)}"

        newWorkspaceObject = Workspace.objects.create(github_repository_name=repository_name, user=workerDefinition.user, name=title, worker=workerDefinition)
        Message.objects.create(workspace=newWorkspaceObject, content=prompt, sender="USER")

        tools = workerDefinition.tools.all()
        WorkspaceTool.objects.bulk_create(
            [WorkspaceTool(workspace=newWorkspaceObject, tool=tool) for tool in tools],
            ignore_conflicts=True,
        )

        tool_slugs = list(tools.values_list("slug_name", flat=True))

        r = httpx.post('http://127.0.0.1:8000/newWorkspace', json={
            "prompt": prompt,
            "repository_full_name":repository_name,
            "workspace_id": newWorkspaceObject.pk,
            "tool_slugs": tool_slugs,
        })
        response = r.json()
        if response["status"] == "queued":
            return JsonResponse({"workspace_id": newWorkspaceObject.pk})
        raise APIException("worker issue")


@method_decorator(csrf_exempt, name="dispatch")
class BaseWebhookViewSet(viewsets.ViewSet):
    authentication_classes = ()
    permission_classes = (AllowAny,)
    provider_slug = None

    def get_provider(self):
        if not self.provider_slug:
            raise NotFound()
        provider = IntegrationProvider.objects.filter(slug=self.provider_slug).first()
        if not provider:
            raise NotFound()
        return provider

    def parse_body(self, request):
        if not request.body:
            return {}
        try:
            return json.loads(request.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValidationError("invalid payload") from exc

    def build_response(self):
        return Response(status=status.HTTP_204_NO_CONTENT)



class PostHogWebhookViewSet(BaseWebhookViewSet):
    provider_slug = "posthog"

    @action(detail=False, methods=["post"], url_path="issue")
    def issue(self, request):
        data = self.parse_body(request)
        event = data.get("event")
        if not event: raise APIException("event not found")
        worker_slug, key = data.get("worker_slug"), data.get("key")
        if not worker_slug or not key: raise APIException("worker or key not found")
        
        worker = None
        for w in WorkerDefinition.objects.filter(slug=worker_slug):
            if w.getKey() == key: # I promise i will stop doing this eventually
                worker = w
                break
        if not worker: raise PermissionDenied("Invalid worker key")
        repository = data.get("repository")
        if not repository: raise APIException("repository not found")
        event.pop("worker_slug", None)
        event.pop("key", None)
        event.pop("repository", None)

        createWorkspaceFromWebhook(
            repository_name=repository,
            workerDefinition=worker,
            title=generateTitle(f"you are an async coding agent. generate a title for this user's ai code workspace, where they are importing an error from posthog that is of the following info: {str(event)}"),
            data=event
        )

        return Response("ok")



class GitHubWebhookViewSet(BaseWebhookViewSet):
    provider_slug = "github_app"

    @action(detail=False, methods=["post"], url_path="events")
    def events(self, request):
        self.get_provider()
        secret = settings.GITHUB_WEBHOOK_SECRET
        if not secret:
            raise PermissionDenied("secret missing")
        signature = request.META.get("HTTP_X_HUB_SIGNATURE_256")
        if not signature:
            raise PermissionDenied("signature missing")
        expected = self.compute_signature(secret.encode("utf-8"), request.body)
        if not hmac.compare_digest(signature, expected):
            raise PermissionDenied("signature mismatch")
        event = request.META.get("HTTP_X_GITHUB_EVENT")
        if not event:
            raise ValidationError("event missing")
        body = self.parse_body(request)
        self.handle_event(event, body)
        return self.build_response()

    def compute_signature(self, secret, payload):
        digest = hmac.new(secret, payload, hashlib.sha256).hexdigest()
        return f"sha256={digest}"

    def handle_event(self, event, body):
        action = body.get("action")
        if not action: return

        installation_id = self.get_installation_id(body)
        connection = self.get_connection(installation_id)
        if not connection: return
        user = connection.user

        if (event == "installation" and action == "deleted"):
            connection.delete()
        if event == "issue_comment":
            if action == "created":
                comment_body = body.get("comment")
                if not isinstance(comment_body, dict): raise APIException("comment body not found")
                comment = comment_body.get("body")
                if not comment: raise APIException("comment not found in body")
                if "--codee" not in comment: return
                match = re.search(r'--codee/(\S+)', comment)
                if not match: raise APIException("slug not found when codee called")
                slug = match.group(1)

                issue = body.get("issue")
                if not issue: raise APIException("issue not found")
                title, description = issue.get("title"), issue.get("body")
                if not title or not description: raise APIException("content not found")


                worker = WorkerDefinition.objects.filter(user=user, slug=slug).first()
                if not worker: raise APIException("workerDefinition not found")
                # run the workspace setup code
                workspaceTitle = generateTitle(f"from github issue: \n\n GitHub issue title: {title}\n\n Description: {title}\n\n Comment: {comment}")
                createWorkspaceFromWebhook(
                    workerDefinition=worker,
                    repository_name=self.get_repository(body),
                    data={
                        "comment": comment,
                        "title": title,
                        "description": description
                    },
                    title=workspaceTitle
                )

                print("create workspace")

    def get_installation_id(self, body):
        installation = body.get("installation")
        if not isinstance(installation, dict): return None

        installation_id = installation.get("id")
        return installation_id

    def get_connection(self, installation_id):
        connections = IntegrationConnection.objects.filter(
            provider__slug=self.provider_slug
        ).select_related("user")
        # 3am thoughts: I threw up while writing this
        # it's so awful
        # it will be fixed eventually
        for connection in connections:
            config = connection.getDataConfig()
            stored_id = config.get("installation_id")
            if stored_id and str(stored_id) == str(installation_id):
                return connection
        return None
    def get_repository(self, body):
        repository_body = body.get("repository")
        if not repository_body: raise APIException("repository body not found")
        repository = repository_body.get("full_name")
        if not repository: raise APIException("repository full name not found")
        return repository
