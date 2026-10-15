# apps/connectors/adapters/registry.py
from .base import RouterAdapter
from .mikrotik import MikroTikAdapter
from .wizyfi import WizyfiAdapter

_ADAPTERS: dict[str, type[RouterAdapter]] = {
    MikroTikAdapter.vendor_code: MikroTikAdapter,
    WizyfiAdapter.vendor_code: WizyfiAdapter,
}


def get_adapter_class(vendor_code: str) -> type[RouterAdapter]:
    try:
        return _ADAPTERS[vendor_code]
    except KeyError:
        raise ValueError(f"No adapter registered for vendor '{vendor_code}'.")


VENDOR_CHOICES = [(code, code.title()) for code in _ADAPTERS]
