from django.db import models
from django.contrib.auth import get_user_model
from django.core.validators import MinLengthValidator
from utils.encryption import encrypt_data, decrypt_data

from integrations.models import Tool

class WorkerDefinition(models.Model):
    prompt = models.CharField(max_length=200)
    user = models.ForeignKey(get_user_model(), on_delete=models.CASCADE)
    created_at = models.TimeField(auto_now_add=True)
    tools = models.ManyToManyField(
        Tool,
        through='WorkerDefinitionTool',
        related_name='workerDefinitions'
    )
    slug = models.CharField(max_length=200)
    key = models.CharField(null=True)

    def setKey(self, input: str) -> None:
        # self.key = encrypt_data(input)
        self.key = input

    def getKey(self) -> str | None:
        if not self.key: return None
        return self.key
        try:
            return decrypt_data(self.key)
        except Exception:
            return None

    class Meta:
        unique_together = ("slug", "user")

    def __str__(self):
        return self.prompt if len(self.prompt) < 25 else self.prompt[:25] + '...'

class Workspace(models.Model):
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        RUNNING = 'RUNNING', 'Running'
        COMPLETED = 'COMPLETED', 'Completed'
        FAILED = 'FAILED', 'Failed'
    
    created_at = models.DateTimeField(auto_now_add=True)
    name = models.CharField(max_length = 200, default="Untitled", validators=[MinLengthValidator(1)])
    default_branch = models.CharField(max_length = 100, default="main")
    user = models.ForeignKey(get_user_model(), on_delete=models.CASCADE)
    github_repository_name = models.CharField(null=False)
    github_branch_name = models.CharField(null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    worker = models.ForeignKey(WorkerDefinition, null=True, on_delete=models.SET_NULL)
    tools = models.ManyToManyField(
        Tool,
        through='WorkspaceTool',
        related_name='workspaces'
    )

    def __str__(self):
        return str(self.pk)

class Message(models.Model):
    class senderType(models.TextChoices):
        USER = 'USER', 'User'
        AGENT = 'AGENT', 'Agent'
    created_at = models.DateTimeField(auto_now_add=True)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE)
    content = models.CharField()
    sender = models.CharField(max_length=5, choices=senderType.choices, null=False)
    #later: stuff like tools included, prev messages, etc

    def __str__(self):
        if len(self.content) >= 30:
            return f"{self.content[:40]}..."
        return self.content


class ToolCall(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='tool_calls')
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='tool_calls')
    created_at = models.DateTimeField()
    tool_name = models.CharField(max_length=100)
    arguments = models.JSONField()
    result = models.TextField()
    status = models.CharField(max_length=20, default='success')
    duration_ms = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.tool_name} @ {self.created_at}"

class WorkspaceTool(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE)
    tool = models.ForeignKey(Tool, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

class WorkerDefinitionTool(models.Model):
    worker_definition = models.ForeignKey(WorkerDefinition, on_delete=models.CASCADE)
    tool = models.ForeignKey(Tool, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

class ProviderAgent(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE)
    class ProviderType(models.TextChoices):
        CURSOR = 'Cursor', 'Cursor'
        JULES = 'Jules', 'Jules'

    provider_type = models.CharField(max_length=10, choices=ProviderType.choices)
    conversation_id = models.CharField(max_length=200)

    
