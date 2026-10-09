export const invoiceStatusLabels = [
  'Unknown',
  'Awaiting buyer',
  'Rejected',
  'Confirmed',
  'Financing open',
  'Funded',
  'Repaid',
  'Overdue',
  'Repayment deposited',
  'Defaulted',
] as const

export const financingStatusLabels = [
  'Unknown',
  'Open',
  'Offer accepted',
  'Funded',
  'Settled',
  'Cancelled',
  'Expired',
  'Overdue',
  'Defaulted',
] as const

export const offerStatusLabels = ['Unknown', 'Active', 'Accepted', 'Expired'] as const

export interface InvoiceRecord {
  id: bigint
  supplier: string
  buyer: string
  invoiceNumberHash: string
  faceValue: bigint
  issuedAt: number
  dueAt: number
  documentHash: string
  status: number
}

export interface OfferRecord {
  id: bigint
  financingId: bigint
  funder: string
  rateBps: number
  status: number
}

export interface FinancingRecord {
  id: bigint
  invoiceId: bigint
  supplier: string
  principal: bigint
  maxRateBps: number
  holdbackBps: number
  deadline: number
  acceptedAt: number
  acceptedOfferId: bigint
  status: number
  offers: OfferRecord[]
}

export interface FundingRecord {
  financingId: bigint
  invoiceId: bigint
  supplier: string
  buyer: string
  funder: string
  principal: bigint
  holdback: bigint
  interest: bigint
  platformFee: bigint
  faceValue: bigint
  fundedAt: number
  settled: boolean
  overdueAt: number
  repaymentDeposited: boolean
  defaulted: boolean
  principalLoss: bigint
  unpaidInterest: bigint
}

export const disputeStatusLabels = ['Unknown', 'Open', 'Resolved'] as const
export const disputeRulingLabels = ['None', 'Resume', 'Cancel financing', 'Confirm default'] as const

export interface EvidenceRecord {
  submitter: string
  evidenceHash: string
  submittedAt: number
}

export interface DisputeRecord {
  id: bigint
  invoiceId: bigint
  openedBy: string
  reasonHash: string
  status: number
  ruling: number
  openedAt: number
  resolvedAt: number
  arbitrator: string
  evidence: EvidenceRecord[]
}

export interface RoleRequestRecord {
  account: string
  role: 'Supplier' | 'Buyer' | 'Funder' | 'Auditor' | 'Arbitrator'
  roleIndex: number
  blockNumber: number
}

export interface AuditEventRecord {
  id: string
  contract: 'roleRegistry' | 'invoiceRegistry' | 'financingMarket' | 'financingPool' | 'disputeResolution'
  eventName: string
  transactionHash: string
  blockNumber: number
  logIndex: number
  timestamp: number
  payload: Record<string, string | boolean>
}
