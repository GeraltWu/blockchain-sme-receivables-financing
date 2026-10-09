from flask import Blueprint, current_app, g, jsonify, request
from web3 import Web3
from web3.exceptions import TransactionNotFound

from ..auth import require_auth
from ..errors import api_error
from ..extensions import db
from ..invoice_keys import invoice_key
from ..models import InvoiceMetadata, TransactionRecord

transactions_bp = Blueprint("transactions", __name__, url_prefix="/api/transactions")


@transactions_bp.post("/verify")
@require_auth
def verify_transaction():
    payload = request.get_json(silent=True) or {}
    tx_hash = str(payload.get("txHash", ""))
    contract_name = str(payload.get("contractName", ""))
    action = str(payload.get("action", ""))
    metadata_id = str(payload.get("metadataId", ""))
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
    metadata = None
    if metadata_id:
        if not metadata_id.isdigit():
            return api_error("INVALID_METADATA", "Invoice metadata reference is invalid.", 400)
        metadata = db.session.get(InvoiceMetadata, int(metadata_id))
        if metadata is None or metadata.wallet_address != g.wallet_address:
            return api_error("INVALID_METADATA", "Invoice metadata is not available for this wallet.", 404)
        if contract_name != "invoiceRegistry" or action != "Submit invoice":
            return api_error("INVALID_METADATA", "Invoice metadata can only be linked to an invoice submission.", 422)
        if status != "confirmed":
            return api_error("TRANSACTION_FAILED", "A failed transaction cannot be linked to invoice metadata.", 422)
        link_error = _link_invoice_metadata(web3, receipt, expected_checksum, metadata, tx_hash)
        if link_error is not None:
            return link_error
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


def _link_invoice_metadata(web3, receipt, registry_address, metadata, tx_hash):
    event_topic = Web3.keccak(
        text="InvoiceSubmitted(uint256,bytes32,address,address,uint256)"
    ).hex().lower()
    matching_log = next(
        (
            log
            for log in receipt["logs"]
            if Web3.to_checksum_address(log["address"]) == registry_address
            and len(log["topics"]) == 4
            and log["topics"][0].hex().lower() == event_topic
        ),
        None,
    )
    if matching_log is None:
        return api_error("INVOICE_EVENT_MISSING", "The invoice submission event was not found.", 422)

    invoice_id = int.from_bytes(matching_log["topics"][1], byteorder="big")
    event_invoice_key = matching_log["topics"][2].hex().lower()
    supplier = Web3.to_checksum_address("0x" + matching_log["topics"][3].hex()[-40:])
    buyer, face_value = web3.codec.decode(["address", "uint256"], matching_log["data"])
    buyer = Web3.to_checksum_address(buyer)
    expected_key = invoice_key(
        current_app.config["CHAIN_ID"],
        metadata.wallet_address,
        metadata.buyer_address,
        metadata.invoice_number,
        metadata.issued_at,
    ).hex().lower()
    if (
        supplier != metadata.wallet_address
        or buyer != metadata.buyer_address
        or str(face_value) != metadata.face_value_wei
        or event_invoice_key != expected_key
    ):
        return api_error(
            "INVOICE_METADATA_MISMATCH",
            "Saved invoice details do not match the confirmed on-chain invoice.",
            422,
        )
    if metadata.submit_tx_hash and metadata.submit_tx_hash.lower() != tx_hash.lower():
        return api_error("METADATA_ALREADY_LINKED", "This invoice metadata is already linked.", 409)
    metadata.onchain_invoice_id = str(invoice_id)
    metadata.submit_tx_hash = tx_hash
    return None


@transactions_bp.get("")
@require_auth
def list_transactions():
    rows = db.session.execute(
        db.select(TransactionRecord)
        .where(TransactionRecord.wallet_address == g.wallet_address)
        .order_by(TransactionRecord.created_at.desc())
    ).scalars()
    return jsonify({"data": [row.to_dict() for row in rows]})
