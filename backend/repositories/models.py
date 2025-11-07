from django.db import models

# Create your models here.
class Repository(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    name = models.CharField(max_length = 200)
    default_branch = models.CharField(max_length = 100, default="main")
    uuid = models.UUIDField(editable=False)