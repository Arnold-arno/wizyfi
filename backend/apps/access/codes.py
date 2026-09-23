# apps/access/codes.py
#
# doc08: "Credential-like voucher secrets should be stored as hashes when
# plaintext recovery is not required." Voucher codes are generated once,
# shown to the operator once (VoucherBatchResult), and never recoverable
# afterward — only a keyed hash and a last-4 fragment (for masked display)
# are persisted.

import hashlib
import hmac
import secrets

from django.conf import settings

# Excludes visually ambiguous characters (0/O, 1/I/L) — these are read
# off a screen and typed into a captive portal form by an end user.
_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def generate_code() -> str:
    body = "".join(secrets.choice(_ALPHABET) for _ in range(8))
    return f"{body[:4]}-{body[4:]}"


def hash_code(code: str) -> str:
    # Keyed hash (HMAC, not bare SHA-256) so a leaked DB dump alone isn't
    # enough to brute-force codes offline against the known small
    # alphabet/length — the pepper is the app's own secret key.
    return hmac.new(
        settings.SECRET_KEY.encode(), code.encode(), hashlib.sha256
    ).hexdigest()


def last4_of(code: str) -> str:
    """Captured once, at generation time, alongside the hash — this is
    the only fragment of the code ever persisted in the clear."""
    return code.replace("-", "")[-4:]


def format_masked(last4: str) -> str:
    """Used everywhere *after* generation, from the stored last4 —
    nothing here ever has access to the original plaintext code again."""
    return f"••••-{last4}"
