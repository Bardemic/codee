from .models import Workspace, Message, ToolCall
from rest_framework import serializers


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

class NewMessageSerializer(serializers.Serializer):
    message = serializers.CharField()
    repository_full_name = serializers.CharField()

class NewAiMessage(serializers.Serializer):
    message = serializers.CharField()
    workspace_id = serializers.IntegerField()