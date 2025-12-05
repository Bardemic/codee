from abc import ABC, abstractmethod
import httpx
from rest_framework.exceptions import APIException
from integrations.models import IntegrationProvider, IntegrationConnection
from .models import Agent, Message
from .serializers import MessageSerializer, CursorMessageSerializer, JulesMessageSerializer

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

    @abstractmethod
    def get_messages(self, user, agent):
        pass

    @abstractmethod
    def send_message(self, user, agent, message):
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

    def get_messages(self, user, agent):
        messages = Message.objects.filter(agent=agent).order_by('created_at').prefetch_related('tool_calls')
        return MessageSerializer(messages, many=True).data

    def send_message(self, user, agent, message):
        prev_messages = Message.objects.filter(agent=agent).order_by('created_at').prefetch_related('tool_calls')
        serialized_messages = MessageSerializer(prev_messages, many=True).data
        user_message = Message.objects.create(agent=agent, content=message, sender="USER")
        tool_slugs = list(agent.workspace.tools.values_list("slug_name", flat=True))

        response = httpx.post('http://127.0.0.1:8000/newMessage', json={
            "prompt": message,
            "agent_id": agent.id,
            "previous_messages": serialized_messages,
            "tool_slugs": tool_slugs,
        })
        data = response.json()
        if data.get("status") == "queued":
            agent.status = "RUNNING"
            agent.save()
            return True
        user_message.delete()
        raise APIException("worker issue")

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

    def get_messages(self, user, agent):
        user_integration = self.get_user_integration(user=user, slug=self.slug)
        api_key = user_integration.getDataConfig().get("api_key")
        response = httpx.get(
            f"https://api.cursor.com/v0/agents/{agent.conversation_id}/conversation",
            auth=(api_key, "")
        )
        if response.status_code != 200:
            raise APIException("failed to fetch cursor messages")
        data = response.json()
        return CursorMessageSerializer(data.get("messages", []), many=True).data

    def send_message(self, user, agent, message):
        user_integration = self.get_user_integration(user=user, slug=self.slug)
        api_key = user_integration.getDataConfig().get("api_key")
        
        response = httpx.post(
            f"https://api.cursor.com/v0/agents/{agent.conversation_id}/followup",
            auth=(api_key, ""),
            json={"prompt": {"text": message}},
            headers={"Content-Type": "application/json"},
        )
        
        if response.status_code >= 400:
            raise APIException("failed to send cursor followup")
        
        agent.status = "RUNNING"
        agent.save()
        return True

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

    def get_messages(self, user, agent):
        user_integration = self.get_user_integration(user=user, slug=self.slug)
        api_key = user_integration.getDataConfig().get("api_key")
        response1 = httpx.get(
            f"https://jules.googleapis.com/v1alpha/sessions/{agent.conversation_id}",
            headers={"Content-Type": "application/json", "X-Goog-Api-Key": api_key},
        )
        response2 = httpx.get(
            f"https://jules.googleapis.com/v1alpha/sessions/{agent.conversation_id}/activities?pageSize=30",
            headers={"Content-Type": "application/json", "X-Goog-Api-Key": api_key},
        )
        if response1.status_code != 200 or response2.status_code != 200:
            raise APIException("failed to fetch jules messages")
        data1 = response1.json()
        data2 = response2.json()
        initialPrompt = {
            "id": agent.conversation_id,
            "originator": "user",
            "createTime": data1.get("createTime"),
            "userMessaged": {
                "userMessage": data1.get("prompt", "")
            }
        }
        status = data1.get("state")
        if status == "COMPLETED" and agent.status != "COMPLETED":
            agent.status = "COMPLETED"
            agent.save()
        activities = [initialPrompt] + data2.get("activities", [])
        return JulesMessageSerializer(activities, many=True).data

    def send_message(self, user, agent, message):
        user_integration = self.get_user_integration(user=user, slug=self.slug)
        api_key = user_integration.getDataConfig().get("api_key")
        
        response = httpx.post(
            f"https://jules.googleapis.com/v1alpha/sessions/{agent.conversation_id}:sendMessage",
            json={"prompt": message},
            headers={"Content-Type": "application/json", "X-Goog-Api-Key": api_key},
        )
        
        if response.status_code >= 400:
            raise APIException("failed to send jules message")
        
        agent.status = "RUNNING"
        agent.save()
        return True

PROVIDERS = {
    "Cursor": CursorProvider,
    "Jules": JulesProvider,
    "Codee": CodeeProvider
}

def get_provider_class(name):
    return PROVIDERS.get(name)
