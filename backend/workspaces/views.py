from integrations.models import IntegrationConnection
from integrations.services.github_app import get_installation_token
from rest_framework.exceptions import APIException
from django.http import JsonResponse, HttpResponse
from rest_framework import viewsets
from .models import Workspace, Message
from rest_framework.decorators import action
from rest_framework import permissions
import httpx
from .serializers import NewMessageSerializer, NewAiMessage
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated




class UserWorkspaceViews(viewsets.ViewSet):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]
    @action(detail=False, methods=["POST"], url_path="new_workspace")
    def newWorkspace(self, request):
        serializer = NewMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        newWorkspaceObject = Workspace.objects.create(github_repository_name=data["repository_full_name"], user=request.user)
        newWorkspaceObject.save()
        userMessageObject = Message.objects.create(workspace=newWorkspaceObject, content=data["message"], sender="USER")
        userMessageObject.save()
        r = httpx.post('http://127.0.0.1:8000/execute', json={
            "prompt":data["message"],
            "repository_full_name":data["repository_full_name"],
            "workspace_id": newWorkspaceObject.pk,
        })
        response = r.json()
        if response["status"] == "queued":
            return JsonResponse({"workspace_id": newWorkspaceObject.pk})
        raise APIException("worker issue")

class OrchestratorViews(viewsets.ViewSet):
    @action(detail=False, methods=["GET"], url_path="workspaces/(?P<workspace_id>[^/.]+)/token", permission_classes=[permissions.AllowAny])
    def getGithubTokenForWorkspace(self, request, workspace_id=None):
        if not workspace_id:
            raise APIException("no workspace_id")
        workspace = Workspace.objects.filter(id=workspace_id).first()
        if not workspace:
            raise APIException("no workspace found matching id")
        user_github = IntegrationConnection.objects.filter(user=workspace.user).first()
        if not user_github:
            raise APIException("user's connection not found")
        token = get_installation_token(user_github.getDataConfig()["installation_id"])
        return JsonResponse({"token": token})

    @action(detail=False, methods=["POST"], url_path="workspaces/message", permission_classes=[permissions.AllowAny])
    def addAiMessage(self, request):
        serializer = NewAiMessage(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        workspace = Workspace.objects.filter(id=data["workspace_id"]).first()
        if not workspace:
            raise APIException("no workspace found matching id")
        newMessage = Message.objects.create(sender="AGENT", workspace=workspace, content=data["message"])
        newMessage.save()
        return HttpResponse("Ok")