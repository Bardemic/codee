from django.contrib import admin

# Register your models here.

from .models import IntegrationConnection, IntegrationProvider, Tool

admin.site.register(IntegrationProvider)
admin.site.register(IntegrationConnection)
admin.site.register(Tool)