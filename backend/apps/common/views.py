# apps/common/views.py
#
# doc07: "Authenticate the principal at the API boundary, resolve
# provider/tenant context, then authorize every object-level action."
# This mixin does step 2. It must run in `initial()`, which DRF calls
# *after* `perform_authentication()`, so `request.user` is already
# populated from the JWT by this point.

from rest_framework.exceptions import PermissionDenied


class OrganizationScopedMixin:
    """Resolves request.active_membership from the X-Organization-Id
    header against the authenticated user's memberships. Every viewset
    that touches tenant-scoped data should mix this in and filter its
    queryset by `self.request.active_membership.organization_id`."""

    organization_header = "X-Organization-Id"

    def initial(self, request, *args, **kwargs):
        # DRF's own GenericAPIView.initial() runs perform_authentication()
        # AND check_permissions() in the same call. If we resolve
        # active_membership only *after* calling super().initial(), the
        # permission check runs against an unset membership and every
        # request gets wrongly denied. So: authenticate first, resolve
        # membership, *then* let super().initial() run (which re-runs
        # authentication harmlessly and then checks permissions correctly).
        self.perform_authentication(request)
        request.active_membership = None

        if request.user and request.user.is_authenticated:
            org_id = request.headers.get(self.organization_header)
            if org_id:
                # Deliberately does not distinguish "org doesn't exist" from
                # "user isn't a member" in the response — avoids leaking
                # which organizations exist to an unauthorized caller.
                request.active_membership = (
                    request.user.memberships.select_related("organization")
                    .filter(organization_id=org_id, status="ACTIVE")
                    .first()
                )

        super().initial(request, *args, **kwargs)

    def require_active_membership(self, request):
        if request.active_membership is None:
            raise PermissionDenied("No active organization context.")
        return request.active_membership
