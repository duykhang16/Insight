from typing import Dict, Optional, Set


ROLE_SUPER_ADMIN = "super_admin"
ROLE_BRAND_ADMIN = "brand_admin"
ROLE_ADMIN = "admin"
ROLE_SUB_ADMIN = ROLE_ADMIN
ROLE_VIEWER = "viewer"
ROLE_DELEGATOR = "delegator"

VALID_ROLES = [
    ROLE_SUPER_ADMIN,
    ROLE_BRAND_ADMIN,
    ROLE_SUB_ADMIN,
    ROLE_VIEWER,
    ROLE_DELEGATOR,
]

USER_MANAGER_ROLES: Set[str] = {
    ROLE_SUPER_ADMIN,
    ROLE_BRAND_ADMIN,
    ROLE_SUB_ADMIN,
}

BRAND_ROLES: Set[str] = {
    ROLE_BRAND_ADMIN,
    ROLE_SUB_ADMIN,
    ROLE_VIEWER,
    ROLE_DELEGATOR,
}

READ_ONLY_ROLES: Set[str] = {
    ROLE_VIEWER,
    ROLE_DELEGATOR,
}

DIRECT_PARENT_ROLE_MAP: Dict[str, Set[str]] = {
    ROLE_BRAND_ADMIN: {ROLE_SUPER_ADMIN},
    ROLE_SUB_ADMIN: {ROLE_BRAND_ADMIN},
    ROLE_VIEWER: {ROLE_SUB_ADMIN},
    ROLE_DELEGATOR: {ROLE_SUB_ADMIN},
}

CREATABLE_ROLES_BY_CALLER: Dict[str, Set[str]] = {
    ROLE_SUPER_ADMIN: {
        ROLE_BRAND_ADMIN,
        ROLE_SUB_ADMIN,
        ROLE_VIEWER,
        ROLE_DELEGATOR,
    },
    ROLE_BRAND_ADMIN: {
        ROLE_SUB_ADMIN,
        ROLE_VIEWER,
        ROLE_DELEGATOR,
    },
    ROLE_SUB_ADMIN: {
        ROLE_VIEWER,
        ROLE_DELEGATOR,
    },
}

ROLE_LEVEL: Dict[str, int] = {
    ROLE_SUPER_ADMIN: 500,
    ROLE_BRAND_ADMIN: 400,
    ROLE_SUB_ADMIN: 300,
    ROLE_VIEWER: 200,
    ROLE_DELEGATOR: 200,
}


def is_brand_admin_role(role: Optional[str]) -> bool:
    return role == ROLE_BRAND_ADMIN


def is_platform_admin_role(role: Optional[str]) -> bool:
    return role == ROLE_SUPER_ADMIN


def is_user_manager_role(role: Optional[str]) -> bool:
    return role in USER_MANAGER_ROLES


def can_create_role(caller_role: Optional[str], target_role: Optional[str]) -> bool:
    return bool(target_role and target_role in CREATABLE_ROLES_BY_CALLER.get(caller_role or "", set()))


def is_strictly_lower_role(caller_role: Optional[str], target_role: Optional[str]) -> bool:
    return ROLE_LEVEL.get(caller_role or "", 0) > ROLE_LEVEL.get(target_role or "", 0)


def get_direct_parent_roles_for(role: Optional[str]) -> Set[str]:
    return DIRECT_PARENT_ROLE_MAP.get(role or "", set())


def requires_direct_parent(role: Optional[str]) -> bool:
    return role in DIRECT_PARENT_ROLE_MAP


def normalize_legacy_role(role: Optional[str]) -> str:
    mapping = {
        "tenant_admin": ROLE_BRAND_ADMIN,
        "sub_admin": ROLE_ADMIN,
        "manager": ROLE_SUB_ADMIN,
    }
    return mapping.get((role or "").strip(), (role or ROLE_VIEWER).strip() or ROLE_VIEWER)


def normalize_zone_role(zone_role: Optional[str]) -> str:
    mapping = {
        "sub_admin": ROLE_ADMIN,
        "manager": ROLE_SUB_ADMIN,
        "tenant_admin": ROLE_SUB_ADMIN,
    }
    normalized = mapping.get((zone_role or "").strip(), (zone_role or ROLE_VIEWER).strip() or ROLE_VIEWER)
    if normalized not in {ROLE_SUB_ADMIN, ROLE_VIEWER, ROLE_DELEGATOR}:
        return ROLE_VIEWER
    return normalized
