# apps/organizations/views.py
from django.db import transaction
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Membership, Organization, Role
from .serializers import MembershipSerializer, OrganizationSerializer


class MyMembershipsView(generics.ListAPIView):
    """GET /organizations/ — the orgs the caller belongs to, with role.
    Used by the frontend org switcher; never returns other orgs."""

    serializer_class = MembershipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            Membership.objects.filter(user=self.request.user, status="ACTIVE")
            .select_related("organization")
            .order_by("organization__name")
        )


class CreateOrganizationView(APIView):
    """POST /organizations/ — bootstraps a new organization with the
    caller as OWNER. This is the only path that creates an OWNER
    membership; everything else goes through an invite flow (future work)."""

    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        name = request.data.get("name", "").strip()
        if not name:
            return Response(
                {"code": "VALIDATION_ERROR", "message": "name is required",
                 "fieldErrors": {"name": ["This field is required."]}},
                status=400,
            )
        organization = Organization.objects.create(name=name)
        membership = Membership.objects.create(
            user=request.user, organization=organization, role=Role.OWNER
        )
        return Response(MembershipSerializer(membership).data, status=201)
