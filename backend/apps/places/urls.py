# apps/places/urls.py
from rest_framework.routers import DefaultRouter

from .views import PlaceViewSet

router = DefaultRouter()
router.register("", PlaceViewSet, basename="place")

urlpatterns = router.urls
