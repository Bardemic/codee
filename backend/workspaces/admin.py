from django.contrib import admin

# Register your models here.

from .models import Workspace, Message, ToolCall

admin.site.register(Workspace)
admin.site.register(Message)
admin.site.register(ToolCall)