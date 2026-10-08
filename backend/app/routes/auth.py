import secrets
from datetime import datetime, timedelta, timezone

from eth_account import Account
from eth_account.messages import encode_defunct
from flask import Blueprint, current_app, jsonify, request
from web3 import Web3

from ..auth import hash_token, require_auth
from ..errors import api_error
from ..extensions import db
from ..models import AuthSession, WalletNonce

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _address(value: str) -> str | None:
    if not Web3.is_address(value):
        return None
    return Web3.to_checksum_address(value)


@auth_bp.post("/nonce")
def create_nonce():
    payload = request.get_json(silent=True) or {}
    address = _address(str(payload.get("address", "")))
    if address is None:
        return api_error("INVALID_ADDRESS", "Enter a valid wallet address.", 400)
    if payload.get("chainId") != current_app.config["CHAIN_ID"]:
        return api_error("CHAIN_MISMATCH", "Switch to the Sepolia testnet.", 400)

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=current_app.config["NONCE_TTL_SECONDS"])
    nonce = secrets.token_hex(16)
    message = (
        "Receivables Financing sign-in\n"
        f"Wallet: {address}\n"
        f"Chain ID: {current_app.config['CHAIN_ID']}\n"
        f"Nonce: {nonce}\n"
        f"Expires: {expires_at.isoformat()}"
    )
    db.session.add(
        WalletNonce(
            wallet_address=address,
            nonce=nonce,
            message=message,
            expires_at=expires_at,
        )
    )
    db.session.commit()
    return jsonify({"nonce": nonce, "message": message, "expiresAt": expires_at.isoformat()})


@auth_bp.post("/verify")
def verify_signature():
    payload = request.get_json(silent=True) or {}
    address = _address(str(payload.get("address", "")))
    message = str(payload.get("message", ""))
    signature = str(payload.get("signature", ""))
    if address is None or not message or not signature:
        return api_error("INVALID_SIGNATURE", "The signature request is incomplete.", 400)

    nonce_record = db.session.execute(
        db.select(WalletNonce).where(
            WalletNonce.wallet_address == address,
            WalletNonce.message == message,
            WalletNonce.used_at.is_(None),
        )
    ).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if nonce_record is None or nonce_record.expires_at.replace(tzinfo=timezone.utc) <= now:
        return api_error("NONCE_EXPIRED", "Request a new sign-in message.", 401)

    try:
        recovered = Account.recover_message(encode_defunct(text=message), signature=signature)
    except ValueError:
        return api_error("INVALID_SIGNATURE", "MetaMask signature verification failed.", 401)
    if Web3.to_checksum_address(recovered) != address:
        return api_error("INVALID_SIGNATURE", "The signature does not match this wallet.", 401)

    token = secrets.token_urlsafe(32)
    expires_at = now + timedelta(seconds=current_app.config["AUTH_TOKEN_TTL_SECONDS"])
    nonce_record.used_at = now
    db.session.add(
        AuthSession(wallet_address=address, token_hash=hash_token(token), expires_at=expires_at)
    )
    db.session.commit()
    return jsonify({"sessionToken": token, "expiresAt": expires_at.isoformat(), "wallet": address})


@auth_bp.get("/me")
@require_auth
def me():
    from flask import g

    return jsonify({"wallet": g.wallet_address})
