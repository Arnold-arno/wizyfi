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
    # organization permission codes (apps.platform_admin.IsPlatformStaff).
    is_platform_staff = serializers.SerializerMethodField()
    email_verified = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "full_name", "phone", "country", "is_active",
            "is_platform_staff", "email_verified", "created_at",
        ]
        read_only_fields = fields

    def get_is_platform_staff(self, obj):
        staff = getattr(obj, "platform_staff", None)
        return bool(staff and staff.is_active)

    def get_email_verified(self, obj):
        return obj.email_verified_at is not None


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """What a person may edit about themselves. Email, status and platform
    fields are deliberately absent."""

    class Meta:
        model = User
        fields = ["full_name", "phone", "country"]

    def validate_full_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter your name.")
        return value

    def validate_country(self, value):
        value = value.strip().upper()
        if value and (len(value) != 2 or not value.isalpha()):
            raise serializers.ValidationError("Use a two-letter country code, for example UG.")
        return value


class VerifyEmailSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=1024)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=256)
    token = serializers.CharField(max_length=256)
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)


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
