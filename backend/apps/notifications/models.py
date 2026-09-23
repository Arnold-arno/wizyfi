# apps/notifications/models.py
#
# doc01 FR-014: "System communicates important success, warning, failure
# and operational conditions." recipient=None means an org-wide broadcast
# (e.g. a Hard Logout event reaching a terminal state) rather than
# something scoped to one person.

from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.organizations.models import Organization


class NotificationLevel(models.TextChoices):
    INFO = "INFO", "Info"
    SUCCESS = "SUCCESS", "Success"
    WARNING = "WARNING", "Warning"
    ERROR = "ERROR", "Error"
    CRITICAL = "CRITICAL", "Critical"


class Notification(BaseModel):
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="notifications"
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True,
        related_name="notifications",
        help_text="Null means an org-wide broadcast rather than one person.",
    )
    level = models.CharField(max_length=20, choices=NotificationLevel.choices)
    title = models.CharField(max_length=255)
    message = models.CharField(max_length=1000, blank=True)
    resource_type = models.CharField(max_length=100, blank=True)
    resource_id = models.CharField(max_length=64, blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notifications_notification"
        indexes = [
            models.Index(fields=["organization", "recipient", "is_read"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return self.title
