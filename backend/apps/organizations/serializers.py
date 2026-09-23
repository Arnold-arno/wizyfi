# apps/organizations/serializers.py
from rest_framework import serializers

from .models import Membership, Organization


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["id", "name", "status", "created_at"]
        read_only_fields = ["id", "status", "created_at"]


class MembershipSerializer(serializers.ModelSerializer):
    organization = OrganizationSerializer(read_only=True)

    class Meta:
        model = Membership
        fields = ["id", "organization", "role", "status", "created_at"]
        read_only_fields = fields
