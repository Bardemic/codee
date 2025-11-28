from django.contrib import admin

# Register your models here.

from .models import WorkerDefinition, WorkerDefinitionTool, Workspace, Message, ToolCall, WorkspaceTool, ProviderAgent

admin.site.register(Workspace)
admin.site.register(Message)
admin.site.register(ToolCall)
admin.site.register(WorkspaceTool)
admin.site.register(WorkerDefinition)
admin.site.register(WorkerDefinitionTool)
admin.site.register(ProviderAgent)