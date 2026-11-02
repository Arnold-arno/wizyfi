# apps/accounts/tokens.py
#
# Email verification: a signed, time-limited token that embeds the address it
# verifies, so it stops working if the address changes. Verifying twice is
# harmless (idempotent).
# Password reset: Django's token generator. Its hash includes the current
# password hash and last_login, so a reset link is SINGLE-USE (it stops working
# the moment the password changes) and expires after PASSWORD_RESET_TIMEOUT.
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

VERIFY_SALT = "wizyfi.email-verification"
VERIFY_MAX_AGE_SECONDS = 3 * 24 * 3600


def make_verification_token(user) -> str:
    return signing.dumps({"u": str(user.pk), "e": user.email}, salt=VERIFY_SALT)


def read_verification_token(token: str):
    """Returns the User the token verifies, or None if bad/expired/stale."""
    try:
        data = signing.loads(token, salt=VERIFY_SALT, max_age=VERIFY_MAX_AGE_SECONDS)
    except signing.BadSignature:  # includes SignatureExpired
        return None
    User = get_user_model()
    try:
        return User.objects.filter(pk=data["u"], email=data["e"], is_active=True).first()
    except (ValueError, KeyError, TypeError):
        return None


def make_reset_parts(user) -> tuple[str, str]:
    return urlsafe_base64_encode(force_bytes(str(user.pk))), default_token_generator.make_token(user)


def resolve_reset(uid: str, token: str):
    User = get_user_model()
    try:
        pk = force_str(urlsafe_base64_decode(uid))
        user = User.objects.filter(pk=pk, is_active=True).first()
    except (ValueError, TypeError, OverflowError, UnicodeDecodeError):
        return None
    if user is None or not default_token_generator.check_token(user, token):
        return None
    return user
