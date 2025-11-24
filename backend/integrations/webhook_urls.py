from rest_framework.routers import SimpleRouter

from .webhooks import GitHubWebhookViewSet


router = SimpleRouter()
router.register("github", GitHubWebhookViewSet, basename="github-webhooks")

urlpatterns = router.urls

