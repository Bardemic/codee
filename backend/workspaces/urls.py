from django.urls import path
from rest_framework.routers import DefaultRouter

from workspaces import views

router = DefaultRouter()
router.register('internals', views.OrchestratorViews,basename='internals')
router.register('workspace', views.UserWorkspaceViews, basename='user')

urlpatterns = router.urls

