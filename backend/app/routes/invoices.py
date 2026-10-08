from datetime import datetime

from flask import Blueprint, g, jsonify, request
from sqlalchemy import or_
from web3 import Web3

from ..auth import require_auth
from ..errors import api_error
from ..extensions import db
from ..models import InvoiceMetadata

invoices_bp = Blueprint("invoices", __name__, url_prefix="/api/invoices")


@invoices_bp.post("/metadata")
@require_auth
def create_metadata():
    payload = request.get_json(silent=True) or {}
    required = ["invoiceNumber", "buyer", "faceValue", "issuedAt", "dueAt", "documentHash"]
    if any(not payload.get(field) for field in required):
        return api_error("VALIDATION_ERROR", "Complete all invoice fields.", 400)
    if not Web3.is_address(payload["buyer"]):
        return api_error("INVALID_ADDRESS", "Enter a valid buyer address.", 400)
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
    rows = db.session.execute(
        db.select(InvoiceMetadata)
        .where(
            or_(
                InvoiceMetadata.wallet_address == g.wallet_address,
                InvoiceMetadata.buyer_address == g.wallet_address,
            )
        )
        .order_by(InvoiceMetadata.created_at.desc())
    ).scalars()
    return jsonify({"data": [row.to_dict() for row in rows]})
