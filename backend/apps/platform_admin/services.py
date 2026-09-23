# apps/platform_admin/services.py
from django.db import transaction

from apps.common.exceptions import ConflictError
from apps.organizations.models import Organization

from .models import OrganizationSubscription, Plan, PlatformActivityEvent


def _record_activity(organization, actor, action, message):
    PlatformActivityEvent.objects.create(
        organization=organization, actor=actor, action=action, message=message
    )


@transaction.atomic
def suspend_agent(organization: Organization, *, actor, reason: str = "") -> Organization:
    organization = Organization.objects.select_for_update().get(id=organization.id)
    if organization.status == "SUSPENDED":
        raise ConflictError("This organization is already suspended.")
    organization.status = "SUSPENDED"
    organization.save(update_fields=["status", "updated_at"])
    _record_activity(
        organization, actor, "agent.suspended",
        f"Organization suspended.{' Reason: ' + reason if reason else ''}",
    )
    return organization


@transaction.atomic
def restore_agent(organization: Organization, *, actor) -> Organization:
    organization = Organization.objects.select_for_update().get(id=organization.id)
    if organization.status == "ACTIVE":
        raise ConflictError("This organization is already active.")
    organization.status = "ACTIVE"
    organization.save(update_fields=["status", "updated_at"])
    _record_activity(organization, actor, "agent.restored", "Organization restored to active.")
    return organization


@transaction.atomic
def change_agent_plan(organization: Organization, *, plan: Plan, actor) -> OrganizationSubscription:
    subscription, created = OrganizationSubscription.objects.select_for_update().get_or_create(
        organization=organization, defaults={"plan": plan, "changed_by": actor}
    )
    if not created:
        subscription.plan = plan
        subscription.changed_by = actor
        subscription.save(update_fields=["plan", "changed_by", "updated_at"])

    _record_activity(
        organization, actor, "agent.plan_changed", f"Plan changed to {plan.name}."
    )
    return subscription
