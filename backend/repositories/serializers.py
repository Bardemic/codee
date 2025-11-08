from repositories.models import Repository
from rest_framework import serializers

class RepositorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Repository
        fields = ["id", "created_at", "name", "default_branch", "uuid"]


    def create(self, validated_data):
        return  Repository.objects.create(**validated_data)
    
    # def update(self, instance, validated_data):