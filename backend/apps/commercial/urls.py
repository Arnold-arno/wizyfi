# apps/commercial/urls.py
from rest_framework.routers import DefaultRouter

from .views import SaleViewSet, TransactionViewSet

router = DefaultRouter()
router.register("sales", SaleViewSet, basename="sale")
router.register("transactions", TransactionViewSet, basename="transaction")

urlpatterns = router.urls
