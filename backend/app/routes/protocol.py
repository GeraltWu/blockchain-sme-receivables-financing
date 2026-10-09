from flask import Blueprint, current_app, g, jsonify, request
from web3 import Web3

from ..auth import require_auth
from ..chain import ChainServiceError, get_chain_reader
from ..errors import api_error


protocol_bp = Blueprint("protocol", __name__, url_prefix="/api")

INVOICE_STATUSES = ["Unknown", "Awaiting buyer", "Rejected", "Confirmed", "Financing open", "Funded", "Repaid", "Overdue", "Repayment deposited", "Defaulted"]
FINANCING_STATUSES = ["Unknown", "Open", "Offer accepted", "Funded", "Settled", "Cancelled", "Expired", "Overdue", "Defaulted"]
OFFER_STATUSES = ["Unknown", "Active", "Accepted", "Expired"]
ROLE_INDEX = {"supplier": 0, "buyer": 1, "funder": 2, "auditor": 3, "arbitrator": 4}


@protocol_bp.get("/invoices")
@require_auth
def list_invoices():
    try:
        reader = get_chain_reader()
        access = _access(reader)
        rows = reader.invoices()
        status = _status_value(request.args.get("status"), INVOICE_STATUSES)
        if status is False:
            return api_error("INVALID_STATUS", "Invoice status filter is invalid.", 400)
        role = request.args.get("role", "").lower()
        if role and role not in {"supplier", "buyer", "participant"}:
            return api_error("INVALID_ROLE", "Role must be supplier, buyer, or participant.", 400)
        wallet, access_error = _scoped_wallet(access)
        if access_error:
            return access_error
        if status is not None:
            rows = [row for row in rows if int(row["status"]) == status]
        if access["privileged"]:
            if wallet:
                rows = _filter_invoices(rows, wallet, role)
        else:
            rows = _filter_invoices(rows, g.wallet_address, role)
            if not rows and not access["roles"].intersection({"supplier", "buyer"}):
                return _forbidden("A related invoice or active Supplier or Buyer role is required.")
        return _page(rows, INVOICE_STATUSES)
    except ChainServiceError as exc:
        return api_error("RPC_UNAVAILABLE", str(exc), 503)


@protocol_bp.get("/invoices/<int:invoice_id>")
@require_auth
def invoice_detail(invoice_id):
    try:
        reader = get_chain_reader()
        access = _access(reader)
        invoice = _with_status(reader.invoice(invoice_id), INVOICE_STATUSES)
        financing = next((item for item in reader.financings() if int(item["invoiceId"]) == invoice_id), None)
        if not _can_view_invoice(access, invoice, financing):
            return _forbidden("You do not have access to this invoice.")
        if financing:
            financing = _decorate_financing(reader, financing)
        return jsonify({"data": {**invoice, "financing": financing}, "meta": _meta()})
    except ChainServiceError as exc:
        return api_error("NOT_FOUND", str(exc), 404)


@protocol_bp.get("/financing-requests")
@require_auth
def list_financing_requests():
    try:
        reader = get_chain_reader()
        access = _access(reader)
        rows = reader.financings()
        status = _status_value(request.args.get("status"), FINANCING_STATUSES)
        if status is False:
            return api_error("INVALID_STATUS", "Financing status filter is invalid.", 400)
        invoice_id = request.args.get("invoiceId")
        if invoice_id and not invoice_id.isdigit():
            return api_error("INVALID_INVOICE", "Invoice ID filter is invalid.", 400)
        role = request.args.get("role", "").lower()
        if role and role not in {"supplier", "buyer", "funder", "participant"}:
            return api_error("INVALID_ROLE", "Role must be supplier, buyer, funder, or participant.", 400)
        wallet, access_error = _scoped_wallet(access)
        if access_error:
            return access_error
        if status is not None:
            rows = [row for row in rows if int(row["status"]) == status]
        if invoice_id:
            rows = [row for row in rows if row["invoiceId"] == invoice_id]
        if access["privileged"]:
            if wallet:
                rows = _filter_financings(reader, rows, wallet, role, access)
        else:
            rows = _filter_financings(reader, rows, g.wallet_address, role, access)
            if not rows and not access["roles"].intersection({"supplier", "buyer", "funder"}):
                return _forbidden("A related financing record or active participant role is required.")
        return _page(rows, FINANCING_STATUSES, nested_offer_status=True)
    except ChainServiceError as exc:
        return api_error("RPC_UNAVAILABLE", str(exc), 503)


@protocol_bp.get("/financing-requests/<int:financing_id>")
@require_auth
def financing_detail(financing_id):
    try:
        reader = get_chain_reader()
        access = _access(reader)
        financing = reader.financing(financing_id)
        invoice = reader.invoice(int(financing["invoiceId"]))
        if not _can_view_financing(access, financing, invoice):
            return _forbidden("You do not have access to this financing request.")
        financing = _decorate_financing(reader, financing)
        financing["invoice"] = _with_status(invoice, INVOICE_STATUSES)
        return jsonify({"data": financing, "meta": _meta()})
    except ChainServiceError as exc:
        return api_error("NOT_FOUND", str(exc), 404)


@protocol_bp.get("/financing-requests/<int:financing_id>/offers")
@require_auth
def financing_offers(financing_id):
    try:
        reader = get_chain_reader()
        access = _access(reader)
        financing = reader.financing(financing_id)
        rows = list(financing["offers"])
        status = _status_value(request.args.get("status"), OFFER_STATUSES)
        if status is False:
            return api_error("INVALID_STATUS", "Offer status filter is invalid.", 400)
        wallet, access_error = _scoped_wallet(access)
        if access_error:
            return access_error
        if status is not None:
            rows = [row for row in rows if int(row["status"]) == status]
        is_supplier = _same(financing["supplier"], g.wallet_address)
        if not access["privileged"] and not is_supplier:
            rows = [row for row in rows if _same(row["funder"], g.wallet_address)]
            if not rows:
                return _forbidden("Only the supplier, an offer owner, Auditor, or Admin can view these offers.")
        elif access["privileged"] and wallet:
            rows = [row for row in rows if _same(row["funder"], wallet)]
        return _page(rows, OFFER_STATUSES)
    except ChainServiceError as exc:
        return api_error("NOT_FOUND", str(exc), 404)


def _access(reader):
    roles = {name for name, index in ROLE_INDEX.items() if reader.has_role(g.wallet_address, index)}
    admin = reader.is_admin(g.wallet_address)
    return {"roles": roles, "admin": admin, "privileged": admin or "auditor" in roles}


def _scoped_wallet(access):
    value = request.args.get("wallet")
    if value is None and request.args.get("mine", "").lower() in {"1", "true", "yes"}:
        value = g.wallet_address
    if value in {None, ""}:
        return None, None
    if not Web3.is_address(value):
        return None, api_error("INVALID_ADDRESS", "Wallet filter is invalid.", 400)
    wallet = Web3.to_checksum_address(value)
    if not access["privileged"] and not _same(wallet, g.wallet_address):
        return None, _forbidden("Only Auditor or Admin can query another wallet.")
    return wallet, None


def _filter_invoices(rows, wallet, role):
    if role == "supplier":
        return [row for row in rows if _same(row["supplier"], wallet)]
    if role == "buyer":
        return [row for row in rows if _same(row["buyer"], wallet)]
    return [row for row in rows if _same(row["supplier"], wallet) or _same(row["buyer"], wallet)]


def _filter_financings(reader, rows, wallet, role, access):
    invoice_by_id = None

    def is_buyer(row):
        nonlocal invoice_by_id
        if invoice_by_id is None:
            invoice_by_id = {item["id"]: item for item in reader.invoices()}
        invoice = invoice_by_id.get(row["invoiceId"])
        return bool(invoice and _same(invoice["buyer"], wallet))

    def is_funder(row):
        owns_offer = any(_same(offer["funder"], wallet) for offer in row["offers"])
        open_opportunity = "funder" in access["roles"] and int(row["status"]) == 1 and not _same(row["supplier"], wallet)
        return owns_offer or open_opportunity

    if role == "supplier":
        return [row for row in rows if _same(row["supplier"], wallet)]
    if role == "buyer":
        return [row for row in rows if is_buyer(row)]
    if role == "funder":
        return [row for row in rows if is_funder(row)]
    return [row for row in rows if _same(row["supplier"], wallet) or is_funder(row) or is_buyer(row)]


def _can_view_invoice(access, invoice, financing):
    if access["privileged"]:
        return True
    if _same(invoice["supplier"], g.wallet_address) or _same(invoice["buyer"], g.wallet_address):
        return True
    if financing:
        owns_offer = any(_same(item["funder"], g.wallet_address) for item in financing["offers"])
        return owns_offer or ("funder" in access["roles"] and int(financing["status"]) == 1)
    return False


def _can_view_financing(access, financing, invoice):
    if access["privileged"]:
        return True
    if _same(financing["supplier"], g.wallet_address) or _same(invoice["buyer"], g.wallet_address):
        return True
    owns_offer = any(_same(item["funder"], g.wallet_address) for item in financing["offers"])
    return owns_offer or ("funder" in access["roles"] and int(financing["status"]) == 1)


def _decorate_financing(reader, financing):
    result = _with_status(financing, FINANCING_STATUSES)
    result["offers"] = [_with_status(item, OFFER_STATUSES) for item in financing["offers"]]
    result["funding"] = reader.funding(int(financing["id"]))
    return result


def _status_value(value, labels):
    if value in {None, ""}:
        return None
    if value.isdigit() and 0 <= int(value) < len(labels):
        return int(value)
    normalized = value.replace("_", " ").replace("-", " ").lower()
    return next((index for index, label in enumerate(labels) if label.lower() == normalized), False)


def _page(rows, labels, nested_offer_status=False):
    try:
        cursor = max(int(request.args.get("cursor", "0")), 0)
        limit = min(max(int(request.args.get("limit", "20")), 1), 100)
    except ValueError:
        return api_error("INVALID_PAGINATION", "Cursor and limit must be integers.", 400)
    ordered = sorted(rows, key=lambda row: int(row["id"]), reverse=True)
    data = [_with_status(dict(row), labels) for row in ordered[cursor:cursor + limit]]
    if nested_offer_status:
        for row in data:
            row["offers"] = [_with_status(dict(item), OFFER_STATUSES) for item in row["offers"]]
    next_cursor = cursor + limit if cursor + limit < len(ordered) else None
    return jsonify({"data": data, "meta": {**_meta(), "total": len(ordered), "nextCursor": next_cursor}})


def _with_status(row, labels):
    result = dict(row)
    status = int(result["status"])
    result["statusLabel"] = labels[status] if status < len(labels) else "Unknown"
    return result


def _forbidden(message):
    return api_error("FORBIDDEN", message, 403)


def _same(left, right):
    return left.lower() == right.lower()


def _meta():
    return {"chainId": current_app.config["CHAIN_ID"], "source": "live-rpc"}
