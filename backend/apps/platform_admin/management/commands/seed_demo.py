# apps/platform_admin/management/commands/seed_demo.py
#
#   python manage.py seed_demo [--password ...] [--force]
#
# Creates DEMO data for local development and walkthroughs: one platform admin,
# three client organizations (each with owner / admin / agent / read-only users),
# and per client a place, router, access plans, vouchers, customers, live
# sessions, sales and a daily reset.
#
# Safety:
#  * refuses to run unless DEBUG is on (or --force), so it can never quietly
#    put well-known passwords into a production database;
#  * idempotent: an existing user / organization is left untouched, and a client
#    organization that already exists is not re-populated;
#  * every client is named "... (demo)" and every user lives on demo.wizyfi.test
#    (a reserved, undeliverable domain), so demo rows are obvious in any list;
#  * to start over, recreate the dev database or run `manage.py flush`.
#
# The router is a stub endpoint (192.0.2.x, RFC 5737 documentation range): no
# real device is contacted.
import os
from datetime import time, timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.access.models import AccessPlan
from apps.access.recurring import create_recurring_reset
from apps.access.services import create_voucher_batch, start_session
from apps.commercial.models import Sale
from apps.commercial.services import record_sale
from apps.connectors.models import Connector, Router
from apps.customers.models import Customer
from apps.organizations.models import Membership, Organization, Role
from apps.places.models import Place

from apps.platform_admin.models import OrganizationSubscription, Plan, PlatformRole, PlatformStaff

DEMO_DOMAIN = "demo.wizyfi.test"
DEFAULT_PASSWORD = "Demo-Passw0rd!26"  # dev only; meets the 12+ letter/number/special policy

CLIENTS = [
    {"slug": "lakeview", "name": "Lakeview Café (demo)", "place": "Lakeview Café", "address": "Plot 12, Lake Road, Kampala", "plan": "Starter"},
    {"slug": "savannah", "name": "Savannah Guest House (demo)", "place": "Savannah Guest House", "address": "Ntinda, Kampala", "plan": "Business"},
    {"slug": "campus", "name": "Campus Connect (demo)", "place": "Campus Connect — Library", "address": "Main campus, Kampala", "plan": "Pro"},
]

ROLE_LOCAL = {Role.OWNER: "owner", Role.ADMIN: "admin", Role.AGENT: "agent", Role.READ_ONLY: "readonly"}

# (name, price UGX, minutes, status, extras)
ACCESS_PLANS = [
    ("1 hour", "1000", 60, "ACTIVE", {}),
    ("Half day", "3000", 720, "ACTIVE", {}),
    ("Full day", "5000", 1440, "ACTIVE", {"max_concurrent_devices": 2}),
    ("Until next reset", "2000", 600, "ACTIVE", {"validity_mode": "UNTIL_NEXT_RESET"}),
    ("Weekly (draft)", "25000", 10080, "DRAFT", {}),
]

# Platform billing plans: (name, max_places, price). Other columns only if the model has them.
PLATFORM_PLANS = [("Starter", 1, "9.00"), ("Business", 5, "29.00"), ("Pro", None, "79.00")]


def _has(model, field):
    return any(f.name == field for f in model._meta.get_fields())


class Command(BaseCommand):
    help = "Create demo accounts and data (platform admin + 3 clients). Development only."

    def add_arguments(self, parser):
        parser.add_argument("--password", help="Password for every demo account (default: $DEMO_PASSWORD or a built-in dev one).")
        parser.add_argument("--force", action="store_true", help="Run even though DEBUG is off. Never use on production.")

    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts["force"]:
            raise CommandError("Refusing to create demo accounts while DEBUG is off. This command is for development databases.")
        password = opts["password"] or os.environ.get("DEMO_PASSWORD") or DEFAULT_PASSWORD
        try:
            validate_password(password)
        except DjangoValidationError as exc:
            raise CommandError("Demo password rejected by the password policy: " + " ".join(exc.messages))

        self.User = get_user_model()
        self.password = password
        self.rows = []  # (role, email, organization)
        self.samples = []  # (organization, plan name, [codes])

        with transaction.atomic():
            admin = self._user("admin", "Platform Admin")
            PlatformStaff.objects.get_or_create(user=admin, defaults={"role": PlatformRole.SUPERADMIN})
            self.rows.append(("Platform admin", admin.email, "— (Super Admin portal)"))
            platform_plans = self._platform_plans()
            for client in CLIENTS:
                self._client(client, platform_plans)

        self._report()

    # ---- helpers -----------------------------------------------------------------
    def _user(self, local, full_name):
        email = f"{local}@{DEMO_DOMAIN}"
        user = self.User.objects.filter(email=email).first()
        if user:
            return user
        return self.User.objects.create_user(email, self.password, full_name=full_name, email_verified_at=timezone.now())

    def _platform_plans(self):
        extras_by_name = {"Starter": 2, "Business": 10, "Pro": None}
        out = {}
        for name, max_places, price in PLATFORM_PLANS:
            extras = {
                "max_networks": extras_by_name[name],
                "allowed_vendors": ["MIKROTIK", "WIZYFI"],
                "currency": "USD",
                "description": f"{name} plan (demo)",
            }
            defaults = {"max_places": max_places, "price": Decimal(price), "status": "ACTIVE"}
            defaults.update({k: v for k, v in extras.items() if _has(Plan, k)})  # tolerate older Plan models
            out[name], _ = Plan.objects.get_or_create(name=name, defaults=defaults)
        return out

    def _client(self, c, platform_plans):
        org, created = Organization.objects.get_or_create(name=c["name"])
        owner = None
        for role, local in ROLE_LOCAL.items():
            user = self._user_for(c, role, local)
            Membership.objects.get_or_create(user=user, organization=org, defaults={"role": role})
            self.rows.append((role.label, user.email, org.name))
            if role == Role.OWNER:
                owner = user
        if not created:
            return
        OrganizationSubscription.objects.get_or_create(organization=org, defaults={"plan": platform_plans[c["plan"]]})
        self.User.objects.filter(pk=owner.pk).update(last_login=timezone.now() - timedelta(hours=3))

        now = timezone.now()
        place = Place.objects.create(organization=org, name=c["place"], address=c["address"], timezone="Africa/Kampala", status="ACTIVE")
        connector = Connector(place=place, vendor_code="MIKROTIK", name="Demo MikroTik", status="VERIFIED", last_verified_at=now)
        connector.set_credentials({"username": "demo", "password": "demo-only"})
        connector.save()
        router = Router.objects.create(place=place, connector=connector, name="Router 1", identity="192.0.2.10", status="ONLINE", last_seen_at=now)

        plans = {}
        for name, price, minutes, status, extras in ACCESS_PLANS:
            plans[name] = AccessPlan.objects.create(
                organization=org, name=name, price=price, currency="UGX", duration_minutes=minutes, status=status, **extras
            )

        batch = create_voucher_batch(organization_id=org.id, plan_id=str(plans["1 hour"].id), quantity=10)
        self.samples.append((org.name, "1 hour", batch["codes"][:3]))

        customers = [
            Customer.objects.create(
                organization=org, full_name=name, phone=f"+25670000{i:04d}", mac_address=f"02:00:5E:00:{i:02X}:{i + 16:02X}"
            )
            for i, name in enumerate(["Amina K.", "Brian O.", "Carol N.", "David M.", "Esther A."], start=1)
        ]
        for customer, plan in zip(customers[:3], ("1 hour", "Half day", "Full day")):
            start_session(customer=customer, router=router, place=place, access_plan=plans[plan])

        paid = [plans["1 hour"], plans["Half day"], plans["Full day"]]
        for i in range(8):
            plan = paid[i % 3]
            sale = record_sale(
                organization_id=org.id, total=Decimal(plan.price), currency="UGX", place=place,
                customer=customers[i % 5], access_plan=plan, payment_reference=f"demo-{i + 1:03d}",
            )
            Sale.objects.filter(pk=sale.pk).update(sold_at=now - timedelta(days=i % 6, hours=i))

        # A daily reset, so "Until next reset" has a scheduled reset to end at.
        create_recurring_reset(place=place, scope_type="PLACE", router_ids=[], time_of_day=time(0, 0), weekdays=[], created_by=owner)

    def _user_for(self, c, role, local):
        email = f"{local}@{c['slug']}.{DEMO_DOMAIN}"
        user = self.User.objects.filter(email=email).first()
        if user:
            return user
        return self.User.objects.create_user(
            email, self.password, full_name=f"{c['place']} {role.label}", email_verified_at=timezone.now()
        )

    def _report(self):
        w = self.stdout.write
        w(self.style.SUCCESS("\nDemo data ready. Every account uses the same password."))
        w(f"Password: {self.password}\n")
        w(f"{'Role':<16}{'Email':<46}Organization")
        for role, email, org in self.rows:
            w(f"{role:<16}{email:<46}{org}")
        for org, plan, codes in self.samples:
            w(f"\nSample '{plan}' vouchers for {org} (shown once; test them on the portal): {', '.join(codes)}")
        w("\nSign in at /sign-in. Platform admin lands on /admin; clients land on /app/dashboard.")
