# apps/commercial/services.py
from django.db import transaction
from django.utils import timezone

from .models import Sale, Transaction


@transaction.atomic
def record_sale(
    *, organization_id, total, currency="UGX", place=None, customer=None,
    access_plan=None, voucher=None, payment_reference: str = "",
) -> Sale:
    """One staff-facing action, one Sale, one Transaction — created
    together so a Sale never exists without evidentiary backing. This is
    a distinct event from voucher redemption (apps.access.services.
    redeem_voucher): redemption is claiming access already paid for;
    this is recording that a payment actually happened."""

    sale = Sale.objects.create(
        organization_id=organization_id,
        place=place,
        customer=customer,
        access_plan=access_plan,
        voucher=voucher,
        total=total,
        currency=currency,
        status="COMPLETED",
        sold_at=timezone.now(),
    )
    Transaction.objects.create(
        sale=sale, amount=total, currency=currency, status="SUCCEEDED",
        reference=payment_reference,
    )
    return sale


@transaction.atomic
def refund_sale(sale: Sale) -> Sale:
    from apps.common.exceptions import ConflictError

    sale = Sale.objects.select_for_update().get(id=sale.id)
    if sale.status != "COMPLETED":
        raise ConflictError(f"A sale in {sale.status} status cannot be refunded.")
    sale.status = "REFUNDED"
    sale.save(update_fields=["status", "updated_at"])
    Transaction.objects.create(
        sale=sale, amount=sale.total, currency=sale.currency, status="REFUNDED",
        reference="refund",
    )
    return sale
