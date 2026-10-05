# apps/organizations/serializers.py
from rest_framework import serializers

from .models import DEFAULT_ROLE_PERMISSIONS, Membership, Organization


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["id", "name", "status", "created_at"]
        read_only_fields = ["id", "status", "created_at"]


class MembershipSerializer(serializers.ModelSerializer):
    """Now also exposes the caller's *effective* permission codes.

    Why: the frontend hides/shows controls by permission code, but nothing
    previously told it which codes the caller holds, so a gate like
    hasPermission("sales:create") could never be true. This is a UX hint only
    — HasPermissionCode still decides every request server-side (doc07).

    Contract (mirrors Membership.has_permission exactly):
      * suspended membership / suspended organization -> []
      * roles with the wildcard (OWNER)               -> ["*"]
      * otherwise                                     -> role codes + extras
      * `revoked_permissions` is returned separately because revocation wins
        over everything, including the OWNER wildcard.
    """

    organization = OrganizationSerializer(read_only=True)
    permissions = serializers.SerializerMethodField()
    revoked_permissions = serializers.SerializerMethodField()

    class Meta:
        model = Membership
        fields = [
            "id", "organization", "role", "status",
            "permissions", "revoked_permissions", "created_at",
        ]
        read_only_fields = fields

    def get_permissions(self, obj) -> list[str]:
        if obj.status != "ACTIVE" or obj.organization.status != "ACTIVE":
            return []
        role_perms = DEFAULT_ROLE_PERMISSIONS.get(obj.role, set())
        if "*" in role_perms:
            return ["*"]
        return sorted(role_perms | set(obj.extra_permissions))

    def get_revoked_permissions(self, obj) -> list[str]:
        return sorted(set(obj.revoked_permissions))
