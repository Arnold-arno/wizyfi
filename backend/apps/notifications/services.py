# apps/notifications/services.py

from .models import Notification, NotificationLevel


def notify(
    *, organization_id, level: str, title: str, message: str = "",
    recipient=None, resource_type: str = "", resource_id="",
) -> Notification:
    return Notification.objects.create(
        organization_id=organization_id,
        recipient=recipient,
        level=level,
        title=title,
        message=message,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else "",
    )
