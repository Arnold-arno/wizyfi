# apps/audit/serializers.py
from rest_framework import serializers

from .models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True, default=None)

    class Meta:
        model = AuditEvent
        fields = [
            "id", "actor_type", "actor", "actor_email", "action",
            "resource_type", "resource_id", "metadata", "created_at",
        ]
        read_only_fields = fields
