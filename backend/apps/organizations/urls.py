# apps/organizations/urls.py
from django.urls import path

from .views import CreateOrganizationView, MyMembershipsView

urlpatterns = [
    path("", MyMembershipsView.as_view(), name="organizations-list"),
    path("create/", CreateOrganizationView.as_view(), name="organizations-create"),
]
