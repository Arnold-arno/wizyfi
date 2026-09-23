# apps/access/urls.py
from rest_framework.routers import DefaultRouter

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

urlpatterns = router.urls
