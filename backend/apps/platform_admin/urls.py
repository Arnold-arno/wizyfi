# apps/platform_admin/urls.py
from rest_framework.routers import DefaultRouter

from django.urls import path

from .views import AgentViewSet, PlanViewSet, PlatformActivityViewSet, PlatformDashboardView

router = DefaultRouter()
router.register("agents", AgentViewSet, basename="agent")
router.register("plans", PlanViewSet, basename="platform-plan")
router.register("activity", PlatformActivityViewSet, basename="platform-activity")

urlpatterns = [
    path("dashboard/", PlatformDashboardView.as_view(), name="platform-dashboard"),
] + router.urls
