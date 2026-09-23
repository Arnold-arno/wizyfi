# apps/connectors/urls.py
from rest_framework.routers import DefaultRouter

from .views import ConnectorViewSet, RouterViewSet

router = DefaultRouter()
router.register("connectors", ConnectorViewSet, basename="connector")
router.register("routers", RouterViewSet, basename="router")

urlpatterns = router.urls
