# Smart Contract Deployment Details

## 1. Deployment Overview

The five SME Flow smart contracts are deployed on the Ethereum Sepolia test network. Deployment and configuration are performed by the Admin wallet.

| Item | Value |
| --- | --- |
| Deployment tool | Remix IDE |
| Solidity source version | `^0.8.20` |
| Compiler version | `0.8.34` |
| EVM version | `osaka` |
| Optimizer | Disabled |
| Admin wallet | `0x4472c64427679B635aCB85F3CF0556442c40c4af` |
| Treasury wallet | `0x4472c64427679B635aCB85F3CF0556442c40c4af` |
| Platform fee | `100 bps` (`1%`) |

## 2. Deployed Contracts

| Contract | Address | Constructor parameters |
| --- | --- | --- |
| RoleRegistry | `0x7Ca082f5D846CF17A98D3de74948bd252c4C95E8` | None; the deploying wallet becomes Admin |
| InvoiceRegistry | `0xABA2fd723372C6E8d66C387770353a7eAD1C2784` | RoleRegistry address |
| FinancingMarket | `0x47818B1e24df8E99d10F5BAf0dA5d59Cd88C2974` | RoleRegistry and InvoiceRegistry addresses |
| FinancingPool | `0x729b397cD11216f5d61CF5Ea84d8AcC710DA9dAa` | RoleRegistry, InvoiceRegistry, FinancingMarket, Treasury and platform fee |
| DisputeResolution | `0x361c6C2222396C81B578689e6887F144504821e1` | RoleRegistry, InvoiceRegistry, FinancingMarket and FinancingPool addresses |

## 3. Deployment Order

1. Deploy `RoleRegistry`.
2. Deploy `InvoiceRegistry` with the RoleRegistry address.
3. Deploy `FinancingMarket` with the RoleRegistry and InvoiceRegistry addresses.
4. Deploy `FinancingPool` with the registry, market, Treasury and fee parameters.
5. Deploy `DisputeResolution` with the four previously deployed contract addresses.

This order is required because later contracts receive earlier contract addresses as immutable constructor parameters.

## 4. Post-Deployment Configuration

After all five contracts are deployed, the Admin wallet performs the following transactions:

1. Call `InvoiceRegistry.configureOperators(market, pool, dispute)`.
2. Call `FinancingMarket.configurePool(pool)`.
3. Call `FinancingMarket.configureDisputeResolution(dispute)`.
4. Call `FinancingPool.configureDisputeResolution(dispute)`.
5. Copy the five deployed addresses into the frontend and backend environment configuration.

The configuration calls restrict cross-contract status changes so that only the registered market, pool and dispute contracts can update the relevant records.
