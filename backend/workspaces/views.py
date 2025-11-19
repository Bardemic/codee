from datetime import datetime, timezone as dt_timezone
from integrations.models import IntegrationConnection
from integrations.services.github_app import get_installation_token
from rest_framework.exceptions import APIException
from django.http import JsonResponse, HttpResponse
from rest_framework import viewsets
from .models import Workspace, Message, ToolCall
from rest_framework.decorators import action
from rest_framework import permissions
import httpx
from .serializers import MessageSerializer, NewMessageSerializer, NewAiMessage, WorkspaceSerializer
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated




class UserWorkspaceViews(viewsets.ViewSet):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["GET"], url_path="messages/(?P<workspace_id>\d+)")
    def getMessages(self, request, workspace_id):
        workspace = Workspace.objects.filter(pk=workspace_id, user=request.user).first()
        if not workspace:
            raise APIException("no workspace found")
        messages = Message.objects.filter(workspace=workspace).order_by('created_at').prefetch_related('tool_calls')
        return JsonResponse(MessageSerializer(messages, many=True).data, safe=False)
    
    @action(detail=False, methods=["GET"], url_path="(?P<workspace_id>\d+)/status")
    def getWorkspaceStatus(self, request, workspace_id):
        workspace = Workspace.objects.filter(pk=workspace_id, user=request.user).first()
        if not workspace:
            raise APIException("no workspace found")
        return JsonResponse({"status": workspace.status})

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
        newWorkspaceObject.delete()
        raise APIException("worker issue")
    
    def list(self, request):
        workspaces = Workspace.objects.filter(user=request.user).order_by('created_at').reverse()
        return JsonResponse(WorkspaceSerializer(workspaces, many=True).data, safe=False)
    

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
        return JsonResponse({"message_id": newMessage.id})
    
    @action(detail=False, methods=["POST"], url_path="workspaces/(?P<workspace_id>[^/.]+)/status", permission_classes=[permissions.AllowAny])
    def updateWorkspaceStatus(self, request, workspace_id=None):
        workspace = Workspace.objects.filter(id=workspace_id).first()
        if not workspace:
            raise APIException("no workspace found")
        status = request.data.get("status")
        if status not in [choice[0] for choice in Workspace.Status.choices]:
            raise APIException("invalid status")
        workspace.status = status
        workspace.save()
        return HttpResponse("Ok")
    
    @action(detail=False, methods=["POST"], url_path="workspaces/(?P<workspace_id>[^/.]+)/bulk-tool-calls", permission_classes=[permissions.AllowAny])
    def bulkAddToolCalls(self, request, workspace_id=None):
        workspace = Workspace.objects.filter(id=workspace_id).first()
        if not workspace:
            raise APIException("no workspace found")
        
        message_id = request.data.get("message_id")
        if not message_id:
            raise APIException("message_id required")

        message = Message.objects.filter(id=message_id, workspace=workspace, sender='AGENT').first()
        if not message:
            raise APIException("agent message not found")
        
        tool_calls = []
        for tc in request.data.get("tool_calls", []):
            timestamp_ms = tc.get("timestamp_ms")
            tool_name = tc.get("tool_name")
            if timestamp_ms is None or not tool_name:
                continue

            try:
                created_at = datetime.fromtimestamp(float(timestamp_ms) / 1000, tz=dt_timezone.utc)
            except (TypeError, ValueError):
                continue

            tool_calls.append(
                ToolCall(
                    workspace=workspace,
                    message=message,
                    created_at=created_at,
                    tool_name=tool_name,
                    arguments=tc.get('arguments') or {},
                    result=tc.get('detail', ''),
                    status=tc.get('status', 'success'),
                    duration_ms=tc.get('duration_ms')
                )
            )
        
        if tool_calls:
            ToolCall.objects.bulk_create(tool_calls)
        
        return JsonResponse({"created": len(tool_calls)})