from rest_framework.routers import DefaultRouter
from .views import GitHubIntegrationViews, IntegrationViews


router = DefaultRouter()
router.register('', IntegrationViews, basename='integrations')
router.register('github', GitHubIntegrationViews, basename='github')

urlpatterns = router.urls