"""
Config feature constants — API endpoints, restricted keys, supported netmasks.
"""

NETS_ENDPOINTS = [
    "/api/sites/{site_id}/networksSummary",
    "/api/v1/sites/{site_id}/networksSummary",
]
GUEST_ENDPOINT = "/api/sites/{site_id}/guestPortalSettings"
WIRED_NETWORKS_ENDPOINT = "/api/sites/{site_id}/wiredNetworks"
NETWORK_UPDATE_ENDPOINT = "/api/sites/{site_id}/networksSummary/{network_id}"
EXTEND_ALLOW_LIST_ENDPOINT = "/api/sites/{site_id}/extendWirelessNetworkAllowList/{network_id}"
WIRED_NETWORK_DELETE_ENDPOINT = "/api/sites/{site_id}/wiredNetworks/{vlan_id}"
WIRED_NETWORK_UPDATE_ENDPOINT = "/api/sites/{site_id}/wiredNetworks/{vlan_id}"
NETWORK_OVERVIEW_REFERER = "https://portal.instant-on.hpe.com/sites/{site_id}/networks/overview"
WIRED_NETWORK_DETAIL_REFERER = "https://portal.instant-on.hpe.com/sites/{site_id}/networks/{network_id}/wired/overview"
SUPPORTED_NETMASKS = {"255.255.255.0", "255.255.0.0", "255.0.0.0"}
NETWORK_UPDATE_RESTRICTED_KEYS = {
    "networkId",
    "siteId",
    "id",
    "kind",
    "wiredNetworkId",
    "accessPoints",
    "allowList",
}
