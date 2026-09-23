# apps/common/permissions.py
#
# doc11 authorization model: explicit role/action matrix, deny by default.
# doc07: "Authenticate the principal at the API boundary, resolve
# provider/tenant context, then authorize every object-level action."

from rest_framework.permissions import BasePermission


class HasPermissionCode(BasePermission):
    """Generic DRF permission class that checks a granular permission
    code against the caller's active organization membership.

    Usage:
        class VoucherViewSet(...):
            permission_classes = [HasPermissionCode]
            required_permission_map = {
                "list": "vouchers:view",
                "create": "vouchers:issue",
                "destroy": "vouchers:revoke",
            }
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        required_map = getattr(view, "required_permission_map", {})
        required_code = required_map.get(view.action)
        if required_code is None:
            # No explicit mapping for this action: deny by default rather
            # than silently allowing an unreviewed action through.
            return False

        membership = getattr(request, "active_membership", None)
        if membership is None:
            return False

        return membership.has_permission(required_code)


class IsOrganizationMember(BasePermission):
    """Confirms the request carries a resolved, active organization
    membership — used as a baseline before object-level scoping."""

    def has_permission(self, request, view):
        return getattr(request, "active_membership", None) is not None


class IsSystemWorker(BasePermission):
    """For internal-only endpoints invoked by background workers.
    No interactive login is permitted through this path (doc11)."""

    def has_permission(self, request, view):
        return getattr(request, "auth", None) is not None and getattr(
            request.auth, "is_system_worker", False
        )


class IsPlatformStaff(BasePermission):
    """Super Admin domain access — orthogonal to organization membership.
    A user with no PlatformStaff row (apps.platform_admin.models) has
    zero access here, regardless of what role they hold in any
    organization. Never combine this with HasPermissionCode/
    OrganizationScopedMixin on the same view: platform_admin endpoints
    operate across all organizations, not scoped to one."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        staff = getattr(request.user, "platform_staff", None)
        return staff is not None and staff.is_active
