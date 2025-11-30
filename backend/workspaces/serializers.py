from .models import WorkerDefinition, Workspace, Message, ToolCall, Agent
from rest_framework import serializers
from integrations.serializer import ToolSerializer

class LinkedWorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ["id", "name", "status", "created_at"]

class WorkerSerializer(serializers.ModelSerializer):
    tools = ToolSerializer(many=True, read_only=True)
    workspaces = serializers.SerializerMethodField()
    
    class Meta:
        model = WorkerDefinition
        fields = ["id", "tools", "prompt", "workspaces", "slug"]

    def get_workspaces(self, obj):
        qs = obj.workspace_set.order_by('-created_at')[:3]
        return LinkedWorkspaceSerializer(qs, many=True).data


class ToolCallSerializer(serializers.ModelSerializer):
    class Meta:
        model = ToolCall
        fields = ["id", "created_at", "tool_name", "arguments", "result", "status", "duration_ms"]


class MessageSerializer(serializers.ModelSerializer):
    tool_calls = ToolCallSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = ["id", "created_at", "content", "sender", "tool_calls"]

class AgentSerializer(serializers.ModelSerializer):
    url = serializers.CharField()
    integration = serializers.ChoiceField(choices=Agent.ProviderType.choices, source='provider_type')
    class Meta:
        model = Agent
        fields = ["url", "integration"]


class WorkspaceSerializer(serializers.ModelSerializer):
    provider_agents = AgentSerializer(many=True, read_only=True)
    
    class Meta:
        model = Workspace
        fields = ["id", "created_at", "name", "default_branch", "status", "github_branch_name", "github_repository_name", "provider_agents"]

class NewWorkerSerializer(serializers.Serializer):
    slug = serializers.CharField()
    prompt = serializers.CharField()
    tool_slugs = serializers.ListField(child=serializers.CharField())
    key = serializers.CharField(required=False)

class NewWorkspaceSerialier(serializers.Serializer):
    message = serializers.CharField()
    repository_full_name = serializers.CharField()
    tool_slugs = serializers.ListField(child=serializers.CharField())
    cloud_providers = serializers.ListField(
        child=serializers.ChoiceField(choices=Agent.ProviderType.choices)
    )

class NewMessageSerializer(serializers.Serializer):
    message = serializers.CharField()

class NewAiMessage(serializers.Serializer):
    message = serializers.CharField()
    workspace_id = serializers.IntegerField()
