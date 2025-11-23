from rest_framework import serializers
from .models import IntegrationProvider, Tool

class ConnectGithubPayloadSerializer(serializers.Serializer):
    installation_id = serializers.CharField()

class ToolSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tool
        fields = ("id", "display_name", "slug_name")

class IntegrationWithStatusSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(source="display_name")
    connected = serializers.BooleanField()
    connection_id = serializers.IntegerField(allow_null=True)
    tools = ToolSerializer(many=True, read_only=True)

    class Meta:
        model = IntegrationProvider
        fields = ("id", "display_name", "connected", "connection_id", "tools")

class GithubRepositorySerializer(serializers.Serializer):
    github_id = serializers.IntegerField(source='id')
    name = serializers.CharField(source="full_name")
    default_branch = serializers.CharField()