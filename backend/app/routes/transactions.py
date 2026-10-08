from flask import Blueprint, current_app, g, jsonify, request
from web3 import Web3
from web3.exceptions import TransactionNotFound

from ..auth import require_auth
from ..errors import api_error
from ..extensions import db
from ..models import TransactionRecord

transactions_bp = Blueprint("transactions", __name__, url_prefix="/api/transactions")


@transactions_bp.post("/verify")
@require_auth
def verify_transaction():
    payload = request.get_json(silent=True) or {}
    tx_hash = str(payload.get("txHash", ""))
    contract_name = str(payload.get("contractName", ""))
    action = str(payload.get("action", ""))
    if not Web3.is_address(g.wallet_address) or len(tx_hash) != 66:
        return api_error("VALIDATION_ERROR", "Provide a valid transaction hash.", 400)

    expected_contract = current_app.config["CONTRACT_ADDRESSES"].get(contract_name)
    if not expected_contract or not Web3.is_address(expected_contract):
        return api_error("CONTRACT_NOT_CONFIGURED", "Contract address is not configured.", 409)
    rpc_url = current_app.config["SEPOLIA_RPC_URL"]
    if not rpc_url:
        return api_error("RPC_NOT_CONFIGURED", "Sepolia RPC is not configured.", 503)

    web3 = Web3(Web3.HTTPProvider(rpc_url))
    try:
        transaction = web3.eth.get_transaction(tx_hash)
        receipt = web3.eth.get_transaction_receipt(tx_hash)
    except TransactionNotFound:
        return jsonify({"status": "pending", "txHash": tx_hash}), 202
    except Exception:
        return api_error("RPC_UNAVAILABLE", "Unable to verify the Sepolia transaction.", 503)

    if Web3.to_checksum_address(transaction["from"]) != g.wallet_address:
        return api_error("SENDER_MISMATCH", "Transaction sender does not match your wallet.", 403)
    actual_contract = (
        Web3.to_checksum_address(transaction["to"])
        if transaction.get("to") is not None
        else None
    )
    expected_checksum = Web3.to_checksum_address(expected_contract)
    if actual_contract != expected_checksum:
        return api_error(
            "CONTRACT_MISMATCH",
            "Transaction target is not the configured contract.",
            422,
            {
                "contractName": contract_name,
                "expectedAddress": expected_checksum,
                "actualAddress": actual_contract,
                "txHash": tx_hash,
            },
        )

    status = "confirmed" if receipt["status"] == 1 else "failed"
    record = db.session.execute(
        db.select(TransactionRecord).where(TransactionRecord.tx_hash == tx_hash)
    ).scalar_one_or_none()
    if record is None:
        record = TransactionRecord(
            tx_hash=tx_hash,
            wallet_address=g.wallet_address,
            contract_name=contract_name,
            action=action,
            value_wei=str(transaction["value"]),
            status=status,
            block_number=receipt["blockNumber"],
        )
        db.session.add(record)
    else:
        record.status = status
        record.block_number = receipt["blockNumber"]
    db.session.commit()
    return jsonify({"data": record.to_dict()})


@transactions_bp.get("")
@require_auth
def list_transactions():
    rows = db.session.execute(
        db.select(TransactionRecord)
        .where(TransactionRecord.wallet_address == g.wallet_address)
        .order_by(TransactionRecord.created_at.desc())
    ).scalars()
    return jsonify({"data": [row.to_dict() for row in rows]})
