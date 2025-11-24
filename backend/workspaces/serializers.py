from .models import WorkerDefinition, Workspace, Message, ToolCall
from rest_framework import serializers
from integrations.serializer import ToolSerializer

class WorkerSerializer(serializers.ModelSerializer):
    tools = ToolSerializer(many=True, read_only=True)
    class Meta:
        model = WorkerDefinition
        fields = ["id", "tools", "prompt"]


class ToolCallSerializer(serializers.ModelSerializer):
    class Meta:
        model = ToolCall
        fields = ["id", "created_at", "tool_name", "arguments", "result", "status", "duration_ms"]


class MessageSerializer(serializers.ModelSerializer):
    tool_calls = ToolCallSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = ["id", "created_at", "content", "sender", "tool_calls"]


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ["id", "created_at", "name", "default_branch", "status", "github_branch_name", "github_repository_name"]

class NewWorkspaceSerialier(serializers.Serializer):
    message = serializers.CharField()
    repository_full_name = serializers.CharField()
    tool_slugs = serializers.ListField(child=serializers.CharField())

class NewMessageSerializer(serializers.Serializer):
    message = serializers.CharField()

class NewAiMessage(serializers.Serializer):
    message = serializers.CharField()
    workspace_id = serializers.IntegerField()