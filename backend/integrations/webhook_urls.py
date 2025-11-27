from rest_framework.routers import SimpleRouter

from .webhooks import GitHubWebhookViewSet, PostHogWebhookViewSet


router = SimpleRouter()
router.register("github", GitHubWebhookViewSet, basename="github-webhooks")
router.register("posthog", PostHogWebhookViewSet, basename="posthog-webhooks")

urlpatterns = router.urls

