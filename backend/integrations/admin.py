from django.contrib import admin

# Register your models here.

from .models import IntegrationConnection, IntegrationProvider

admin.site.register(IntegrationProvider)
admin.site.register(IntegrationConnection)