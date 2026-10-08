from eth_account import Account
from eth_account.messages import encode_defunct

from app import create_app
from app.config import Config


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
