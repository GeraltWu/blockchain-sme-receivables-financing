import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    DEBUG = os.getenv("FLASK_DEBUG", "0").lower() in {"1", "true", "yes"}
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///receivables.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
    SEPOLIA_RPC_URL = os.getenv("SEPOLIA_RPC_URL", "")
    CHAIN_ID = 11155111
    AUTH_TOKEN_TTL_SECONDS = int(os.getenv("AUTH_TOKEN_TTL_SECONDS", "28800"))
    NONCE_TTL_SECONDS = int(os.getenv("NONCE_TTL_SECONDS", "300"))
    CONTRACT_ADDRESSES = {
        "roleRegistry": os.getenv("ROLE_REGISTRY_ADDRESS", ""),
        "invoiceRegistry": os.getenv("INVOICE_REGISTRY_ADDRESS", ""),
        "financingMarket": os.getenv("FINANCING_MARKET_ADDRESS", ""),
        "financingPool": os.getenv("FINANCING_POOL_ADDRESS", ""),
    }
