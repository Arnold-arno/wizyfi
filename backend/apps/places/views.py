# apps/places/views.py
from django.core.exceptions import ObjectDoesNotExist
from django.db import IntegrityError
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
        return Place.objects.filter(organization_id=membership.organization_id).order_by("name")

    def perform_create(self, serializer):
        membership = self.require_active_membership(self.request)

        if membership.organization.status != "ACTIVE":
            raise PermissionDenied("This organization is suspended.")

        # Plan-limit enforcement (Expectations_and_workflow: "Wired into
        # Place creation"), closing out the TODO left in Round 1 before
        # apps.platform_admin's Plan/OrganizationSubscription existed.
        # No subscription at all = unlimited/grandfathered, a deliberate
        # default so organizations created before billing existed (or in
        # dev/test) aren't unexpectedly blocked.
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
            # The unique_place_name_per_org constraint is enforced at the
            # DB layer (Meta.constraints, not unique_together), so DRF's
            # automatic serializer validators never see it — without this
            # catch it surfaces as an unhandled 500.
            raise ConflictError("A place with this name already exists in this organization.")
