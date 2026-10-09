from datetime import datetime

from eth_account import Account
from eth_account.messages import encode_defunct
from hexbytes import HexBytes
from web3 import Web3

from app import create_app
from app.config import Config
from app.extensions import db
from app.invoice_keys import invoice_key, utc_timestamp
from app.models import InvoiceMetadata
from app.routes.invoices import _recover_invoice_link
from app.routes.transactions import _link_invoice_metadata


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"


def test_health_endpoint():
    app = create_app(TestConfig)
    client = app.test_client()

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok", "database": "ok"}


def test_public_config_reports_unconfigured_contracts():
    app = create_app(TestConfig)
    client = app.test_client()

    response = client.get("/api/config")

    assert response.status_code == 200
    assert response.get_json()["chainId"] == 11155111
    assert response.get_json()["settlementAsset"] == "native-ETH"


def test_wallet_sign_in_and_invoice_metadata():
    app = create_app(TestConfig)
    client = app.test_client()
    wallet = Account.create()
    buyer = Account.create()
    auditor = Account.create()
    app.extensions["protocol_chain_reader"] = type(
        "SupplierRoleReader", (), {"has_role": lambda self, account, role: (
            role == 0 and account.lower() == wallet.address.lower()
        ) or (
            role == 1 and account.lower() == buyer.address.lower()
        ) or (
            role == 3 and account.lower() == auditor.address.lower()
        )}
    )()

    nonce_response = client.post(
        "/api/auth/nonce",
        json={"address": wallet.address, "chainId": 11155111},
    )
    assert nonce_response.status_code == 200
    message = nonce_response.get_json()["message"]
    signature = Account.sign_message(
        encode_defunct(text=message), private_key=wallet.key
    ).signature.hex()

    verify_response = client.post(
        "/api/auth/verify",
        json={"address": wallet.address, "message": message, "signature": signature},
    )
    assert verify_response.status_code == 200
    token = verify_response.get_json()["sessionToken"]
    headers = {"Authorization": f"Bearer {token}"}

    session_response = client.get("/api/auth/me", headers=headers)
    assert session_response.status_code == 200
    assert session_response.get_json()["wallet"] == wallet.address

    metadata_response = client.post(
        "/api/invoices/metadata",
        headers=headers,
        json={
            "invoiceNumber": "INV-001",
            "buyer": buyer.address,
            "faceValue": "100000000000000000",
            "issuedAt": "2026-10-08T00:00:00Z",
            "dueAt": "2026-11-08T00:00:00Z",
            "documentHash": "0x" + "12" * 32,
        },
    )
    assert metadata_response.status_code == 201
    assert metadata_response.get_json()["data"]["invoiceNumber"] == "INV-001"

    list_response = client.get("/api/invoices/metadata", headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.get_json()["data"]) == 1

    buyer_nonce = client.post(
        "/api/auth/nonce",
        json={"address": buyer.address, "chainId": 11155111},
    ).get_json()["message"]
    buyer_signature = Account.sign_message(
        encode_defunct(text=buyer_nonce), private_key=buyer.key
    ).signature.hex()
    buyer_token = client.post(
        "/api/auth/verify",
        json={
            "address": buyer.address,
            "message": buyer_nonce,
            "signature": buyer_signature,
        },
    ).get_json()["sessionToken"]
    buyer_response = client.get(
        "/api/invoices/metadata",
        headers={"Authorization": f"Bearer {buyer_token}"},
    )
    assert buyer_response.status_code == 200
    assert buyer_response.get_json()["data"][0]["invoiceNumber"] == "INV-001"
    buyer_create = client.post(
        "/api/invoices/metadata",
        headers={"Authorization": f"Bearer {buyer_token}"},
        json={
            "invoiceNumber": "INV-DENIED",
            "buyer": wallet.address,
            "faceValue": "1",
            "issuedAt": "2026-10-08T00:00:00Z",
            "dueAt": "2026-11-08T00:00:00Z",
            "documentHash": "0x" + "12" * 32,
        },
    )
    assert buyer_create.status_code == 403

    auditor_headers = sign_in(client, auditor)
    auditor_response = client.get("/api/invoices/metadata", headers=auditor_headers)
    assert auditor_response.status_code == 200
    assert auditor_response.get_json()["data"][0]["invoiceNumber"] == "INV-001"


def test_invoice_submission_event_links_metadata():
    app = create_app(TestConfig)
    supplier = Account.create()
    buyer = Account.create()
    registry = Account.create().address
    web3 = Web3()
    metadata = InvoiceMetadata(
        wallet_address=supplier.address,
        invoice_number="INV-LINK-001",
        buyer_address=buyer.address,
        face_value_wei="100000000000000000",
        issued_at=datetime.fromisoformat("2026-10-08T00:00:00+00:00"),
        due_at=datetime.fromisoformat("2026-11-08T00:00:00+00:00"),
        document_hash="0x" + "12" * 32,
    )
    invoice_key = Web3.keccak(web3.codec.encode(
        ["uint256", "address", "address", "bytes32", "uint64"],
        [
            TestConfig.CHAIN_ID,
            supplier.address,
            buyer.address,
            Web3.keccak(text=metadata.invoice_number),
            int(metadata.issued_at.timestamp()),
        ],
    ))
    receipt = {
        "logs": [{
            "address": registry,
            "topics": [
                Web3.keccak(text="InvoiceSubmitted(uint256,bytes32,address,address,uint256)"),
                HexBytes((42).to_bytes(32, byteorder="big")),
                invoice_key,
                HexBytes(bytes.fromhex("00" * 12 + supplier.address[2:])),
            ],
            "data": HexBytes(web3.codec.encode(["address", "uint256"], [buyer.address, int(metadata.face_value_wei)])),
        }]
    }

    with app.app_context():
        db.session.add(metadata)
        db.session.commit()
        metadata_id = metadata.id
        db.session.expire_all()
        metadata = db.session.get(InvoiceMetadata, metadata_id)
        assert metadata is not None
        assert metadata.issued_at.tzinfo is None
        result = _link_invoice_metadata(web3, receipt, registry, metadata, "0x" + "ab" * 32)

    assert result is None
    assert metadata.onchain_invoice_id == "42"
    assert metadata.submit_tx_hash == "0x" + "ab" * 32


def test_invoice_link_recovery_uses_utc_for_sqlite_datetime():
    app = create_app(TestConfig)
    supplier = Account.create()
    buyer = Account.create()
    issued_at = datetime.fromisoformat("2026-10-08T00:00:00+00:00")
    due_at = datetime.fromisoformat("2026-11-08T00:00:00+00:00")
    document_hash = "0x" + "12" * 32
    metadata = InvoiceMetadata(
        wallet_address=supplier.address,
        invoice_number="INV-RECOVER-001",
        buyer_address=buyer.address,
        face_value_wei="100000000000000000",
        issued_at=issued_at,
        due_at=due_at,
        document_hash=document_hash,
    )

    class RecoveryReader:
        def invoice_id_by_key(self, key):
            expected = invoice_key(
                TestConfig.CHAIN_ID,
                supplier.address,
                buyer.address,
                metadata.invoice_number,
                issued_at,
            )
            return 42 if key == expected else 0

        def invoice(self, invoice_id):
            assert invoice_id == 42
            return {
                "supplier": supplier.address,
                "buyer": buyer.address,
                "invoiceNumberHash": Web3.to_hex(Web3.keccak(text=metadata.invoice_number)),
                "faceValue": metadata.face_value_wei,
                "issuedAt": str(utc_timestamp(issued_at)),
                "dueAt": str(utc_timestamp(due_at)),
                "documentHash": document_hash,
            }

    with app.app_context():
        db.session.add(metadata)
        db.session.commit()
        metadata_id = metadata.id
        db.session.expire_all()
        metadata = db.session.get(InvoiceMetadata, metadata_id)
        assert metadata.issued_at.tzinfo is None
        assert _recover_invoice_link(RecoveryReader(), metadata)
        assert metadata.onchain_invoice_id == "42"


class FakeChainReader:
    def __init__(self, supplier, buyer, funder, auditor):
        self._roles = {
            (supplier.lower(), 0),
            (buyer.lower(), 1),
            (funder.lower(), 2),
            (auditor.lower(), 3),
        }
        self._invoices = [
            {"id": "1", "supplier": supplier, "buyer": buyer, "invoiceNumberHash": "0x" + "11" * 32, "faceValue": "100", "issuedAt": "10", "dueAt": "20", "documentHash": "0x" + "22" * 32, "status": "3"},
            {"id": "2", "supplier": buyer, "buyer": supplier, "invoiceNumberHash": "0x" + "33" * 32, "faceValue": "200", "issuedAt": "11", "dueAt": "21", "documentHash": "0x" + "44" * 32, "status": "1"},
        ]
        self._offers = [{"id": "7", "financingId": "5", "funder": funder, "rateBps": "600", "status": "1"}]
        self._financings = [{"id": "5", "invoiceId": "1", "supplier": supplier, "principal": "80", "maxRateBps": "800", "holdbackBps": "1000", "deadline": "19", "acceptedAt": "0", "acceptedOfferId": "0", "status": "1", "offers": self._offers}]

    def invoices(self):
        return self._invoices

    def has_role(self, account, role_index):
        return (account.lower(), role_index) in self._roles

    def is_admin(self, account):
        return False

    def invoice(self, invoice_id):
        return next(item for item in self._invoices if int(item["id"]) == invoice_id)

    def financings(self):
        return self._financings

    def financing(self, financing_id):
        return next(item for item in self._financings if int(item["id"]) == financing_id)

    def offers(self, financing_id):
        return [item for item in self._offers if int(item["financingId"]) == financing_id]

    def funding(self, financing_id):
        return None


def sign_in(client, wallet):
    message = client.post(
        "/api/auth/nonce", json={"address": wallet.address, "chainId": 11155111}
    ).get_json()["message"]
    signature = Account.sign_message(
        encode_defunct(text=message), private_key=wallet.key
    ).signature.hex()
    token = client.post(
        "/api/auth/verify",
        json={"address": wallet.address, "message": message, "signature": signature},
    ).get_json()["sessionToken"]
    return {"Authorization": f"Bearer {token}"}


def test_protocol_query_filters_and_details():
    app = create_app(TestConfig)
    client = app.test_client()
    supplier = Account.create()
    buyer = Account.create()
    funder = Account.create()
    auditor = Account.create()
    app.extensions["protocol_chain_reader"] = FakeChainReader(
        supplier.address, buyer.address, funder.address, auditor.address
    )
    assert client.get("/api/invoices").status_code == 401
    headers = sign_in(client, supplier)

    invoices = client.get(
        f"/api/invoices?status=confirmed&role=supplier&wallet={supplier.address}",
        headers=headers,
    )
    assert invoices.status_code == 200
    assert invoices.get_json()["data"][0]["statusLabel"] == "Confirmed"
    assert invoices.get_json()["meta"]["total"] == 1

    invoice = client.get("/api/invoices/1", headers=headers)
    assert invoice.status_code == 200
    assert invoice.get_json()["data"]["financing"]["offers"][0]["statusLabel"] == "Active"

    forbidden = client.get(
        f"/api/financing-requests?status=open&role=funder&wallet={funder.address}",
        headers=headers,
    )
    assert forbidden.status_code == 403

    funder_headers = sign_in(client, funder)
    financings = client.get(
        "/api/financing-requests?status=open&role=funder&mine=true",
        headers=funder_headers,
    )
    assert financings.status_code == 200
    assert financings.get_json()["data"][0]["id"] == "5"

    # Revoking a role prevents new role-gated work, but does not hide an
    # existing offer or the invoice needed to understand that commitment.
    app.extensions["protocol_chain_reader"]._roles.remove((funder.address.lower(), 2))
    existing_financing = client.get(
        "/api/financing-requests?role=funder&mine=true", headers=funder_headers
    )
    assert existing_financing.status_code == 200
    assert existing_financing.get_json()["data"][0]["id"] == "5"
    assert client.get("/api/invoices/1", headers=funder_headers).status_code == 200

    offers = client.get(
        "/api/financing-requests/5/offers?status=active", headers=headers
    )
    assert offers.status_code == 200
    assert offers.get_json()["data"][0]["rateBps"] == "600"

    invalid = client.get("/api/invoices?status=not-a-status", headers=headers)
    assert invalid.status_code == 400
    invalid_wallet = client.get("/api/invoices?wallet=invalid", headers=headers)
    assert invalid_wallet.status_code == 400

    auditor_headers = sign_in(client, auditor)
    audit_view = client.get("/api/invoices", headers=auditor_headers)
    assert audit_view.status_code == 200
    assert audit_view.get_json()["meta"]["total"] == 2

    outsider_headers = sign_in(client, Account.create())
    assert client.get("/api/invoices", headers=outsider_headers).status_code == 403
