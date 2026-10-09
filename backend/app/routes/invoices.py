from datetime import datetime

from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy import or_
from web3 import Web3

from ..auth import require_auth
from ..chain import ChainServiceError, get_chain_reader
from ..errors import api_error
from ..extensions import db
from ..invoice_keys import invoice_key, utc_timestamp
from ..models import InvoiceMetadata

invoices_bp = Blueprint("invoices", __name__, url_prefix="/api/invoices")


@invoices_bp.post("/metadata")
@require_auth
def create_metadata():
    try:
        reader = get_chain_reader()
        if not reader.has_role(g.wallet_address, 0):
            return api_error("FORBIDDEN", "An active Supplier role is required.", 403)
    except ChainServiceError as exc:
        return api_error("RPC_UNAVAILABLE", str(exc), 503)
    payload = request.get_json(silent=True) or {}
    required = ["invoiceNumber", "buyer", "faceValue", "issuedAt", "dueAt", "documentHash"]
    if any(not payload.get(field) for field in required):
        return api_error("VALIDATION_ERROR", "Complete all invoice fields.", 400)
    if not Web3.is_address(payload["buyer"]):
        return api_error("INVALID_ADDRESS", "Enter a valid buyer address.", 400)
    try:
        if not reader.has_role(payload["buyer"], 1):
            return api_error("FORBIDDEN", "The buyer wallet must have an active Buyer role.", 403)
    except ChainServiceError as exc:
        return api_error("RPC_UNAVAILABLE", str(exc), 503)
    if not str(payload["faceValue"]).isdigit() or int(payload["faceValue"]) <= 0:
        return api_error("INVALID_AMOUNT", "Face value must be a positive wei amount.", 400)
    document_hash = str(payload["documentHash"])
    if len(document_hash) != 66 or not document_hash.startswith("0x"):
        return api_error("INVALID_HASH", "Document hash must be a bytes32 value.", 400)

    try:
        issued_at = datetime.fromisoformat(str(payload["issuedAt"]).replace("Z", "+00:00"))
        due_at = datetime.fromisoformat(str(payload["dueAt"]).replace("Z", "+00:00"))
    except ValueError:
        return api_error("INVALID_DATE", "Use ISO 8601 invoice dates.", 400)
    if due_at <= issued_at:
        return api_error("INVALID_DATE", "Due date must be after the issue date.", 400)

    metadata = InvoiceMetadata(
        wallet_address=g.wallet_address,
        invoice_number=str(payload["invoiceNumber"]).strip(),
        buyer_address=Web3.to_checksum_address(payload["buyer"]),
        face_value_wei=str(payload["faceValue"]),
        issued_at=issued_at,
        due_at=due_at,
        document_hash=document_hash.lower(),
    )
    db.session.add(metadata)
    db.session.commit()
    return jsonify({"data": metadata.to_dict()}), 201


@invoices_bp.get("/metadata")
@require_auth
def list_metadata():
    reader = None
    auditor_access = False
    try:
        reader = get_chain_reader()
        auditor_access = reader.has_role(g.wallet_address, 3)
    except ChainServiceError:
        pass

    query = db.select(InvoiceMetadata)
    if not auditor_access:
        query = query.where(
            or_(
                InvoiceMetadata.wallet_address == g.wallet_address,
                InvoiceMetadata.buyer_address == g.wallet_address,
            )
        )
    rows = list(db.session.execute(
        query.order_by(InvoiceMetadata.created_at.desc())
    ).scalars())
    try:
        if reader is not None and hasattr(reader, "invoice_id_by_key"):
            changed = False
            for row in rows:
                if not row.onchain_invoice_id and _recover_invoice_link(reader, row):
                    changed = True
            if changed:
                db.session.commit()
    except ChainServiceError:
        pass
    return jsonify({"data": [row.to_dict() for row in rows]})


def _recover_invoice_link(reader, metadata: InvoiceMetadata) -> bool:
    key = invoice_key(
        current_app.config["CHAIN_ID"],
        metadata.wallet_address,
        metadata.buyer_address,
        metadata.invoice_number,
        metadata.issued_at,
    )
    invoice_id = reader.invoice_id_by_key(key)
    if invoice_id == 0:
        return False
    invoice = reader.invoice(invoice_id)
    expected_number_hash = Web3.to_hex(Web3.keccak(text=metadata.invoice_number)).lower()
    if (
        invoice["supplier"].lower() != metadata.wallet_address.lower()
        or invoice["buyer"].lower() != metadata.buyer_address.lower()
        or invoice["invoiceNumberHash"].lower() != expected_number_hash
        or invoice["faceValue"] != metadata.face_value_wei
        or int(invoice["issuedAt"]) != utc_timestamp(metadata.issued_at)
        or int(invoice["dueAt"]) != utc_timestamp(metadata.due_at)
        or invoice["documentHash"].lower() != metadata.document_hash.lower()
    ):
        return False
    metadata.onchain_invoice_id = str(invoice_id)
    return True
