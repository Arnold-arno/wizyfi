# apps/connectors/test_wizyfi_adapter.py
from apps.connectors.adapters.registry import VENDOR_CHOICES, get_adapter_class


def _adapter(creds):
    return get_adapter_class("WIZYFI")(host="10.0.0.1", credentials=creds)


def test_wizyfi_registered_as_vendor_option():
    assert ("WIZYFI", "Wizyfi") in VENDOR_CHOICES
    assert ("MIKROTIK", "Mikrotik") in VENDOR_CHOICES


def test_health_check_needs_api_key():
    assert _adapter({"api_key": "k"}).health_check().healthy is True
    assert _adapter({}).health_check().healthy is False


def test_disconnect_requires_identifier_and_is_otherwise_ok():
    a = _adapter({"api_key": "k"})
    assert a.disconnect_session("").success is False
    assert a.disconnect_session("abc").success is True


def test_no_invented_sessions():
    assert _adapter({"api_key": "k"}).list_active_sessions() == []
