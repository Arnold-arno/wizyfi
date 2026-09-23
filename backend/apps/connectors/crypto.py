# apps/connectors/crypto.py
#
# Fernet-encrypted connector credentials (Expectations_and_workflow).
# The key lives only in settings/env (CONNECTOR_CREDENTIALS_FERNET_KEY),
# never in the database or source control (doc11: secret leakage control).

import json

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _fernet() -> Fernet:
    return Fernet(settings.CONNECTOR_CREDENTIALS_FERNET_KEY.encode()
                  if isinstance(settings.CONNECTOR_CREDENTIALS_FERNET_KEY, str)
                  else settings.CONNECTOR_CREDENTIALS_FERNET_KEY)


def encrypt_credentials(credentials: dict) -> bytes:
    payload = json.dumps(credentials).encode("utf-8")
    return _fernet().encrypt(payload)


def decrypt_credentials(token: bytes) -> dict:
    try:
        payload = _fernet().decrypt(bytes(token))
    except InvalidToken as exc:
        raise ValueError("Connector credentials could not be decrypted.") from exc
    return json.loads(payload.decode("utf-8"))
