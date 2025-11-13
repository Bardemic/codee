from .models import Workspace
from rest_framework import serializers

class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ["id", "created_at", "name", "default_branch"]

class NewMessageSerializer(serializers.Serializer):
    message = serializers.CharField()
    # repository_id = serializers.IntegerField()
    repository_full_name = serializers.CharField()
    #branch later
    #for now, only new
class NewAiMessage(serializers.Serializer):
    message = serializers.CharField()
    workspace_id = serializers.IntegerField()