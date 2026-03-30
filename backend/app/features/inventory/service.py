from typing import List, Dict, Any
from app.shared.aruba import aruba_service
from app.features.inventory.schemas import DeviceResponse, DeviceStatus, DeviceType

class InventoryService:
    async def get_site_devices(self, site_id: str, aruba_token: str) -> List[DeviceResponse]:
        """
        Fetches raw device inventory from Aruba and transforms it into
        the Safe internal schema (Data Scrubbing).
        """
        endpoint = f"api/sites/{site_id}/devices" # Assumed endpoint

        try:
            # 1. Fetch Raw Data using the Proxy/Adapter Service
            response = await aruba_service.call_api("GET", endpoint, aruba_token=aruba_token)

            if response.status_code != 200:
                print(f"[INVENTORY] Failed to fetch devices: {response.status_code}")
                # Return empty or raise, depending on requirement.
                # For now return empty list to avoid breaking UI.
                return []

            raw_data = response.json()
            # Handle { "elements": [...] } structure common in Aruba API
            elements = raw_data.get("elements", []) if isinstance(raw_data, dict) else raw_data

            # 2. Data Transformation / Scrubbing
            devices = []
            for item in elements:
                # Map raw status to Enum
                raw_state = item.get("state", "UNKNOWN").upper()
                status = DeviceStatus.UNKNOWN
                if raw_state in ["ONLINE", "ACTIVE"]:
                    status = DeviceStatus.ONLINE
                elif raw_state in ["OFFLINE", "DOWN"]:
                    status = DeviceStatus.OFFLINE
                elif raw_state in ["ALERT", "PROBLEM"]:
                    status = DeviceStatus.ALERT

                # Map raw type to Enum
                raw_type = item.get("deviceType", "UNKNOWN").lower()
                dtype = DeviceType.UNKNOWN
                if "ap" in raw_type or "accesspoint" in raw_type:
                    dtype = DeviceType.AP
                elif "switch" in raw_type:
                    dtype = DeviceType.SWITCH

                # Create Pydantic Model (Scrubbing happens here by omission of fields)
                device = DeviceResponse(
                    id=item.get("id", "unknown"),
                    name=item.get("name", "Unknown Device"),
                    status=status,
                    type=dtype,
                    serial_number=item.get("serialNumber"), # Allowed
                    mac_address=item.get("macAddress"),     # Allowed
                    site_id=site_id,
                    uptime_seconds=item.get("uptime", 0),
                    client_count=item.get("connectedClients", 0)
                )
                devices.append(device)

            return devices

        except Exception as e:
            print(f"[INVENTORY] Exception fetching devices: {e}")
            return []

inventory_service = InventoryService()
