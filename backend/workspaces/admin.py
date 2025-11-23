from django.contrib import admin

# Register your models here.

from .models import Workspace, Message, ToolCall, WorkspaceTool

admin.site.register(Workspace)
admin.site.register(Message)
admin.site.register(ToolCall)
admin.site.register(WorkspaceTool)