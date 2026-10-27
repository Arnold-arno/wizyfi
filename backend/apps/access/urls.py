# apps/access/urls.py
# CHANGED (Round 17): registers /recurring-resets/.
from rest_framework.routers import DefaultRouter

from .recurring_views import RecurringResetViewSet
from .views import (
    AccessPlanViewSet,
    HardLogoutEventViewSet,
    NetworkCycleViewSet,
    SessionViewSet,
    VoucherViewSet,
)

router = DefaultRouter()
router.register("access-plans", AccessPlanViewSet, basename="access-plan")
router.register("vouchers", VoucherViewSet, basename="voucher")
router.register("network-cycles", NetworkCycleViewSet, basename="network-cycle")
router.register("sessions", SessionViewSet, basename="session")
router.register("hard-logout-events", HardLogoutEventViewSet, basename="hard-logout-event")
router.register("recurring-resets", RecurringResetViewSet, basename="recurring-reset")

urlpatterns = router.urls
