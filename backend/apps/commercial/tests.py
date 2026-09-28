# apps/commercial/tests.py
from decimal import Decimal

import pytest

from apps.commercial.models import Sale, Transaction
from apps.commercial.services import record_sale, refund_sale
from apps.common.exceptions import ConflictError


@pytest.mark.django_db
class TestRecordSale:
    def test_creates_sale_and_backing_transaction_together(self, organization):
        sale = record_sale(
            organization_id=organization.id, total=Decimal("5000.00"), payment_reference="cash"
        )
        assert Sale.objects.count() == 1
        assert Transaction.objects.count() == 1
        sale.refresh_from_db()
        txn = Transaction.objects.get()
        assert txn.sale_id == sale.id
        assert txn.amount == sale.total
        assert txn.status == "SUCCEEDED"

    def test_no_orphan_transaction_ever(self, organization):
        """A Transaction must never exist without a Sale, and a
        completed Sale must never exist without a backing Transaction —
        record_sale is the only path that creates either."""
        record_sale(organization_id=organization.id, total=Decimal("1000.00"))
        for txn in Transaction.objects.all():
            assert txn.sale_id is not None


@pytest.mark.django_db
class TestRefund:
    def test_refund_completed_sale(self, organization):
        sale = record_sale(organization_id=organization.id, total=Decimal("2000.00"))
        refunded = refund_sale(sale)
        assert refunded.status == "REFUNDED"
        assert Transaction.objects.filter(sale=sale, status="REFUNDED").exists()

    def test_refund_already_refunded_sale_rejected(self, organization):
        sale = record_sale(organization_id=organization.id, total=Decimal("2000.00"))
        refund_sale(sale)
        with pytest.raises(ConflictError):
            refund_sale(sale)


@pytest.mark.django_db
class TestSaleApi:
    def test_create_sale_via_api(self, auth_client, org_headers):
        resp = auth_client.post(
            "/api/v1/sales/", {"total": "1500.00", "paymentReference": "mtn-momo-123"},
            format="json", **org_headers,
        )
        assert resp.status_code == 201
        assert resp.data["status"] == "COMPLETED"

    def test_agent_can_create_but_not_view_transactions_ledger_is_still_gated_correctly(
        self, agent_client, agent_membership, org_headers
    ):
        # AGENT has sales:create but not transactions:view — confirms the
        # two permission codes are genuinely independent, not aliased.
        create_resp = agent_client.post(
            "/api/v1/sales/", {"total": "500.00"}, format="json", **org_headers
        )
        assert create_resp.status_code == 201
        txn_resp = agent_client.get("/api/v1/transactions/", **org_headers)
        assert txn_resp.status_code == 403

    def test_negative_total_rejected(self, auth_client, org_headers):
        resp = auth_client.post(
            "/api/v1/sales/", {"total": "-10.00"}, format="json", **org_headers
        )
        assert resp.status_code == 400

    def test_tenant_isolation(self, auth_client, organization, other_org_headers):
        record_sale(organization_id=organization.id, total=Decimal("100.00"))
        resp = auth_client.get("/api/v1/sales/", **other_org_headers)
        assert resp.status_code == 403

    def test_summary_aggregates_correctly(self, auth_client, organization, org_headers):
        record_sale(organization_id=organization.id, total=Decimal("1000.00"))
        record_sale(organization_id=organization.id, total=Decimal("2000.00"))
        sale3 = record_sale(organization_id=organization.id, total=Decimal("500.00"))
        refund_sale(sale3)

        resp = auth_client.get("/api/v1/sales/summary/", **org_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["totalSales"] == 3
        assert float(body["totalRevenue"]) == 3000.00  # excludes the refunded one
        assert body["refundedCount"] == 1


@pytest.mark.django_db
class TestTransactionApi:
    def test_read_only_no_create_endpoint(self, auth_client, org_headers):
        resp = auth_client.post("/api/v1/transactions/", {"amount": "100"}, format="json", **org_headers)
        assert resp.status_code == 403  # deny-by-default, no create in the permission map

    def test_transactions_visible_to_read_only_role(self, organization):
        from apps.accounts.models import User
        from apps.organizations.models import Membership, Role
        from rest_framework.test import APIClient

        record_sale(organization_id=organization.id, total=Decimal("750.00"))
        u = User.objects.create_user(email="ro2@example.com", password="x", full_name="RO2")
        Membership.objects.create(user=u, organization=organization, role=Role.READ_ONLY)
        client = APIClient()
        client.force_authenticate(user=u)
        resp = client.get(
            "/api/v1/transactions/", HTTP_X_ORGANIZATION_ID=str(organization.id)
        )
        assert resp.status_code == 200
        assert resp.data["count"] == 1
