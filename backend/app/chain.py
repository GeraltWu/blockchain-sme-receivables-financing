from flask import current_app
from web3 import Web3


class ChainServiceError(RuntimeError):
    pass


INVOICE_COMPONENTS = [
    {"name": "id", "type": "uint256"},
    {"name": "supplier", "type": "address"},
    {"name": "buyer", "type": "address"},
    {"name": "invoiceNumberHash", "type": "bytes32"},
    {"name": "faceValue", "type": "uint256"},
    {"name": "issuedAt", "type": "uint64"},
    {"name": "dueAt", "type": "uint64"},
    {"name": "documentHash", "type": "bytes32"},
    {"name": "status", "type": "uint8"},
]

FINANCING_COMPONENTS = [
    {"name": "id", "type": "uint256"},
    {"name": "invoiceId", "type": "uint256"},
    {"name": "supplier", "type": "address"},
    {"name": "principal", "type": "uint256"},
    {"name": "maxRateBps", "type": "uint16"},
    {"name": "holdbackBps", "type": "uint16"},
    {"name": "deadline", "type": "uint64"},
    {"name": "acceptedAt", "type": "uint64"},
    {"name": "acceptedOfferId", "type": "uint256"},
    {"name": "status", "type": "uint8"},
]

OFFER_COMPONENTS = [
    {"name": "id", "type": "uint256"},
    {"name": "financingId", "type": "uint256"},
    {"name": "funder", "type": "address"},
    {"name": "rateBps", "type": "uint16"},
    {"name": "status", "type": "uint8"},
]

FUNDING_COMPONENTS = [
    {"name": "financingId", "type": "uint256"},
    {"name": "invoiceId", "type": "uint256"},
    {"name": "supplier", "type": "address"},
    {"name": "buyer", "type": "address"},
    {"name": "funder", "type": "address"},
    {"name": "principal", "type": "uint256"},
    {"name": "holdback", "type": "uint256"},
    {"name": "interest", "type": "uint256"},
    {"name": "platformFee", "type": "uint256"},
    {"name": "faceValue", "type": "uint256"},
    {"name": "fundedAt", "type": "uint64"},
    {"name": "settled", "type": "bool"},
    {"name": "overdueAt", "type": "uint64"},
    {"name": "repaymentDeposited", "type": "bool"},
    {"name": "defaulted", "type": "bool"},
    {"name": "principalLoss", "type": "uint256"},
    {"name": "unpaidInterest", "type": "uint256"},
]


def _function(name, inputs, outputs):
    return {
        "type": "function",
        "name": name,
        "stateMutability": "view",
        "inputs": inputs,
        "outputs": outputs,
    }


INVOICE_ABI = [
    _function("invoiceCount", [], [{"name": "", "type": "uint256"}]),
    _function("invoiceIdByKey", [{"name": "invoiceKey", "type": "bytes32"}], [{"name": "", "type": "uint256"}]),
    _function("getInvoice", [{"name": "invoiceId", "type": "uint256"}], [{"name": "", "type": "tuple", "components": INVOICE_COMPONENTS}]),
]

MARKET_ABI = [
    _function("financingCount", [], [{"name": "", "type": "uint256"}]),
    _function("getFinancing", [{"name": "financingId", "type": "uint256"}], [{"name": "", "type": "tuple", "components": FINANCING_COMPONENTS}]),
    _function("getOfferIds", [{"name": "financingId", "type": "uint256"}], [{"name": "", "type": "uint256[]"}]),
    _function("getOffer", [{"name": "offerId", "type": "uint256"}], [{"name": "", "type": "tuple", "components": OFFER_COMPONENTS}]),
]

POOL_ABI = [
    _function("getFunding", [{"name": "financingId", "type": "uint256"}], [{"name": "", "type": "tuple", "components": FUNDING_COMPONENTS}]),
]

ROLE_ABI = [
    _function("admin", [], [{"name": "", "type": "address"}]),
    _function("hasRole", [{"name": "account", "type": "address"}, {"name": "role", "type": "uint8"}], [{"name": "", "type": "bool"}]),
]


class ChainReader:
    def __init__(self, rpc_url, addresses):
        if not rpc_url:
            raise ChainServiceError("Sepolia RPC is not configured.")
        required = ["roleRegistry", "invoiceRegistry", "financingMarket", "financingPool"]
        if any(not Web3.is_address(addresses.get(name, "")) for name in required):
            raise ChainServiceError("Protocol contract addresses are not configured.")
        self.web3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 15}))
        self.role_contract = self.web3.eth.contract(
            address=Web3.to_checksum_address(addresses["roleRegistry"]), abi=ROLE_ABI
        )
        self.invoice_contract = self.web3.eth.contract(
            address=Web3.to_checksum_address(addresses["invoiceRegistry"]), abi=INVOICE_ABI
        )
        self.market_contract = self.web3.eth.contract(
            address=Web3.to_checksum_address(addresses["financingMarket"]), abi=MARKET_ABI
        )
        self.pool_contract = self.web3.eth.contract(
            address=Web3.to_checksum_address(addresses["financingPool"]), abi=POOL_ABI
        )

    def invoices(self):
        try:
            count = min(int(self.invoice_contract.functions.invoiceCount().call()), 500)
            return [self.invoice(invoice_id) for invoice_id in range(1, count + 1)]
        except Exception as exc:
            raise ChainServiceError("Unable to read invoices from Sepolia.") from exc

    def is_admin(self, account):
        try:
            return Web3.to_checksum_address(self.role_contract.functions.admin().call()) == Web3.to_checksum_address(account)
        except Exception as exc:
            raise ChainServiceError("Unable to verify administrator access on Sepolia.") from exc

    def has_role(self, account, role_index):
        try:
            return bool(self.role_contract.functions.hasRole(Web3.to_checksum_address(account), role_index).call())
        except Exception as exc:
            raise ChainServiceError("Unable to verify participant access on Sepolia.") from exc

    def invoice(self, invoice_id):
        try:
            return _record(self.invoice_contract.functions.getInvoice(invoice_id).call(), INVOICE_COMPONENTS)
        except Exception as exc:
            raise ChainServiceError("Invoice was not found on Sepolia.") from exc

    def invoice_id_by_key(self, key):
        try:
            return int(self.invoice_contract.functions.invoiceIdByKey(key).call())
        except Exception as exc:
            raise ChainServiceError("Unable to resolve the invoice key on Sepolia.") from exc

    def financings(self):
        try:
            count = min(int(self.market_contract.functions.financingCount().call()), 500)
            return [self.financing(financing_id) for financing_id in range(1, count + 1)]
        except Exception as exc:
            if isinstance(exc, ChainServiceError):
                raise
            raise ChainServiceError("Unable to read financing requests from Sepolia.") from exc

    def financing(self, financing_id):
        try:
            record = _record(self.market_contract.functions.getFinancing(financing_id).call(), FINANCING_COMPONENTS)
            record["offers"] = self.offers(financing_id)
            return record
        except Exception as exc:
            if isinstance(exc, ChainServiceError):
                raise
            raise ChainServiceError("Financing request was not found on Sepolia.") from exc

    def offers(self, financing_id):
        try:
            offer_ids = self.market_contract.functions.getOfferIds(financing_id).call()
            return [
                _record(self.market_contract.functions.getOffer(offer_id).call(), OFFER_COMPONENTS)
                for offer_id in offer_ids
            ]
        except Exception as exc:
            raise ChainServiceError("Unable to read financing offers from Sepolia.") from exc

    def funding(self, financing_id):
        try:
            return _record(self.pool_contract.functions.getFunding(financing_id).call(), FUNDING_COMPONENTS)
        except Exception:
            return None


def get_chain_reader():
    injected = current_app.extensions.get("protocol_chain_reader")
    if injected is not None:
        return injected
    reader = ChainReader(
        current_app.config["SEPOLIA_RPC_URL"],
        current_app.config["CONTRACT_ADDRESSES"],
    )
    current_app.extensions["protocol_chain_reader"] = reader
    return reader


def _record(values, components):
    result = {}
    for index, component in enumerate(components):
        value = values[index]
        if component["type"].startswith("uint"):
            result[component["name"]] = str(value)
        elif component["type"] == "bytes32":
            result[component["name"]] = Web3.to_hex(value)
        else:
            result[component["name"]] = value
    return result
