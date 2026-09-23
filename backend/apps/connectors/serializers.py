# apps/connectors/serializers.py
from rest_framework import serializers

from .models import Connector, Router


class ConnectorSerializer(serializers.ModelSerializer):
    # write-only, structured input; never rendered back out in any
    # response — doc11 "Secret leakage" control.
    credentials = serializers.DictField(write_only=True, required=True)

    class Meta:
        model = Connector
        fields = [
            "id", "place", "vendor_code", "name", "credentials",
            "status", "last_verified_at", "created_at",
        ]
        read_only_fields = ["id", "status", "last_verified_at", "created_at"]

    def create(self, validated_data):
        credentials = validated_data.pop("credentials")
        connector = Connector(**validated_data)
        connector.set_credentials(credentials)
        connector.save()
        return connector

    def update(self, instance, validated_data):
        credentials = validated_data.pop("credentials", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if credentials is not None:
            instance.set_credentials(credentials)
        instance.save()
        return instance


class RouterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Router
        fields = [
            "id", "place", "connector", "name", "identity",
            "status", "last_seen_at", "capabilities", "created_at",
        ]
        read_only_fields = ["id", "status", "last_seen_at", "created_at"]


class HealthCheckResultSerializer(serializers.Serializer):
    healthy = serializers.BooleanField()
    latency_ms = serializers.IntegerField(allow_null=True)
    checked_at = serializers.DateTimeField()
    detail = serializers.CharField()


class DisconnectResultSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    error_code = serializers.CharField(allow_null=True)
    error_message = serializers.CharField()
