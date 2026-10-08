import type { TransactionResponse } from 'ethers'

export type PageKey = 'home' | 'activity' | 'transactions' | 'profile'

export type ActivitySection = 'invoices' | 'financing' | 'roles'

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

export type TransactionRunner = (
  action: string,
  contract: ContractName,
  send: () => Promise<TransactionResponse>,
) => Promise<void>

