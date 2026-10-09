from datetime import datetime, timezone

from web3 import Web3


def utc_timestamp(value: datetime) -> int:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.astimezone(timezone.utc).timestamp())


def invoice_key(
    chain_id: int,
    supplier: str,
    buyer: str,
    invoice_number: str,
    issued_at: datetime,
):
    web3 = Web3()
    return Web3.keccak(
        web3.codec.encode(
            ["uint256", "address", "address", "bytes32", "uint64"],
            [
                chain_id,
                Web3.to_checksum_address(supplier),
                Web3.to_checksum_address(buyer),
                Web3.keccak(text=invoice_number),
                utc_timestamp(issued_at),
            ],
        )
    )
