import hashlib
import hmac
import json

from amqp import connection
from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError, NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import IntegrationProvider, IntegrationConnection
from .services.github_app import get_installation_token


@method_decorator(csrf_exempt, name="dispatch")
class BaseWebhookViewSet(viewsets.ViewSet):
    authentication_classes = ()
    permission_classes = (AllowAny,)
    provider_slug = None

    def get_provider(self):
        if not self.provider_slug:
            raise NotFound()
        provider = IntegrationProvider.objects.filter(slug=self.provider_slug).first()
        if not provider:
            raise NotFound()
        return provider

    def parse_body(self, request):
        if not request.body:
            return {}
        try:
            return json.loads(request.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValidationError("invalid payload") from exc

    def build_response(self):
        return Response(status=status.HTTP_204_NO_CONTENT)


class GitHubWebhookViewSet(BaseWebhookViewSet):
    provider_slug = "github_app"

    @action(detail=False, methods=["post"], url_path="events")
    def events(self, request):
        self.get_provider()
        secret = settings.GITHUB_WEBHOOK_SECRET
        if not secret:
            raise PermissionDenied("secret missing")
        signature = request.META.get("HTTP_X_HUB_SIGNATURE_256")
        if not signature:
            raise PermissionDenied("signature missing")
        expected = self.compute_signature(secret.encode("utf-8"), request.body)
        if not hmac.compare_digest(signature, expected):
            raise PermissionDenied("signature mismatch")
        event = request.META.get("HTTP_X_GITHUB_EVENT")
        if not event:
            raise ValidationError("event missing")
        body = self.parse_body(request)
        self.handle_event(event, body)
        return self.build_response()

    def compute_signature(self, secret, payload):
        digest = hmac.new(secret, payload, hashlib.sha256).hexdigest()
        return f"sha256={digest}"

    def handle_event(self, event, body):
        action = body.get("action")
        if not action: return

        if (event == "installation" and action == "deleted"):
            installation_id = self.get_installation_id(body)
            connnection = self.get_connection(installation_id)
            if connnection:
                connnection.delete()

    def get_installation_id(self, body):
        installation = body.get("installation")
        if not isinstance(installation, dict): return None

        installation_id = installation.get("id")
        return installation_id

    def get_connection(self, installation_id):
        connections = IntegrationConnection.objects.filter(
            provider__slug=self.provider_slug
        ).select_related("user")
        # 3am thoughts: I threw up while writing this
        # it's so awful
        # it will be fixed eventually
        for connection in connections:
            config = connection.getDataConfig()
            stored_id = config.get("installation_id")
            if stored_id and str(stored_id) == str(installation_id):
                return connection
        return None


