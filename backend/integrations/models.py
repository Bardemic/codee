from django.db import models
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from utils.encryption import decrypt_data, encrypt_data

PROVIDER_SCHEMAS = {
    "github_app": { #key == IntegrationProvider.slug
        "installation_id": {"type": str, "required": True},
        "account_login": {"type": str},
        "account_id": {"type": int},
        "account_type": {"type": str},
    }
}

class IntegrationProvider(models.Model):
    slug = models.CharField(max_length=200, unique=True)
    display_name = models.CharField(max_length=200)
    schema = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.display_name

class IntegrationConnection(models.Model):
    user = models.ForeignKey(get_user_model(), on_delete=models.CASCADE)
    provider = models.ForeignKey(IntegrationProvider, on_delete=models.CASCADE)
    external_id = models.CharField(max_length=255, blank=True, default="")
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def setDataConfig(self, input: dict) -> None:
        encrypted = {}
        for key in input:
            encrypted[key] = encrypt_data(input[key])
        self.data = encrypted

    def getDataConfig(self) -> dict:
        decrypted = {}
        for key in self.data:
            decrypted[key] = decrypt_data(self.data[key])
        return decrypted


    class Meta:
        unique_together = ("user", "provider", "external_id")
    
    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def clean(self):
        values = self.getDataConfig()
        schema = PROVIDER_SCHEMAS[self.provider.slug]
        for key, rules in schema.items():
            if rules.get("required") and key not in values:
                raise ValidationError(f"Missing required: {key}")
            if key in self.data and not isinstance(values[key], rules["type"]):
                raise ValidationError(f"{key} must be {rules['type'].__name__}")

class Tool(models.Model):
    display_name = models.CharField(max_length=200)
    provider = models.ForeignKey(IntegrationProvider, on_delete=models.CASCADE, related_name="tools", null=True)

    class Meta:
        unique_together = ("display_name", "provider")