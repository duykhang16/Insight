import httpx
import json
from typing import Dict, Any, Optional
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Request
from app.shared.constants import (
    ARUBA_BASE_URL,
    ARUBA_API_VERSION,
    ARUBA_SSO_VALIDATE_URL,
    ARUBA_SSO_AUTHORIZE_URL,
    ARUBA_SSO_TOKEN_URL,
    CHROME_USER_AGENT,
)

# Stateless session management. Session tokens are passed in request headers.

async def replay_login(username: str, password: str, client_id: Optional[str] = None) -> dict:
    """
    Execute strict replay login against Aruba SSO.
    target: https://sso.arubainstanton.com/aio/api/v1/mfa/validate/full
    body: application/x-www-form-urlencoded
    """
    global ACTIVE_TOKEN

    # Sanitize Swagger placeholder
    if client_id == "string":
        client_id = None

    url = ARUBA_SSO_VALIDATE_URL

    async with httpx.AsyncClient(verify=True) as client:
        # --- PHASE 0: Discovery ---
        # Fetching settings.json to get dynamic OIDC IDs
        target_client_id_authn = client_id # Provided ID as first fallback
        target_client_id_authz = client_id # Provided ID as first fallback
        target_resource = ARUBA_BASE_URL

        try:
            settings_url = f"{target_resource}/settings.json"
            settings_resp = await client.get(settings_url, timeout=10.0)
            if settings_resp.status_code == 200:
                s = settings_resp.json()
                target_client_id_authn = s.get("ssoClientIdAuthN") or target_client_id_authn
                target_client_id_authz = s.get("ssoClientIdAuthZ") or target_client_id_authz

                # Pick the most robust URL key
                discovered_resource = s.get("restApiUrl") or s.get("portalUrl") or s.get("portalFqdn")
                if discovered_resource:
                    if not discovered_resource.startswith("http"):
                        discovered_resource = f"https://{discovered_resource}"
                    target_resource = discovered_resource

                print(f"[REPLAY] Discovery Success: AuthN={target_client_id_authn}, AuthZ={target_client_id_authz}, Resource={target_resource}")
            else:
                print(f"[REPLAY] Discovery (settings.json) failed: {settings_resp.status_code}")

            # Fallback: Scrape from portal homepage redirect
            if not target_client_id_authn or not target_client_id_authz:
                print(f"[REPLAY] Falling back to Portal Redirect discovery...")
                portal_resp = await client.get(target_resource, follow_redirects=True, timeout=10.0)
                final_url = str(portal_resp.url)
                if "client_id=" in final_url:
                    from urllib.parse import urlparse, parse_qs
                    parsed_p = urlparse(final_url)
                    qs_p = parse_qs(parsed_p.query)
                    target_client_id_authn = qs_p.get("client_id", [None])[0] or target_client_id_authn
                    target_client_id_authz = target_client_id_authn # Often same
                    print(f"[REPLAY] Discovery Success (Scrape): client_id={target_client_id_authn}")

        except Exception as e:
            print(f"[REPLAY WARNING] Discovery failed: {e}")

        # Final hardcoded fallbacks if everything still None
        target_client_id_authn = target_client_id_authn or "8d02000d-0ba3-468a-b674-9a8052347d9b"
        target_client_id_authz = target_client_id_authz or "987b543b-210d-9ed6-54a2-10a2c4567fa0"

        # --- STEP 1: SSO Login ---
        try:
            # Headers standardized to match working Curl/Postman standard
            headers = {
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
                "Connection": "keep-alive",
                "Origin": target_resource,
                "Referer": f"{target_resource}/",
                "User-Agent": CHROME_USER_AGENT,
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "cross-site",
                "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "cache-control": "no-cache",
                "X-Requested-With": "XMLHttpRequest"
            }

            # Variant 1: Pure Form-URLEncoded (Postman/Curl standard - No client_id needed in Step 1)
            # We prioritize variants based on the account type (aitc-jsc.com usually needs identification)
            variants = []
            if "@aitc-jsc.com" in username.lower():
                # Newer accounts usually need 'identification'
                variants = [
                    {"type": "form", "data": {"identification": username, "password": password, "client_id": target_client_id_authn}},
                    {"type": "form", "data": {"username": username, "password": password}},
                    {"type": "json", "data": {"identification": username, "password": password, "client_id": target_client_id_authn}},
                ]
            else:
                # Standard legacy flow
                variants = [
                    {"type": "form", "data": {"username": username, "password": password}},
                    {"type": "form", "data": {"identification": username, "password": password, "client_id": target_client_id_authn}},
                    {"type": "json", "data": {"identification": username, "password": password, "client_id": target_client_id_authn}},
                ]

            # Add secondary variants
            variants.extend([
                {"type": "form", "data": {"username": username, "password": password, "client_id": target_client_id_authn}},
                {"type": "json", "data": {"username": username, "password": password, "client_id": target_client_id_authn}},
            ])

            response = None
            for v in variants:
                try:
                    print(f"[REPLAY] Trying Step 1 variant: {v['type']} ({list(v['data'].keys())})")
                    v_headers = headers.copy()
                    if v["type"] == "form":
                        v_headers["Content-Type"] = "application/x-www-form-urlencoded"
                        response = await client.post(url, headers=v_headers, data=v['data'], timeout=15.0)
                    else:
                        v_headers["Content-Type"] = "application/json"
                        response = await client.post(url, headers=v_headers, json=v['data'], timeout=15.0)

                    if response.status_code == 200:
                        print(f"[REPLAY] Step 1 Success with variant: {v['type']} ({list(v['data'].keys())})")
                        break
                    elif response.status_code == 429:
                        print(f"[REPLAY ERROR] 429 Too Many Requests detected. Aborting variants to avoid ban.")
                        break # Stop immediately
                    else:
                        print(f"[REPLAY] Variant failed ({response.status_code}): {response.text[:100]}...")
                except Exception as e:
                    print(f"[REPLAY] Variant error: {e}")

            if not response or response.status_code != 200:
                return {
                    "status": "error",
                    "message": "Login failed - exhausted all variants",
                    "last_status": response.status_code if response else "none",
                    "upstream_response": response.text if response else "no response"
                }

            # Parse response
            resp_data = response.json()

            # Expected format:
            # { "access_token": "...", "expires_in": 119, "token_type": "Bearer", "success": true }

            if resp_data.get("success") is True and "access_token" in resp_data:
                sso_token = resp_data["access_token"]
                print(f"[REPLAY] SSO Login Success. (Token: {sso_token[:10]}...)")

                # --- STEP 2: Authorization (Get Code) ---
                import base64, hashlib, random, string
                from urllib.parse import urlparse, parse_qs

                # PKCE Generation
                verifier = ''.join(random.choices(string.ascii_letters + string.digits + "-._~", k=64))
                sha256_hash = hashlib.sha256(verifier.encode()).digest()
                challenge = base64.urlsafe_b64encode(sha256_hash).decode().replace('=', '')
                state = ''.join(random.choices(string.ascii_letters + string.digits, k=32))

                print(f"[REPLAY] Requesting Authorize Code...")
                print(f"  Params: client_id={target_client_id_authz}, redirect={target_resource}")
                authz_url = ARUBA_SSO_AUTHORIZE_URL
                authz_params = {
                    "client_id": target_client_id_authz,
                    "redirect_uri": target_resource,
                    "response_type": "code",
                    "scope": "profile openid",
                    "state": state,
                    "code_challenge_method": "S256",
                    "code_challenge": challenge,
                    "sessionToken": sso_token
                }

                authz_headers = {
                    "Accept": "application/json, text/plain, */*",
                    "User-Agent": CHROME_USER_AGENT,
                    "Origin": target_resource
                }

                # We need follow_redirects=False to catch the Location header
                authz_resp = await client.get(authz_url, params=authz_params, headers=authz_headers, follow_redirects=False)

                location = authz_resp.headers.get("Location")
                if not location:
                    return {
                        "status": "error",
                        "message": "Step 2 (Authorize) failed - no redirect location",
                        "upstream_status": authz_resp.status_code,
                        "upstream_response": authz_resp.text[:500]
                    }

                parsed = urlparse(location)
                qs = parse_qs(parsed.query)
                code = qs.get("code", [None])[0]

                if not code:
                    return {
                        "status": "error",
                        "message": "Step 2 (Authorize) failed - no code in redirect",
                        "location": location
                    }

                print(f"[REPLAY] Authorize Success. Code obtained.")

                # --- STEP 3: Token Exchange (Code Grant) ---
                print(f"[REPLAY] Exchanging Code for Portal Token...")
                exchange_url = ARUBA_SSO_TOKEN_URL
                exchange_data = {
                    "client_id": target_client_id_authz,
                    "redirect_uri": target_resource,
                    "code": code,
                    "code_verifier": verifier,
                    "grant_type": "authorization_code"
                }

                exchange_headers = {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                    "Origin": target_resource,
                    "User-Agent": authz_headers["User-Agent"]
                }

                exchange_resp = await client.post(exchange_url, data=exchange_data, headers=exchange_headers, timeout=15.0)

                if exchange_resp.status_code != 200:
                    print(f"[REPLAY ERROR] Token Exchange failed ({exchange_resp.status_code}): {exchange_resp.text}")
                    return {
                        "status": "error",
                        "message": "Step 3 (Token Exchange) failed",
                        "upstream_response": exchange_resp.text
                    }

                final_data = exchange_resp.json()
                final_token = final_data.get("access_token")
                expires_in = final_data.get("expires_in", 1799)

                if final_token:
                    print(f"[REPLAY] SSO Login success for {username}. Token returned to browser.")
                    # No longer saving to DB (stateless mode)

                    # --- PHASE 4: Context Discovery (Get Sites/Customer ID) ---
                    customer_id = None
                    site_id = None
                    try:
                        print(f"[REPLAY] Discovering Customer Context...")
                        ctx_headers = {
                            "Authorization": f"Bearer {final_token}",
                            "Accept": "application/json",
                            "X-Ion-Api-Version": "22",
                            "X-Ion-Client-Type": "InstantOn",
                            "X-Ion-Client-Platform": "web"
                        }
                        # 1. Get Customer ID
                        me_url = f"{target_resource}/api/v1/customers/me"
                        me_resp = await client.get(me_url, headers=ctx_headers, timeout=10.0)
                        print(f"[REPLAY] Context Me: {me_resp.status_code}")
                        if me_resp.status_code == 200:
                            me_data = me_resp.json()
                            customer_id = me_data.get("customerId")
                            print(f"[REPLAY] Customer ID: {customer_id}")
                        else:
                            print(f"[REPLAY] Me Failed: {me_resp.text[:200]}")

                        # 2. Get Site ID
                        sites_url = f"{target_resource}/api/v1/sites"
                        sites_resp = await client.get(sites_url, headers=ctx_headers, timeout=10.0)
                        print(f"[REPLAY] Context Sites: {sites_resp.status_code}")
                        if sites_resp.status_code == 200:
                            sites_data = sites_resp.json()
                            if isinstance(sites_data, dict) and sites_data.get("elements"):
                                site_id = sites_data["elements"][0].get("siteId")
                                print(f"[REPLAY] Site ID (Primary): {site_id}")
                            elif isinstance(sites_data, list) and len(sites_data) > 0:
                                site_id = sites_data[0].get("siteId") or sites_data[0].get("id")
                                print(f"[REPLAY] Site ID (Primary List): {site_id}")
                        else:
                            print(f"[REPLAY] Sites Failed: {sites_resp.text[:200]}")
                    except Exception as e:
                        print(f"[REPLAY WARNING] Context Discovery failed: {e}")

                    return {
                        "status": "success",
                        "message": "Authentication successful",
                        "expires_in": expires_in,
                        "customer_id": customer_id,
                        "site_id": site_id,
                        "data": final_data
                    }

            return {
                "status": "error",
                "message": "Invalid login response format",
                "data": resp_data
            }

        except Exception as e:
            print(f"[REPLAY ERROR] {e}")
            return {"status": "error", "message": str(e)}

async def proxy_api_call(path: str, method: str, original_request: Request):
    """
    Proxy to target domain (default sso.arubainstanton.com)
    Extracts Bearer token from the incoming request's Authorization header.
    """
    auth_header = original_request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")

    access_token = auth_header.split(" ")[1]

    # Extract domain from query params or use default
    _default_domain = ARUBA_BASE_URL.replace("https://", "")
    domain = original_request.query_params.get("domain", _default_domain)
    BASE_URL = f"https://{domain}"

    if not path.startswith("/"): path = "/" + path
    target_url = f"{BASE_URL}{path}"

    # Prepare request headers
    headers = dict(original_request.headers)

    # Filter out hop-by-hop headers
    skip_req_headers = {
        "host", "connection", "content-length", "accept-encoding",
        "cookie", "user-agent", "origin", "referer"
    }
    filtered_headers = {k: v for k, v in headers.items() if k.lower() not in skip_req_headers}

    # Inject Token & Spoofing
    filtered_headers["Authorization"] = f"Bearer {access_token}"
    filtered_headers["Host"] = domain
    filtered_headers["Origin"] = f"https://{domain}"
    filtered_headers["Referer"] = f"https://{domain}/"
    filtered_headers["User-Agent"] = CHROME_USER_AGENT

    # Always force correct Aruba headers — never trust what the client sends
    filtered_headers["X-ION-API-VERSION"] = ARUBA_API_VERSION
    filtered_headers["X-ION-CLIENT-PLATFORM"] = "web"
    filtered_headers["X-ION-CLIENT-TYPE"] = "InstantOn"

    # Handle body & params
    body = await original_request.body()
    params = dict(original_request.query_params)
    params.pop("domain", None) # Don't pass domain param to upstream

    async with httpx.AsyncClient(verify=False) as client:
        try:
            print(f"[REPLAY PROXY] {method} {target_url}")
            response = await client.request(
                method,
                target_url,
                headers=filtered_headers,
                params=params,
                content=body,
                timeout=60.0,
                follow_redirects=True
            )

            # If backend receives 401 from Aruba
            if response.status_code in [401, 403]:
                print(f"[REPLAY PROXY] Received {response.status_code} from Aruba. Token invalid.")

            # Prepare response headers (filter out sensitive ones)
            skip_resp_headers = {
                "transfer-encoding", "connection", "content-encoding",
                "content-length", "set-cookie", "access-control-allow-origin"
            }
            resp_headers = {k: v for k, v in response.headers.items() if k.lower() not in skip_resp_headers}

            # Add FULL CORS for Swagger
            resp_headers["Access-Control-Allow-Origin"] = "*"
            resp_headers["Access-Control-Allow-Methods"] = "*"
            resp_headers["Access-Control-Allow-Headers"] = "*"
            resp_headers["Access-Control-Expose-Headers"] = "*"

            from fastapi.responses import Response
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=resp_headers,
                media_type=response.headers.get("content-type")
            )
        except Exception as e:
            print(f"[REPLAY PROXY ERROR] {e}")
            # Return a JSON error so at least we see something in Swagger
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=502,
                content={"error": "Proxy error", "details": str(e)},
                headers={"Access-Control-Allow-Origin": "*"}
            )
