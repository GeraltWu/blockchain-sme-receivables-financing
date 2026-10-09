import type { ContractName } from '../types/domain'

export const SEPOLIA_CHAIN_ID = 11155111n
export const SEPOLIA_CHAIN_HEX = '0xaa36a7'

export const contractAddresses: Record<ContractName, string> = {
  roleRegistry: import.meta.env.VITE_ROLE_REGISTRY_ADDRESS ?? '',
  invoiceRegistry: import.meta.env.VITE_INVOICE_REGISTRY_ADDRESS ?? '',
  financingMarket: import.meta.env.VITE_FINANCING_MARKET_ADDRESS ?? '',
  financingPool: import.meta.env.VITE_FINANCING_POOL_ADDRESS ?? '',
  disputeResolution: import.meta.env.VITE_DISPUTE_RESOLUTION_ADDRESS ?? '',
}

export const contractsConfigured = Object.values(contractAddresses).every(Boolean)

