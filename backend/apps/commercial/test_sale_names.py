# apps/commercial/test_sale_names.py
from decimal import Decimal

import pytest

from apps.commercial.services import record_sale


@pytest.mark.django_db
class TestSaleReadableNames:
    def test_place_and_plan_names_present(self, auth_client, org_headers, organization, place, access_plan):
        record_sale(
            organization_id=organization.id, total=Decimal("1000.00"),
            place=place, access_plan=access_plan,
        )
        row = auth_client.get("/api/v1/sales/", **org_headers).json()["results"][0]
        assert row["placeName"] == "Test Place"
        assert row["accessPlanName"] == "Test Plan"

    def test_null_when_sale_has_no_place_or_plan(self, auth_client, org_headers, organization):
        record_sale(organization_id=organization.id, total=Decimal("1000.00"))
        row = auth_client.get("/api/v1/sales/", **org_headers).json()["results"][0]
        assert row["placeName"] is None
        assert row["accessPlanName"] is None

    def test_customer_details_never_expanded(self, auth_client, org_headers, organization):
        from apps.customers.models import Customer

        c = Customer.objects.create(organization=organization, full_name="Jane Real Name", phone="+256700000123")
        record_sale(organization_id=organization.id, total=Decimal("100.00"), customer=c)
        body = str(auth_client.get("/api/v1/sales/", **org_headers).json())
        assert "Jane Real Name" not in body
        assert "+256700000123" not in body
