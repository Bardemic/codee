from .models import WorkerDefinition, Workspace, Message, ToolCall, Agent
from rest_framework import serializers
from integrations.serializer import ToolSerializer

class ToolCallSerializer(serializers.ModelSerializer):
    class Meta:
        model = ToolCall
        fields = ["id", "created_at", "tool_name", "arguments", "result", "status", "duration_ms"]


class MessageSerializer(serializers.ModelSerializer):
    tool_calls = ToolCallSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = ["id", "created_at", "content", "sender", "tool_calls"]

class CursorMessageSerializer(serializers.Serializer):
    id = serializers.CharField()
    type = serializers.CharField()
    text = serializers.CharField(default="")

    def to_representation(self, instance):
        return {
            "id": instance.get("id"),
            "created_at": None,
            "content": instance.get("text", ""),
            "sender": "USER" if instance.get("type") == "user_message" else "AGENT",
            "tool_calls": []
        }

class AgentSerializer(serializers.ModelSerializer):
    url = serializers.CharField()
    integration = serializers.ChoiceField(choices=Agent.ProviderType.choices, source='provider_type')
    class Meta:
        model = Agent
        fields = ["url", "integration", "id", "name", "status", "github_branch_name"]

class LinkedWorkspaceSerializer(serializers.ModelSerializer):
    agents = AgentSerializer(many=True, read_only=True, source='provider_agents')
    
    class Meta:
        model = Workspace
        fields = ["id", "name", "created_at", "agents"]

class WorkerSerializer(serializers.ModelSerializer):
    tools = ToolSerializer(many=True, read_only=True)
    workspaces = serializers.SerializerMethodField()
    
    class Meta:
        model = WorkerDefinition
        fields = ["id", "tools", "prompt", "workspaces", "slug", "cloud_providers"]

    def get_workspaces(self, obj):
        qs = obj.workspace_set.order_by('-created_at')[:3]
        return LinkedWorkspaceSerializer(qs, many=True).data


class WorkspaceSerializer(serializers.ModelSerializer):
    agents = AgentSerializer(many=True, read_only=True, source='provider_agents')
    
    class Meta:
        model = Workspace
        fields = ["id", "created_at", "name", "default_branch", "github_repository_name", "agents"]

class AgentConfigSerializer(serializers.Serializer):
    model = serializers.CharField(required=False, allow_null=True, allow_blank=True)

class ProviderConfigSerializer(serializers.Serializer):
    name = serializers.ChoiceField(choices=Agent.ProviderType.choices)
    agents = serializers.ListField(child=AgentConfigSerializer())

class NewWorkerSerializer(serializers.Serializer):
    slug = serializers.CharField()
    prompt = serializers.CharField()
    tool_slugs = serializers.ListField(child=serializers.CharField())
    key = serializers.CharField(required=False)
    cloud_providers = serializers.ListField(
        child=ProviderConfigSerializer(),
        min_length=1
    )

class NewWorkspaceSerialier(serializers.Serializer):
    message = serializers.CharField()
    repository_full_name = serializers.CharField()
    tool_slugs = serializers.ListField(child=serializers.CharField())
    cloud_providers = serializers.ListField(
        child=ProviderConfigSerializer(),
        min_length=1
    )

class NewMessageSerializer(serializers.Serializer):
    message = serializers.CharField()

class NewAiMessage(serializers.Serializer):
    message = serializers.CharField()
    agent_id = serializers.IntegerField()
