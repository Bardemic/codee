from rest_framework.routers import SimpleRouter

from .webhooks import CursorWebhookViewSet, GitHubWebhookViewSet, PostHogWebhookViewSet


router = SimpleRouter()
router.register("github", GitHubWebhookViewSet, basename="github-webhooks")
router.register("posthog", PostHogWebhookViewSet, basename="posthog-webhooks")
router.register("cursor", CursorWebhookViewSet, basename="cursor-webhooks")

urlpatterns = router.urls

