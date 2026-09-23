# apps/portal/urls.py
from django.urls import path

from .views import PortalPlansView, PortalRedeemView, PortalWelcomeView

urlpatterns = [
    path("places/<uuid:place_id>/welcome/", PortalWelcomeView.as_view(), name="portal-welcome"),
    path("places/<uuid:place_id>/plans/", PortalPlansView.as_view(), name="portal-plans"),
    path("places/<uuid:place_id>/redeem/", PortalRedeemView.as_view(), name="portal-redeem"),
]
