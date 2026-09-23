# apps/places/serializers.py
from rest_framework import serializers

from .models import Place


class PlaceSerializer(serializers.ModelSerializer):
    # NOTE: doc04's Places list needs a router count and active-connection
    # count column. Add those as annotated/read-only fields once the
    # Router model (apps.connectors / apps.devices, next round) exists —
    # deliberately not stubbed here to avoid a fake FK relation.

    class Meta:
        model = Place
        fields = ["id", "name", "timezone", "address", "status", "created_at", "updated_at"]
        read_only_fields = ["id", "status", "created_at", "updated_at"]
