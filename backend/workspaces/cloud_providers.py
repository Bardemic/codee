from abc import ABC, abstractmethod
import httpx
from rest_framework.exceptions import APIException
from integrations.models import IntegrationProvider, IntegrationConnection
from .models import Agent, Message

class CloudProvider(ABC):
    slug = None

    def get_user_integration(self, user, slug):
        integration_provider = IntegrationProvider.objects.filter(slug=slug.lower()).first()
        if not integration_provider: raise APIException("provider not found")
        
        user_integration = IntegrationConnection.objects.filter(user=user, provider=integration_provider).first()
        if not user_integration: raise APIException("integration not found")
        return user_integration

    @abstractmethod
    def create_agent(self, user, workspace, repository_full_name, message, tool_slugs, model=None):
        pass

class CodeeProvider(CloudProvider):
    slug = "Codee"

    def create_agent(self, user, workspace, repository_full_name, message, tool_slugs, model=None):
        agent = Agent.objects.create(
            workspace=workspace, 
            provider_type=self.slug, 
            conversation_id="codee", 
            url="", 
            name=self.slug + " Agent" + (f", {model}" if model else ""),
            model=model
        )
        Message.objects.create(agent=agent, content=message, sender="USER")

        codee_request = httpx.post('http://127.0.0.1:8000/newAgent', json={
            "prompt": message,
            "repository_full_name": repository_full_name,
            "agent_id": agent.id,
            "tool_slugs": tool_slugs,
            "model": model,
        })
        codee_response = codee_request.json()

        if codee_response.get("status") == "queued":
            agent.status = "PENDING"
        agent.save()

        return agent

class CursorProvider(CloudProvider):
    slug = "Cursor"

    def create_agent(self, user, workspace, repository_full_name, message, tool_slugs, model=None):
        user_integration = self.get_user_integration(user=user, slug=self.slug)
        
        keys = user_integration.getDataConfig()
        if "api_key" not in keys: raise APIException("key not found")
        api_key = keys["api_key"]

        agent = Agent.objects.create(
            workspace=workspace, 
            provider_type=self.slug, 
            name=self.slug + " Agent" + (f", {model}" if model else ""),
            model=model
        )
        
        payload = {
            "prompt": {"text": message},
            "source": {"repository": "https://github.com/" + repository_full_name},
            "model": model,
            "webhook": {"url": f"https://be55eb7d67a3.ngrok-free.app/webhooks/cursor/complete/{agent.id}/"}
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
        
        agent.conversation_id = cursor_json["id"]
        agent.url = cursor_json["target"]["url"]
        agent.github_branch_name = cursor_json["target"]["branchName"]
        agent.status = "RUNNING"
        agent.save()
        
        return agent

class JulesProvider(CloudProvider):
    slug = "Jules"

    def create_agent(self, user, workspace, repository_full_name, message, tool_slugs, model=None):
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
            raise APIException("jules provider error")
            
        return Agent.objects.create(
            workspace=workspace, 
            provider_type=self.slug, 
            conversation_id=jules_json["id"], 
            url=jules_json["url"],
            name=self.slug + " Agent" + (f", {model}" if model else ""),
        )

PROVIDERS = {
    "Cursor": CursorProvider,
    "Jules": JulesProvider,
    "Codee": CodeeProvider
}

def get_provider_class(name):
    return PROVIDERS.get(name)
