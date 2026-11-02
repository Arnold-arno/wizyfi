# apps/accounts/views.py
#
# CHANGED (Round 20): email verification, password reset (neutral responses,
# single-use expiring links, sessions revoked on reset), change password,
# profile update. All sensitive endpoints are rate-limited by scope
# (settings.REST_FRAMEWORK DEFAULT_THROTTLE_RATES).
import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .emails import send_password_changed_email, send_password_reset_email, send_verification_email
from .serializers import (
    ChangePasswordSerializer,
    MeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    VerifyEmailSerializer,
    WizyfiTokenObtainPairSerializer,
)
from .tokens import read_verification_token, resolve_reset

logger = logging.getLogger(__name__)
User = get_user_model()

NEUTRAL_RESET_MESSAGE = "If an account matches, instructions will be sent."


def revoke_all_refresh_tokens(user) -> int:
    """Blacklist every outstanding refresh token: every device must sign in again."""
    count = 0
    for token in OutstandingToken.objects.filter(user=user):
        _, created = BlacklistedToken.objects.get_or_create(token=token)
        count += int(created)
    return count


def _check_new_password(password: str, user) -> None:
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        raise ValidationError({"password": list(exc.messages)})


class LoginView(TokenObtainPairView):
    serializer_class = WizyfiTokenObtainPairSerializer


class LogoutView(APIView):
    """Blacklists the presented refresh token. Access tokens remain
    short-lived (15 min) so no separate access-token revocation list
    is required for the logout flow itself."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"code": "VALIDATION_ERROR", "message": "refresh token is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            RefreshToken(refresh_token).blacklist()
        except TokenError:
            return Response(
                {"code": "VALIDATION_ERROR", "message": "Invalid or already-expired token"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        user = serializer.save()
        send_verification_email(user)  # never raises; failure is logged


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)

    def patch(self, request):
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(MeSerializer(request.user).data)


class VerifyEmailView(APIView):
    """POST {token}. Works signed in or out (the token is the credential)."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_token"

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = read_verification_token(serializer.validated_data["token"])
        if user is None:
            raise ValidationError({"token": ["This verification link is invalid or has expired."]})
        if user.email_verified_at is None:
            user.email_verified_at = timezone.now()
            user.save(update_fields=["email_verified_at", "updated_at"])
        return Response({"verified": True})


class ResendVerificationView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "verification_resend"

    def post(self, request):
        if request.user.email_verified_at is not None:
            return Response({"verified": True, "sent": False})
        send_verification_email(request.user)
        return Response({"verified": False, "sent": True})


class PasswordResetRequestView(APIView):
    """Always answers the same way, whether or not the address has an account."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=serializer.validated_data["email"], is_active=True).first()
        if user is not None:
            send_password_reset_email(user)
        return Response({"detail": NEUTRAL_RESET_MESSAGE})


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_token"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        user = resolve_reset(v["uid"], v["token"])
        if user is None:
            raise ValidationError({"token": ["This reset link is invalid or has expired."]})
        _check_new_password(v["password"], user)
        user.set_password(v["password"])
        user.save(update_fields=["password", "updated_at"])
        revoke_all_refresh_tokens(user)
        send_password_changed_email(user)
        return Response({"reset": True})


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_change"

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        user = request.user
        if not user.check_password(v["current_password"]):
            raise ValidationError({"current_password": ["Your current password is incorrect."]})
        _check_new_password(v["new_password"], user)
        user.set_password(v["new_password"])
        user.save(update_fields=["password", "updated_at"])
        revoke_all_refresh_tokens(user)  # every device, including this one, signs in again
        send_password_changed_email(user)
        return Response({"changed": True})
