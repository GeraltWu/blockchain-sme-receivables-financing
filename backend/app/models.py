from datetime import datetime, timezone

from .extensions import db


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class WalletNonce(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    wallet_address = db.Column(db.String(42), nullable=False, index=True)
    nonce = db.Column(db.String(64), nullable=False, unique=True)
    message = db.Column(db.Text, nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    used_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), default=utc_now, nullable=False)


class AuthSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    wallet_address = db.Column(db.String(42), nullable=False, index=True)
    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=utc_now, nullable=False)


class InvoiceMetadata(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    wallet_address = db.Column(db.String(42), nullable=False, index=True)
    invoice_number = db.Column(db.String(120), nullable=False)
    buyer_address = db.Column(db.String(42), nullable=False)
    face_value_wei = db.Column(db.String(78), nullable=False)
    issued_at = db.Column(db.DateTime(timezone=True), nullable=False)
    due_at = db.Column(db.DateTime(timezone=True), nullable=False)
    document_hash = db.Column(db.String(66), nullable=False)
    onchain_invoice_id = db.Column(db.String(78), index=True)
    submit_tx_hash = db.Column(db.String(66), unique=True)
    created_at = db.Column(db.DateTime(timezone=True), default=utc_now, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "supplier": self.wallet_address,
            "buyer": self.buyer_address,
            "invoiceNumber": self.invoice_number,
            "faceValue": self.face_value_wei,
            "issuedAt": self.issued_at.isoformat(),
            "dueAt": self.due_at.isoformat(),
            "documentHash": self.document_hash,
            "onchainInvoiceId": self.onchain_invoice_id,
            "submitTxHash": self.submit_tx_hash,
            "createdAt": self.created_at.isoformat(),
        }


class TransactionRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    chain_id = db.Column(db.Integer, nullable=False, default=11155111)
    tx_hash = db.Column(db.String(66), nullable=False, unique=True, index=True)
    wallet_address = db.Column(db.String(42), nullable=False, index=True)
    contract_name = db.Column(db.String(40), nullable=False)
    action = db.Column(db.String(80), nullable=False)
    value_wei = db.Column(db.String(78), nullable=False, default="0")
    status = db.Column(db.String(20), nullable=False)
    block_number = db.Column(db.Integer)
    created_at = db.Column(db.DateTime(timezone=True), default=utc_now, nullable=False)

    def to_dict(self) -> dict:
        return {
            "chainId": self.chain_id,
            "txHash": self.tx_hash,
            "wallet": self.wallet_address,
            "contractName": self.contract_name,
            "action": self.action,
            "value": self.value_wei,
            "status": self.status,
            "blockNumber": self.block_number,
            "createdAt": self.created_at.isoformat(),
        }
