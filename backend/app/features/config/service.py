"""
Config service — thin orchestrator that delegates to readers and writers modules.

Public API surface for routes.py — all methods are proxied from sub-modules.
"""
from app.features.config import readers, writers


class ConfigService:
    # --- Readers ---
    get_site_config = staticmethod(readers.get_site_config)
    get_site_ssids = staticmethod(readers.get_site_ssids)
    get_site_overview = staticmethod(readers.get_site_overview)
    get_individual_networks = staticmethod(readers.get_individual_networks)

    # --- Writers ---
    update_individual_network_overview = staticmethod(writers.update_individual_network_overview)
    update_individual_network_access_control = staticmethod(writers.update_individual_network_access_control)
    update_individual_wireless_ip_assignment = staticmethod(writers.update_individual_wireless_ip_assignment)
    update_individual_wireless_network_assignment = staticmethod(writers.update_individual_wireless_network_assignment)
    delete_individual_network = staticmethod(writers.delete_individual_network)
    get_individual_wireless_specific_clients = staticmethod(writers.get_individual_wireless_specific_clients)
    set_individual_wireless_specific_clients_extend = staticmethod(writers.set_individual_wireless_specific_clients_extend)
    add_individual_wireless_specific_clients = staticmethod(writers.add_individual_wireless_specific_clients)


config_service = ConfigService()
