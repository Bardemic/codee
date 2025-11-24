from django.db.models import Exists, OuterRef, Subquery
import requests
from django.http import JsonResponse, HttpResponse
from rest_framework.authentication import TokenAuthentication
from rest_framework.decorators import action
from rest_framework.exceptions import APIException
from rest_framework.permissions import IsAuthenticated
from integrations.services.github_app import get_installation_token
from rest_framework import viewsets
from .serializer import GithubRepositorySerializer, IntegrationWithStatusSerializer, ConnectGithubPayloadSerializer, ApiKeyIntegrationSerializer
from .models import IntegrationConnection, IntegrationProvider, PROVIDER_SCHEMAS
from .services.github_app import get_installation_token


class GitHubIntegrationViews(viewsets.ViewSet):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]


    @action(detail=False, methods=["get"], url_path="repositories")
    def repositories(self, request):
        connection = IntegrationConnection.objects.filter(user=request.user, provider__slug="github_app").first()
        if not connection:
            APIException("no github connection found")
        installation_id = connection.getDataConfig()["installation_id"]

        token = get_installation_token(installation_id)
        if not token:
            raise APIException("auth didn't work")
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
        r = requests.get("https://api.github.com/installation/repositories?per_page=100", headers=headers)
        serializer = GithubRepositorySerializer((r.json())["repositories"], many=True)
        return JsonResponse(serializer.data, safe=False)

    @action(detail=False, methods=["post"], url_path="connect")
    def connect(self, request):
        provider = IntegrationProvider.objects.filter(slug="github_app").first()
        if not provider:
            raise APIException("boo hoo")
        serializer = ConnectGithubPayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        installation_id = serializer.validated_data['installation_id']
        isUserConnected = IntegrationConnection.objects.filter(user=request.user, provider=provider).first()
        if isUserConnected:
            raise APIException("uh oh")
        token = get_installation_token(installation_id)
        if not token:
            raise APIException("bad")
        userIntegration = IntegrationConnection(user=request.user, provider=provider)
        userIntegration.setDataConfig({"installation_id": installation_id})
        userIntegration.save()
        return HttpResponse(status=204)

class IntegrationViews(viewsets.ViewSet):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]
    lookup_value_regex = r"\d+"

    def list(self, request):
        providers = IntegrationProvider.objects.prefetch_related('tools').annotate(
            connected=Exists(
                IntegrationConnection.objects.filter(
                    user=request.user, provider=OuterRef("pk")
                )

            ),
            connection_id=Subquery(
                IntegrationConnection.objects
                .filter(user=request.user, provider=OuterRef("pk"))
                .values("id")[:1]

            ),
        )
        serializer = IntegrationWithStatusSerializer(providers, many=True)
        return JsonResponse(serializer.data, safe=False)

    
    
    def destroy(self, request, pk=None):
        if not pk:
            raise APIException("no key")
        userIntegration = IntegrationConnection.objects.filter(user=request.user, pk=pk).first()
        if not userIntegration:
            raise APIException("no integration found (bad id?)")
        userIntegration.delete()
        return HttpResponse(status=204)

    @action(detail=True, methods=["post"])
    def connect(self, request, pk=None):
        if not pk:
            raise APIException("no provider id provided")

        provider = IntegrationProvider.objects.filter(pk=pk).first()
        if not provider:
            raise APIException("unknown provider")

        if provider.slug == "github_app":
            raise APIException("github connections must use the github endpoint")

        if provider.slug not in PROVIDER_SCHEMAS:
            raise APIException("provider schema not configured")

        serializer = ApiKeyIntegrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        existing_connection = IntegrationConnection.objects.filter(user=request.user, provider=provider).first()
        if existing_connection:
            raise APIException("integration already connected")

        userIntegration = IntegrationConnection(user=request.user, provider=provider)
        userIntegration.setDataConfig(serializer.validated_data)
        userIntegration.save()
        return HttpResponse(status=204)