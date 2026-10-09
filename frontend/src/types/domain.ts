import type { TransactionResponse } from 'ethers'

export type PageKey = 'home' | 'activity' | 'transactions' | 'profile' | 'roles'

export type ActivitySection = 'invoices' | 'financing' | 'disputes' | 'audit'

export type UserRole = 'Supplier' | 'Buyer' | 'Funder' | 'Auditor' | 'Arbitrator' | 'Admin'

export type RoleState = 'active' | 'pending' | 'inactive'

export type ActionFeedback = {
  type: 'success' | 'error' | 'info'
  title: string
  message: string
}

export type ContractName =
  | 'roleRegistry'
  | 'invoiceRegistry'
  | 'financingMarket'
  | 'financingPool'
  | 'disputeResolution'

export type TransactionStatus = 'awaiting_signature' | 'confirming' | 'confirmed' | 'failed' | 'cancelled'
export type SyncStatus = 'verifying' | 'verified' | 'failed'

export interface TransactionItem {
  id: string
  walletAddress: string
  action: string
  contract: ContractName
  hash?: string
  status: TransactionStatus
  createdAt: string
  syncStatus?: SyncStatus
  syncError?: string
  error?: string
}

export type TransactionSubmission = TransactionResponse | {
  transaction: TransactionResponse
  metadataId?: string
}

export interface TransactionSummary {
  contractAddress: string
  value: bigint
  estimatedGas: bigint
  estimatedNetworkFee: bigint
  walletBalance: bigint
}

export interface PreparedTransaction {
  summary: TransactionSummary
  send: () => Promise<TransactionSubmission>
}

export type TransactionRunner = (
  action: string,
  contract: ContractName,
  prepare: () => Promise<PreparedTransaction>,
) => Promise<void>

