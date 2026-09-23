# apps/audit/tests.py
import pytest

from apps.audit.models import ActorType, AuditEvent
from apps.audit.services import record_event


@pytest.mark.django_db
class TestAuditService:
    def test_redacts_sensitive_keys(self, organization):
        event = record_event(
            organization_id=organization.id,
            action="test.action",
            resource_type="Thing",
            resource_id="123",
            metadata={"password": "hunter2", "safe_field": "ok"},
        )
        assert event.metadata["password"] == "«redacted»"
        assert event.metadata["safe_field"] == "ok"

    def test_resource_id_always_stored_as_string(self, organization):
        import uuid

        rid = uuid.uuid4()
        event = record_event(
            organization_id=organization.id, action="x", resource_type="Y", resource_id=rid
        )
        assert event.resource_id == str(rid)


@pytest.mark.django_db
class TestAuditApi:
    def test_read_only_no_create_endpoint(self, auth_client, org_headers):
        resp = auth_client.post(
            "/api/v1/audit-events/", {"action": "fake"}, format="json", **org_headers
        )
        assert resp.status_code in (403, 405)

    def test_no_update_or_delete_endpoint(self, auth_client, organization, org_headers):
        event = AuditEvent.objects.create(
            organization=organization, actor_type=ActorType.SYSTEM,
            action="x", resource_type="Y", resource_id="1",
        )
        patch_resp = auth_client.patch(
            f"/api/v1/audit-events/{event.id}/", {"action": "changed"}, format="json", **org_headers
        )
        delete_resp = auth_client.delete(f"/api/v1/audit-events/{event.id}/", **org_headers)
        assert patch_resp.status_code in (403, 405)
        assert delete_resp.status_code in (403, 405)

    def test_agent_cannot_view_audit_log(self, agent_client, agent_membership, organization, org_headers):
        AuditEvent.objects.create(
            organization=organization, actor_type=ActorType.SYSTEM,
            action="x", resource_type="Y", resource_id="1",
        )
        resp = agent_client.get("/api/v1/audit-events/", **org_headers)
        assert resp.status_code == 403

    def test_tenant_isolation(self, auth_client, organization, other_org_headers):
        AuditEvent.objects.create(
            organization=organization, actor_type=ActorType.SYSTEM,
            action="x", resource_type="Y", resource_id="1",
        )
        resp = auth_client.get("/api/v1/audit-events/", **other_org_headers)
        assert resp.status_code == 403  # no membership in that org at all


@pytest.mark.django_db
class TestAuditWiring:
    """Confirms domain services actually produce audit events, not just
    that the audit app works in isolation."""

    def test_hard_logout_schedule_produces_audit_event(self, place, user):
        from django.utils import timezone

        from apps.access.services import schedule_hard_logout_event

        schedule_hard_logout_event(
            place=place, scope_type="PLACE", router_ids=[],
            scheduled_at=timezone.now() + timezone.timedelta(minutes=5),
            scheduled_timezone="UTC", created_by=user,
        )
        assert AuditEvent.objects.filter(action="hard_logout.scheduled").exists()

    def test_voucher_revoke_produces_audit_event(self, access_plan, user):
        from apps.access.codes import generate_code, hash_code, last4_of
        from apps.access.models import Voucher
        from apps.access.services import revoke_voucher

        code = generate_code()
        voucher = Voucher.objects.create(
            plan=access_plan, code_hash=hash_code(code), code_last4=last4_of(code), status="AVAILABLE"
        )
        revoke_voucher(voucher, actor=user)
        event = AuditEvent.objects.get(action="voucher.revoked")
        assert event.actor_id == user.id
        assert event.actor_type == ActorType.STAFF
        # The masked code, not the plaintext, ends up in metadata.
        assert code not in str(event.metadata)
