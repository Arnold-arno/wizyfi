# apps/accounts/views.py
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import MeSerializer, RegisterSerializer, WizyfiTokenObtainPairSerializer


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


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)
