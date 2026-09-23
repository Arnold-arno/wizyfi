# apps/connectors/adapters/registry.py
from .base import RouterAdapter
from .mikrotik import MikroTikAdapter

_ADAPTERS: dict[str, type[RouterAdapter]] = {
    MikroTikAdapter.vendor_code: MikroTikAdapter,
}


def get_adapter_class(vendor_code: str) -> type[RouterAdapter]:
    try:
        return _ADAPTERS[vendor_code]
    except KeyError:
        raise ValueError(f"No adapter registered for vendor '{vendor_code}'.")


VENDOR_CHOICES = [(code, code.title()) for code in _ADAPTERS]
