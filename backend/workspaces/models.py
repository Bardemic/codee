from django.db import models
from django.contrib.auth import get_user_model


class Workspace(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    name = models.CharField(max_length = 200)
    default_branch = models.CharField(max_length = 100, default="main")
    user = models.ForeignKey(get_user_model(), on_delete=models.CASCADE)
    github_repository_name = models.CharField(editable=False, null=False)
    github_branch_name = models.CharField(null=True)

    def __str__(self):
        return self.name

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