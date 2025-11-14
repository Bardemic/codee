from django.contrib import admin

# Register your models here.

from .models import Workspace, Message

admin.site.register(Workspace)
admin.site.register(Message)