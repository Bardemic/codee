from abc import ABC, abstractmethod
import httpx
from rest_framework.exceptions import APIException
from integrations.models import IntegrationProvider, IntegrationConnection
from .models import Agent

class CloudProvider(ABC):
    slug = None

    def get_user_integration(self, user, slug):
        integration_provider = IntegrationProvider.objects.filter(slug=slug.lower()).first()
        if not integration_provider: raise APIException("provider not found")
        
        user_integration = IntegrationConnection.objects.filter(user=user, provider=integration_provider).first()
        if not user_integration: raise APIException("integration not found")
        return user_integration

    @abstractmethod
    def create_agent(self, user, workspace, repository_full_name, message):
        pass

class CursorProvider(CloudProvider):
    slug = "Cursor"

    def create_agent(self, user, workspace, repository_full_name, message):
        user_integration = self.get_user_integration(user=user, slug=self.slug)
        
        keys = user_integration.getDataConfig()
        if "api_key" not in keys: raise APIException("key not found")
        api_key = keys["api_key"]
        
        payload = {
            "prompt": {"text": message},
            "source": {"repository": "https://github.com/" + repository_full_name}
        }
        
        cursor_request = httpx.post(
            "https://api.cursor.com/v0/agents",
            auth=(api_key, ""),
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        
        cursor_json = cursor_request.json()
        if cursor_request.status_code >= 400 or "id" not in cursor_json:
            raise APIException("cursor provider error")
            
        return Agent.objects.create(
            workspace=workspace, 
            provider_type=self.slug, 
            conversation_id=cursor_json["id"], 
            url=cursor_json["target"]["url"]
        )

class JulesProvider(CloudProvider):
    slug = "Jules"

    def create_agent(self, user, workspace, repository_full_name, message):
        user_integration = self.get_user_integration(user=user, slug=self.slug)
        
        keys = user_integration.getDataConfig()
        if "api_key" not in keys: raise APIException("key not found")
        api_key = keys["api_key"]
        
        payload = {
            "prompt": message,
            "sourceContext": {
                "source": "sources/github/" + repository_full_name,
                "githubRepoContext": {
                    "startingBranch": "main"
                }
            }
        }
        
        jules_request = httpx.post(
            "https://jules.googleapis.com/v1alpha/sessions",
            json=payload,
            headers={"Content-Type": "application/json", "X-Goog-Api-Key": api_key},
        )
        
        jules_json = jules_request.json()
        if jules_request.status_code >= 400 or "id" not in jules_json:
            raise APIException("cursor provider error")
            
        return Agent.objects.create(
            workspace=workspace, 
            provider_type=self.slug, 
            conversation_id=jules_json["id"], 
            url=jules_json["url"]
        )

PROVIDERS = {
    "Cursor": CursorProvider,
    "Jules": JulesProvider,
}

def get_provider_class(name):
    return PROVIDERS.get(name)
