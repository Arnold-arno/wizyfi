# apps/accounts/serializers.py
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "password"]
        read_only_fields = ["id"]

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class MeSerializer(serializers.ModelSerializer):
    # Platform-admin access is a completely separate privilege track from
    # organization permission codes (apps.platform_admin.IsPlatformStaff)
    # — there is no "platform_admin:access" permission code anywhere in
    # this backend. This field is the actual, real signal the frontend
    # should check before showing a Super Admin entry point.
    is_platform_staff = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "is_active", "is_platform_staff", "created_at"]
        read_only_fields = fields

    def get_is_platform_staff(self, obj):
        staff = getattr(obj, "platform_staff", None)
        return bool(staff and staff.is_active)


class WizyfiTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds non-sensitive identity claims to the JWT. Never embed
    permission codes or org membership in the token itself — those are
    resolved fresh, server-side, on every request (doc07)."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["email"] = user.email
        token["full_name"] = user.full_name
        return token
