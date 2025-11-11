import time
import requests
import jwt
from django.conf import settings
from django.core.cache import cache

def generate_jwt():
    now = int(time.time())
    payload = {
        "iat": now - 60,
        "exp": now + (10 * 60),
        "iss": settings.GITHUB_APP_ID,
    }
    private_key = settings.GITHUB_PRIVATE_KEY
    return jwt.encode(payload, private_key, algorithm="RS256")

def get_installation_token(installation_id: str):
    cache_key = f"github_installation_{installation_id}"
    token = cache.get(cache_key)
    if token:
        return token
    
    try:
        jwt_token = generate_jwt()
        url = f"https://api.github.com/app/installations/{installation_id}/access_tokens"
        headers = {
            "Authorization": f"Bearer {jwt_token}",
            "Accept": "application/vnd.github+json"
        }
        response = requests.post(url, headers=headers)
        response.raise_for_status()
        data = response.json()

        token = data["token"]
        # expires_at = data["expires_at"] later

        cache.set(cache_key, token, timeout=3500)
        return token
    except Exception:
        return None