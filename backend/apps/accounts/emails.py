# apps/accounts/emails.py
#
# Plain-text transactional email. Failures are logged and swallowed: a broken
# mail server must never make registration or "forgot password" return a 500
# (and, for forgot-password, must never reveal whether the address exists).
# Tokens are never logged.
import logging
from urllib.parse import urlencode

from django.conf import settings
from django.core.mail import send_mail

from .tokens import make_reset_parts, make_verification_token

logger = logging.getLogger(__name__)


def _link(path: str, **params) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}?{urlencode(params)}"


def _send(user, subject: str, body: str) -> bool:
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)
        return True
    except Exception:  # noqa: BLE001
        logger.exception("email.send_failed", extra={"user_id": str(user.pk), "subject": subject})
        return False


def send_verification_email(user) -> bool:
    link = _link("/verify-email", token=make_verification_token(user))
    return _send(
        user,
        "Verify your Wizyfi Bridge email",
        f"Hi {user.full_name},\n\nConfirm this email address to finish setting up your Wizyfi Bridge account:\n\n"
        f"{link}\n\nThe link works for 3 days. If you didn't create an account, you can ignore this email.\n",
    )


def send_password_reset_email(user) -> bool:
    uid, token = make_reset_parts(user)
    link = _link("/reset-password", uid=uid, token=token)
    minutes = int(getattr(settings, "PASSWORD_RESET_TIMEOUT", 3600) // 60)
    return _send(
        user,
        "Reset your Wizyfi Bridge password",
        f"Hi {user.full_name},\n\nUse this link to choose a new password:\n\n{link}\n\n"
        f"It works once and expires in {minutes} minutes. If you didn't ask for this, ignore this email; "
        "your password has not changed.\n",
    )


def send_password_changed_email(user) -> bool:
    return _send(
        user,
        "Your Wizyfi Bridge password was changed",
        f"Hi {user.full_name},\n\nYour password was just changed and you were signed out everywhere. "
        "If this wasn't you, reset your password immediately and contact support.\n",
    )
