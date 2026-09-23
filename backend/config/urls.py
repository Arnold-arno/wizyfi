# config/urls.py
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("django-admin/", admin.site.urls),  # ops-only Django admin, not the product UI
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/organizations/", include("apps.organizations.urls")),
    path("api/v1/places/", include("apps.places.urls")),  # flat layout, not nested (Expectations_and_workflow)
    path("api/v1/", include("apps.connectors.urls")),
    path("api/v1/", include("apps.devices.urls")),
    path("api/v1/", include("apps.customers.urls")),
    path("api/v1/", include("apps.access.urls")),
    path("api/v1/portal/", include("apps.portal.urls")),
    path("api/v1/", include("apps.audit.urls")),
    path("api/v1/", include("apps.notifications.urls")),
    path("api/v1/platform-admin/", include("apps.platform_admin.urls")),
]
