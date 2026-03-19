"""
Cloner service — thin re-export module.

All logic lives in sub-modules; this file exists for backward-compatible imports.
"""
from app.features.cloner.site_operations import (
    get_live_account_sites,
    fetch_site_config_live,
    get_captured_sites,
    fetch_site_config,
    get_site_ssids,
)
from app.features.cloner.sync_operations import (
    sync_ssids_passwords,
    sync_ssids_config,
    sync_ssids_delete,
    sync_ssids_create,
)
from app.features.cloner.batch_operations import (
    batch_account_precheck,
    batch_account_access,
    batch_site_delete,
    batch_site_provision,
    batch_clear_site_networks,
)
from app.features.cloner.apply_config import (
    apply_config_to_site,
    apply_config_live,
)

__all__ = [
    "get_live_account_sites",
    "fetch_site_config_live",
    "get_captured_sites",
    "fetch_site_config",
    "get_site_ssids",
    "sync_ssids_passwords",
    "sync_ssids_config",
    "sync_ssids_delete",
    "sync_ssids_create",
    "batch_account_precheck",
    "batch_account_access",
    "batch_site_delete",
    "batch_site_provision",
    "batch_clear_site_networks",
    "apply_config_to_site",
    "apply_config_live",
]
