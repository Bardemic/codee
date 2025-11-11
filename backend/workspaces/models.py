from django.db import models
from django.contrib.auth import get_user_model

# Create your models here.
class Workspace(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    name = models.CharField(max_length = 200)
    default_branch = models.CharField(max_length = 100, default="main")
    uuid = models.UUIDField()
    user = models.ForeignKey(get_user_model(), on_delete=models.CASCADE)
    github_id = models.IntegerField(editable=False, null=False)

    def __str__(self):
        return self.name