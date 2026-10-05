# apps/dashboard/urls.py
from django.urls import path

from .views import DashboardViewSet

# A single read-only aggregate resource, so a plain path is clearer than a
# router (and avoids a second DefaultRouter API-root view at /api/v1/).
urlpatterns = [
    path("dashboard/", DashboardViewSet.as_view({"get": "list"}), name="dashboard"),
]
