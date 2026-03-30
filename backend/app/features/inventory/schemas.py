from pydantic import BaseModel, HttpUrl
from typing import Optional, List
from enum import Enum

class DeviceStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    ALERT = "alert"
    UNKNOWN = "unknown"

class DeviceType(str, Enum):
    AP = "ap"
    SWITCH = "switch"
    UNKNOWN = "unknown"

class DeviceBase(BaseModel):
    id: str
    name: str
    status: DeviceStatus
    type: DeviceType
    serial_number: Optional[str] = None
    mac_address: Optional[str] = None
    site_id: str

class DeviceCreate(DeviceBase):
    pass

class DeviceUpdate(DeviceBase):
    pass

class DeviceInDB(DeviceBase):
    pass

class DeviceResponse(DeviceBase):
    """
    Publicly exposed device model.
    Internal fields or raw vendor data are scrubbed here.
    """
    uptime_seconds: Optional[int] = 0
    client_count: int = 0
