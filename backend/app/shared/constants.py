"""Aruba/HPE Instant-On fixed constants.

These values are determined by the Aruba platform and never change per environment.
Do NOT put these in .env — they are not deployment-specific configuration.
"""

# Aruba Instant-On Portal
ARUBA_BASE_URL = "https://portal.instant-on.hpe.com"
ARUBA_ORIGIN = "https://portal.instant-on.hpe.com"
ARUBA_REFERER = "https://portal.instant-on.hpe.com/"

# Aruba SSO endpoints
ARUBA_SSO_VALIDATE_URL = "https://sso.arubainstanton.com/aio/api/v1/mfa/validate/full"
ARUBA_SSO_AUTHORIZE_URL = "https://sso.arubainstanton.com/as/authorization.oauth2"
ARUBA_SSO_TOKEN_URL = "https://sso.arubainstanton.com/as/token.oauth2"

# Aruba API headers
ARUBA_API_VERSION = "23"
ARUBA_CLIENT_TYPE = "InstantOn"
ARUBA_CLIENT_PLATFORM = "web"

# Chrome User-Agent (used for Aruba header spoofing)
CHROME_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/145.0.0.0 Safari/537.36"
)
