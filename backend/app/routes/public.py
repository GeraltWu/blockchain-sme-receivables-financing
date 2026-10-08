from flask import Blueprint, current_app, jsonify
from sqlalchemy import text

from ..extensions import db

public_bp = Blueprint("public", __name__, url_prefix="/api")


@public_bp.get("/health")
def health():
    db.session.execute(text("SELECT 1"))
    return jsonify({"status": "ok", "database": "ok"})


@public_bp.get("/config")
def public_config():
    addresses = current_app.config["CONTRACT_ADDRESSES"]
    return jsonify(
        {
            "chainId": current_app.config["CHAIN_ID"],
            "settlementAsset": "native-ETH",
            "contracts": addresses,
            "configured": all(bool(value) for value in addresses.values()),
        }
    )
