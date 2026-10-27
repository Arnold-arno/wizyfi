# apps/access/recurring_views.py
#
# /api/v1/recurring-resets/ — list, retrieve, create, deactivate, activate.
# No update: like events, a rule is immutable. To change it, pause it and
# create a new one (keeps the audit trail honest).
from django.db.models import Min, Q
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.common.permissions import HasPermissionCode
from apps.common.views import OrganizationScopedMixin
from apps.places.models import Place

from .recurring import activate_recurring_reset, create_recurring_reset, deactivate_recurring_reset
from .recurring_models import RecurringReset
from .recurring_serializers import RecurringResetCreateSerializer, RecurringResetSerializer


class RecurringResetViewSet(
    OrganizationScopedMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = RecurringResetSerializer
    permission_classes = [HasPermissionCode]
    required_permission_map = {
        "list": "hard_logout:view",
        "retrieve": "hard_logout:view",
        "create": "hard_logout:schedule",
        "activate": "hard_logout:schedule",
        "deactivate": "hard_logout:cancel",
    }
    filterset_fields = ["place", "is_active"]

    def get_queryset(self):
        membership = self.require_active_membership(self.request)
        return (
            RecurringReset.objects.filter(place__organization_id=membership.organization_id)
            .annotate(
                next_at=Min(
                    "occurrences__scheduled_at",
                    filter=Q(occurrences__event__status="SCHEDULED", occurrences__scheduled_at__gt=timezone.now()),
                )
            )
            .order_by("-created_at")
        )

    def _fresh(self, rule):
        return RecurringResetSerializer(self.get_queryset().get(id=rule.id)).data

    def create(self, request, *args, **kwargs):
        membership = self.require_active_membership(request)
        serializer = RecurringResetCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        try:
            place = Place.objects.get(id=v["place"], organization_id=membership.organization_id)
        except Place.DoesNotExist:
            raise ValidationError({"place": ["Place not found in this organization."]})
        try:
            rule = create_recurring_reset(
                place=place, scope_type=v["scope_type"], router_ids=v.get("router_ids", []),
                time_of_day=v["time_of_day"], weekdays=v.get("weekdays", []), created_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": [str(exc)]})
        return Response(self._fresh(rule), status=201)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        rule = deactivate_recurring_reset(self.get_object(), actor=request.user)
        return Response(self._fresh(rule))

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        rule = activate_recurring_reset(self.get_object(), actor=request.user)
        return Response(self._fresh(rule))
