# apps/notifications/views.py
from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.permissions import IsOrganizationMember
from apps.common.views import OrganizationScopedMixin

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(
    OrganizationScopedMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """/api/v1/notifications/ — every active member of an organization
    sees their own notifications plus org-wide broadcasts (recipient is
    null). No special permission code: seeing your own notifications
    isn't a privileged action gated by role."""

    serializer_class = NotificationSerializer
    permission_classes = [IsOrganizationMember]
    filterset_fields = ["level", "is_read"]

    def get_queryset(self):
        membership = self.require_active_membership(self.request)
        return Notification.objects.filter(
            Q(organization_id=membership.organization_id)
            & (Q(recipient=self.request.user) | Q(recipient__isnull=True))
        ).order_by("-created_at")

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        notification = self.get_object()

        if notification.recipient_id is None:
            # A broadcast notification (recipient=None) is one shared row
            # across the whole organization. Mutating is_read on it would
            # mark it read for every member, not just the caller — there's
            # no per-recipient read-state model yet to do this correctly
            # (see DELIVERY_NOTES). Rather than silently produce that bug,
            # this is a clean no-op: the broadcast is returned as-is.
            return Response(NotificationSerializer(notification).data)

        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=["is_read", "read_at", "updated_at"])
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        # Same reasoning as above: only mutate notifications actually
        # addressed to this user, never shared broadcast rows.
        queryset = self.get_queryset().filter(is_read=False, recipient=request.user)
        count = queryset.update(is_read=True, read_at=timezone.now())
        return Response({"marked_count": count})
