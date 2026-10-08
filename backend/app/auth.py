import hashlib
from datetime import datetime, timezone
from functools import wraps

from flask import g, request

from .errors import api_error
from .extensions import db
from .models import AuthSession


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return api_error("AUTH_REQUIRED", "Sign in with MetaMask.", 401)

        token = header.removeprefix("Bearer ").strip()
        session = db.session.execute(
            db.select(AuthSession).where(AuthSession.token_hash == hash_token(token))
        ).scalar_one_or_none()
        now = datetime.now(timezone.utc)
        if session is None or session.expires_at.replace(tzinfo=timezone.utc) <= now:
            return api_error("AUTH_EXPIRED", "Your session has expired.", 401)

        g.wallet_address = session.wallet_address
        return view(*args, **kwargs)

    return wrapped
