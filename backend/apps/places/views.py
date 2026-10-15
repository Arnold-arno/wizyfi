# apps/places/views.py
# CHANGED (Round 13): get_queryset annotates router/connection counts. Nothing else.
from django.core.exceptions import ObjectDoesNotExist
from django.db import IntegrityError
from django.db.models import Count, Q
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied

from apps.common.exceptions import ConflictError
from apps.common.permissions import HasPermissionCode
from apps.common.views import OrganizationScopedMixin

from .models import Place
from .serializers import PlaceSerializer


class PlaceViewSet(OrganizationScopedMixin, viewsets.ModelViewSet):
    """/api/v1/places/ — flat layout, not nested under organizations
    (deliberate architectural choice per Expectations_and_workflow)."""

    serializer_class = PlaceSerializer
    permission_classes = [HasPermissionCode]
    required_permission_map = {
        "list": "places:view",
        "retrieve": "places:view",
        "create": "places:create",
        "update": "places:edit",
        "partial_update": "places:edit",
        "destroy": "places:edit",
    }
    filterset_fields = ["status"]
    search_fields = ["name"]

    def get_queryset(self):
        membership = self.require_active_membership(self.request)
        return (
            Place.objects.filter(organization_id=membership.organization_id)
            # distinct=True on both: two joins would otherwise multiply rows.
            .annotate(
                router_count=Count("routers", distinct=True),
                active_connection_count=Count(
                    "sessions", filter=Q(sessions__status="ACTIVE"), distinct=True
                ),
            )
            .order_by("name")
        )

    def perform_create(self, serializer):
        membership = self.require_active_membership(self.request)

        if membership.organization.status != "ACTIVE":
            raise PermissionDenied("This organization is suspended.")

        # Plan-limit enforcement. No subscription = unlimited/grandfathered.
        try:
            max_places = membership.organization.subscription.plan.max_places
        except ObjectDoesNotExist:
            max_places = None

        if max_places is not None:
            current_count = Place.objects.filter(organization_id=membership.organization_id).count()
            if current_count >= max_places:
                raise ConflictError(
                    f"This organization's plan allows at most {max_places} place(s). "
                    "Upgrade the plan to add more."
                )

        try:
            serializer.save(organization_id=membership.organization_id, status="SETUP")
        except IntegrityError:
            # unique_place_name_per_org is a DB constraint DRF validators never see.
            raise ConflictError("A place with this name already exists in this organization.")
