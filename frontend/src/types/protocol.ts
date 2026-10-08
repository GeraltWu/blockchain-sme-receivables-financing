export const invoiceStatusLabels = [
  'Unknown',
  'Awaiting buyer',
  'Rejected',
  'Confirmed',
  'Financing open',
  'Funded',
  'Repaid',
] as const

export const financingStatusLabels = [
  'Unknown',
  'Open',
  'Offer accepted',
  'Funded',
  'Settled',
  'Cancelled',
  'Expired',
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

export interface RoleRequestRecord {
  account: string
  role: 'Supplier' | 'Buyer' | 'Funder' | 'Auditor' | 'Arbitrator'
  roleIndex: number
  blockNumber: number
}
