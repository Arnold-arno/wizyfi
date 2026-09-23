# apps/portal/views.py
#
# This is the one app in the whole backend meant to be hit by
# unauthenticated end users (doc00 §2: Captive Portal experience).
# Every view here is AllowAny by design — the security boundary is rate
# limiting and careful field selection, not authentication.

from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.access.models import AccessPlan
from apps.access.services import redeem_voucher, start_session
from apps.connectors.models import Router
from apps.places.models import Place

from .serializers import (
    PortalPlanSerializer,
    PortalRedeemRequestSerializer,
    PortalSessionSerializer,
    PortalWelcomeSerializer,
)


def _get_enabled_place(place_id):
    try:
        place = Place.objects.select_related("portal_config").get(id=place_id)
    except Place.DoesNotExist:
        raise NotFound("Not found.")

    config = getattr(place, "portal_config", None)
    if config and not config.is_enabled:
        # Deliberately the same 404 as "place doesn't exist" — doesn't
        # confirm to an outside caller that a disabled place exists.
        raise NotFound("Not found.")
    return place, config


class PortalWelcomeView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "portal"

    def get(self, request, place_id):
        place, config = _get_enabled_place(place_id)
        data = {
            "place_name": place.name,
            "welcome_message": config.welcome_message if config else "",
            "support_contact": config.support_contact if config else "",
            "terms_url": config.terms_url if config else "",
        }
        return Response(PortalWelcomeSerializer(data).data)


class PortalPlansView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "portal"

    def get(self, request, place_id):
        place, _config = _get_enabled_place(place_id)
        plans = AccessPlan.objects.filter(
            organization_id=place.organization_id,
            status="ACTIVE",
            is_publicly_listed=True,
        ).order_by("price")
        return Response(PortalPlanSerializer(plans, many=True).data)


class PortalRedeemView(APIView):
    """The security-sensitive endpoint: a voucher code is a bearer
    credential, and this is the one place in the system where an
    unauthenticated caller gets to guess one. Scoped throttle rate is
    intentionally far tighter than the general portal-browsing scope
    (doc11: 'DoS/rate abuse | Rate limits, bounded queries, pagination')."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "voucher_redeem"

    def post(self, request, place_id):
        place, _config = _get_enabled_place(place_id)

        input_serializer = PortalRedeemRequestSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        v = input_serializer.validated_data

        try:
            router = Router.objects.get(id=v["router_id"], place=place)
        except Router.DoesNotExist:
            raise ValidationError({"router_id": ["Router not found for this place."]})

        # redeem_voucher raises ConflictError on any invalid/already-used
        # code — deliberately the same error whether the code never
        # existed, was already redeemed, or expired, so a caller can't
        # distinguish "wrong code" from "code exists but is used up"
        # beyond what the message itself says (doc11 secret-leakage care
        # applied to voucher codes, not just credentials).
        voucher = redeem_voucher(
            organization_id=place.organization_id, code=v["code"], mac_address=v["mac_address"]
        )
        session = start_session(
            customer=voucher.redeemed_by_customer,
            router=router,
            place=place,
            voucher=voucher,
            access_plan=voucher.plan,
        )

        data = {
            "session_id": session.id,
            "status": session.status,
            "expires_at": session.expires_at,
            "plan_name": voucher.plan.name,
        }
        return Response(PortalSessionSerializer(data).data, status=201)
