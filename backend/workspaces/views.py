from datetime import datetime, timezone as dt_timezone

from django.db import transaction
from workspaces.utils.llm import generateTitle
from workspaces.utils.createBranch import createBranch
from integrations.models import IntegrationConnection, IntegrationProvider, Tool
from integrations.services.github_app import get_installation_token
from rest_framework.exceptions import APIException
from django.http import JsonResponse, HttpResponse
from rest_framework import viewsets
from django.db.models import prefetch_related_objects
from .models import Agent, WorkerDefinition, Workspace, Message, ToolCall, WorkspaceTool, WorkerDefinitionTool
from .cloud_providers import get_provider_class
from rest_framework.decorators import action
from rest_framework import permissions
import httpx
from .serializers import MessageSerializer, NewMessageSerializer, NewAiMessage, NewWorkspaceSerialier, WorkerSerializer, WorkspaceSerializer, NewWorkerSerializer
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404


class WorkerViews(viewsets.ViewSet):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def list(self, request):
        workerDefs = WorkerDefinition.objects.filter(user=request.user).prefetch_related('tools', 'workspace_set')
        return JsonResponse(WorkerSerializer(workerDefs, many=True).data, safe=False)

    @transaction.atomic
    def create(self, request):
        serializer = NewWorkerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if WorkerDefinition.objects.filter(slug=data["slug"], user=request.user).exists():
            raise APIException("You cannot have 2 workers of the same slug")

        tools = Tool.objects.filter(slug_name__in=data["tool_slugs"])
        
        worker = WorkerDefinition.objects.create(prompt=data["prompt"], user=request.user, slug=data["slug"], key="testing")
        
        WorkerDefinitionTool.objects.bulk_create(
            [WorkerDefinitionTool(worker_definition=worker, tool=tool) for tool in tools]
        )
        if data.get("key"):
            worker.setKey(data["key"])
            worker.save()
        
        return JsonResponse(WorkerSerializer(worker).data)

    @transaction.atomic
    def update(self, request, pk=None):
        worker = get_object_or_404(WorkerDefinition, pk=pk, user=request.user)
        serializer = NewWorkerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if WorkerDefinition.objects.filter(slug=data["slug"], user=request.user).exclude(pk=worker.pk).exists():
            raise APIException("You cannot have 2 workers of the same slug")

        worker.prompt = data["prompt"]
        worker.slug = data["slug"]
        if data.get("key"):
            worker.setKey(data["key"])
        worker.save()

        # Update tools
        tools = Tool.objects.filter(slug_name__in=data["tool_slugs"])
        WorkerDefinitionTool.objects.filter(worker_definition=worker).delete()
        WorkerDefinitionTool.objects.bulk_create(
            [WorkerDefinitionTool(worker_definition=worker, tool=tool) for tool in tools]
        )
        
        return JsonResponse(WorkerSerializer(worker).data)

    def destroy(self, request, pk=None):
        worker = get_object_or_404(WorkerDefinition, pk=pk, user=request.user)
        worker.delete()
        return HttpResponse(status=204)

class UserWorkspaceViews(viewsets.ViewSet):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["GET"], url_path="messages/(?P<agent_id>\d+)")
    def getMessages(self, request, agent_id):
        agent = Agent.objects.filter(pk=agent_id, workspace__user=request.user).first()
        if not agent:
            raise APIException("no agent found")
        messages = Message.objects.filter(agent=agent).order_by('created_at').prefetch_related('tool_calls')
        return JsonResponse(MessageSerializer(messages, many=True).data, safe=False)
    
    @action(detail=False, methods=["GET"], url_path="(?P<agent_id>\d+)/status")
    def getAgentStatus(self, request, agent_id):
        agent = Agent.objects.filter(pk=agent_id, workspace__user=request.user).first()
        if not agent:
            raise APIException("no agent found")
        return JsonResponse({"status": agent.status})

    @action(detail=False, methods=["POST"], url_path="(?P<agent_id>\d+)/create-branch")
    def createAgentBranch(self, request, agent_id):
        agent = Agent.objects.filter(pk=agent_id, workspace__user=request.user).select_related('workspace').first()
        if not agent:
            raise APIException("no agent found")
        branch_name = createBranch(agent.workspace)
        agent.github_branch_name = branch_name
        agent.save()
        return JsonResponse({"branch_name": branch_name})

    @action(detail=False, methods=["POST"], url_path="(?P<agent_id>\d+)/message")
    def newMessage(self, request, agent_id):
        serializer = NewMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        agent = Agent.objects.filter(pk=agent_id, workspace__user=request.user).select_related('workspace').first()
        if not agent:
            raise APIException("agent not found")

        prevMessages = Message.objects.filter(agent=agent).order_by('created_at').prefetch_related('tool_calls')
        serializedMessages = MessageSerializer(prevMessages, many=True).data

        userMessageObject = Message.objects.create(agent=agent, content=data["message"], sender="USER")

        tool_slugs = list(agent.workspace.tools.values_list("slug_name", flat=True))

        r = httpx.post('http://127.0.0.1:8000/newMessage', json={
            "prompt": data["message"],
            "agent_id": agent.id,
            "previous_messages": serializedMessages,
            "tool_slugs": tool_slugs,
        })
        response = r.json()
        if response["status"] == "queued":
            agent.status = "RUNNING"
            agent.save()
            return HttpResponse(status=204)
        userMessageObject.delete()
        raise APIException("worker issue")

        
    @action(detail=False, methods=["POST"], url_path="new_workspace")
    def newWorkspace(self, request):
        serializer = NewWorkspaceSerialier(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        title = generateTitle(data["message"])

        newWorkspaceObject = Workspace.objects.create(github_repository_name=data["repository_full_name"], user=request.user, name=title)
        newWorkspaceObject.save()

        tools = Tool.objects.filter(slug_name__in=data["tool_slugs"])
        if len(set(tools.values_list("slug_name", flat=True))) < len(set(data["tool_slugs"])):
            raise APIException("bad slugs") #adding for now for simple checking, will implement if user has access to tools later
        WorkspaceTool.objects.bulk_create(
            [WorkspaceTool(workspace=newWorkspaceObject, tool=tool) for tool in tools],
            ignore_conflicts=True,
        )

        tool_slugs = list(tools.values_list("slug_name", flat=True))

        
        print(data["cloud_providers"])
        first = None
        for provider_config in data["cloud_providers"]:
            provider_name = provider_config["name"]
            ProviderClass = get_provider_class(provider_name)
            
            if ProviderClass:
                provider = ProviderClass()
                for agent_config in provider_config["agents"]:
                    agent = provider.create_agent(
                        user=request.user,
                        workspace=newWorkspaceObject,
                        repository_full_name=data["repository_full_name"],
                        message=data["message"],
                        tool_slugs=tool_slugs,
                        model=agent_config.get("model")
                    )
                    if not first and agent: first = agent
        if not first: raise APIException("worker issue")
        return JsonResponse({"agent_id": first.pk})
    
    def list(self, request):
        workspaces = Workspace.objects.filter(user=request.user).prefetch_related('provider_agents').order_by('-created_at')
        return JsonResponse(WorkspaceSerializer(workspaces, many=True).data, safe=False)

    def retrieve(self, request, pk=None):
        workspace = get_object_or_404(Workspace, pk=pk)
        prefetch_related_objects([workspace], 'provider_agents')

        serializer = WorkspaceSerializer(workspace)
        return JsonResponse(serializer.data)

    

class OrchestratorViews(viewsets.ViewSet):
    @action(detail=False, methods=["GET"], url_path="agents/(?P<agent_id>[^/.]+)/token", permission_classes=[permissions.AllowAny])
    def getGithubTokenForAgent(self, request, agent_id=None):
        if not agent_id:
            raise APIException("no agent_id")
        agent = Agent.objects.filter(id=agent_id).select_related('workspace__user').first()
        if not agent:
            raise APIException("no agent found matching id")
        user_github = IntegrationConnection.objects.filter(user=agent.workspace.user, provider__slug="github_app").first()
        if not user_github:
            raise APIException("user's connection not found")
        token = get_installation_token(user_github.getDataConfig()["installation_id"])
        return JsonResponse({"token": token})

    @action(detail=False, methods=["POST"], url_path="agents/message", permission_classes=[permissions.AllowAny])
    def addAiMessage(self, request):
        serializer = NewAiMessage(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        agent = Agent.objects.filter(id=data["agent_id"]).first()
        if not agent:
            raise APIException("no agent found matching id")
        newMessage = Message.objects.create(sender="AGENT", agent=agent, content=data["message"])
        return JsonResponse({"message_id": newMessage.id})
    
    @action(detail=False, methods=["POST"], url_path="agents/(?P<agent_id>[^/.]+)/status", permission_classes=[permissions.AllowAny])
    def updateAgentStatus(self, request, agent_id=None):
        agent = Agent.objects.filter(id=agent_id).first()
        if not agent:
            raise APIException("no agent found")
        status = request.data.get("status")
        if status not in [choice[0] for choice in Agent.Status.choices]:
            raise APIException("invalid status")
        agent.status = status
        agent.save()
        return HttpResponse(status=204)
    
    @action(detail=False, methods=["POST"], url_path="agents/(?P<agent_id>[^/.]+)/bulk-tool-calls", permission_classes=[permissions.AllowAny])
    def bulkAddToolCalls(self, request, agent_id=None):
        agent = Agent.objects.filter(id=agent_id).first()
        if not agent:
            raise APIException("no agent found")
        
        message_id = request.data.get("message_id")
        if not message_id:
            raise APIException("message_id required")

        message = Message.objects.filter(id=message_id, agent=agent, sender='AGENT').first()
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
                    agent=agent,
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
