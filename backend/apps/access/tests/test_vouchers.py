# apps/access/tests/test_vouchers.py
import pytest

from apps.access.models import Voucher
from apps.access.services import redeem_voucher, revoke_voucher
from apps.common.exceptions import ConflictError


@pytest.mark.django_db
class TestVoucherBatchIdempotency:
    def test_requires_idempotency_key(self, auth_client, access_plan, org_headers):
        resp = auth_client.post(
            "/api/v1/vouchers/batches/",
            {"planId": str(access_plan.id), "quantity": 3},
            format="json", **org_headers,
        )
        assert resp.status_code == 400

    def test_creates_requested_quantity(self, auth_client, access_plan, org_headers):
        resp = auth_client.post(
            "/api/v1/vouchers/batches/",
            {"planId": str(access_plan.id), "quantity": 3},
            format="json", HTTP_IDEMPOTENCY_KEY="batch-1", **org_headers,
        )
        assert resp.status_code == 201
        assert len(resp.data["codes"]) == 3
        assert Voucher.objects.count() == 3

    def test_replay_same_key_same_body_returns_identical_codes_no_duplicates(
        self, auth_client, access_plan, org_headers
    ):
        payload = {"planId": str(access_plan.id), "quantity": 2}
        first = auth_client.post(
            "/api/v1/vouchers/batches/", payload, format="json",
            HTTP_IDEMPOTENCY_KEY="replay-key", **org_headers,
        )
        second = auth_client.post(
            "/api/v1/vouchers/batches/", payload, format="json",
            HTTP_IDEMPOTENCY_KEY="replay-key", **org_headers,
        )
        assert second.status_code == 201
        assert second.data["codes"] == first.data["codes"]
        assert Voucher.objects.count() == 2  # not 4 — no duplicate generation

    def test_same_key_different_body_conflicts(self, auth_client, access_plan, org_headers):
        auth_client.post(
            "/api/v1/vouchers/batches/", {"planId": str(access_plan.id), "quantity": 2},
            format="json", HTTP_IDEMPOTENCY_KEY="dup-key", **org_headers,
        )
        resp = auth_client.post(
            "/api/v1/vouchers/batches/", {"planId": str(access_plan.id), "quantity": 99},
            format="json", HTTP_IDEMPOTENCY_KEY="dup-key", **org_headers,
        )
        assert resp.status_code == 409
        assert resp.data["code"] == "IDEMPOTENCY_CONFLICT"

    def test_nonexistent_plan_gives_clean_error_not_500(self, auth_client, org_headers):
        fake_id = "00000000-0000-0000-0000-000000000099"
        resp = auth_client.post(
            "/api/v1/vouchers/batches/", {"planId": fake_id, "quantity": 1},
            format="json", HTTP_IDEMPOTENCY_KEY="bad-plan", **org_headers,
        )
        assert resp.status_code == 400
        # Regression check for the character-by-character ValidationError bug.
        assert isinstance(resp.data["fieldErrors"]["detail"], list)
        assert len(resp.data["fieldErrors"]["detail"]) == 1

    def test_masked_code_never_exposes_plaintext_or_hash(self, auth_client, access_plan, org_headers):
        resp = auth_client.post(
            "/api/v1/vouchers/batches/", {"planId": str(access_plan.id), "quantity": 1},
            format="json", HTTP_IDEMPOTENCY_KEY="mask-check", **org_headers,
        )
        code = resp.data["codes"][0]
        list_resp = auth_client.get("/api/v1/vouchers/", **org_headers)
        body = str(list_resp.data)
        assert code not in body
        voucher = Voucher.objects.get()
        assert voucher.code_hash not in body


@pytest.mark.django_db
class TestVoucherLifecycle:
    """Direct service-layer tests — this is where the double-redemption
    fix and revoke rules actually live."""

    def _make_voucher(self, plan):
        from apps.access.codes import generate_code, hash_code, last4_of

        code = generate_code()
        v = Voucher.objects.create(
            plan=plan, code_hash=hash_code(code), code_last4=last4_of(code), status="AVAILABLE"
        )
        return v, code

    def test_redeem_creates_voucher_only_customer(self, access_plan, organization):
        voucher, code = self._make_voucher(access_plan)
        result = redeem_voucher(organization_id=organization.id, code=code, mac_address="AA:BB:CC:11:11:11")
        assert result.status == "REDEEMED"
        assert result.redeemed_by_customer.mac_address == "AA:BB:CC:11:11:11"

    def test_double_redemption_rejected(self, access_plan, organization):
        voucher, code = self._make_voucher(access_plan)
        redeem_voucher(organization_id=organization.id, code=code, mac_address="AA:BB:CC:11:11:11")
        with pytest.raises(ConflictError):
            redeem_voucher(organization_id=organization.id, code=code, mac_address="AA:BB:CC:22:22:22")

    def test_invalid_code_rejected_cleanly(self, access_plan, organization):
        with pytest.raises(ConflictError):
            redeem_voucher(organization_id=organization.id, code="ZZZZ-ZZZZ", mac_address="AA:BB:CC:33:33:33")

    def test_revoke_available_voucher_succeeds(self, access_plan):
        voucher, _ = self._make_voucher(access_plan)
        revoked = revoke_voucher(voucher)
        assert revoked.status == "REVOKED"

    def test_revoke_redeemed_voucher_rejected(self, access_plan, organization):
        voucher, code = self._make_voucher(access_plan)
        redeem_voucher(organization_id=organization.id, code=code, mac_address="AA:BB:CC:44:44:44")
        with pytest.raises(ConflictError):
            revoke_voucher(voucher)

    def test_redeem_revoked_voucher_rejected(self, access_plan):
        voucher, code = self._make_voucher(access_plan)
        revoke_voucher(voucher)
        with pytest.raises(ConflictError):
            redeem_voucher(organization_id=access_plan.organization_id, code=code, mac_address="AA:BB:CC:55:55:55")

    def test_redeem_expired_voucher_rejected(self, access_plan, organization):
        from django.utils import timezone

        voucher, code = self._make_voucher(access_plan)
        voucher.expires_at = timezone.now() - timezone.timedelta(days=1)
        voucher.save()
        with pytest.raises(ConflictError):
            redeem_voucher(organization_id=organization.id, code=code, mac_address="AA:BB:CC:66:66:66")
        voucher.refresh_from_db()
        assert voucher.status == "EXPIRED"  # side effect: lazily marked expired
