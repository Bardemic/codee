from rest_framework import serializers
from .models import IntegrationProvider

class ConnectGithubPayloadSerializer(serializers.Serializer):
    installation_id = serializers.CharField()

class IntegrationWithStatusSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(source="display_name")
    connected = serializers.BooleanField()
    connection_id = serializers.IntegerField(allow_null=True)

    class Meta:
        model = IntegrationProvider
        fields = ("id", "display_name", "connected", "connection_id")

class GithubRepositorySerializer(serializers.Serializer):
    github_id = serializers.IntegerField(source='id')
    name = serializers.CharField(source="full_name")
    default_branch = serializers.CharField()