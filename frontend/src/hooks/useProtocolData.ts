import { useCallback, useEffect, useState } from 'react'
import type { JsonRpcSigner, Provider } from 'ethers'
import { contractAddresses, contractsConfigured } from '../config/contracts'
import { getWritableContract } from '../services/contracts'
import type { RoleState, UserRole } from '../types/domain'
import type { DisputeRecord, EvidenceRecord, FinancingRecord, FundingRecord, InvoiceRecord, OfferRecord, RoleRequestRecord } from '../types/protocol'
import { errorMessage } from './useWallet'

const participantRoles = ['Supplier', 'Buyer', 'Funder', 'Auditor', 'Arbitrator'] as const
const emptyRoleStates: Record<UserRole, RoleState> = {
  Supplier: 'inactive',
  Buyer: 'inactive',
  Funder: 'inactive',
  Auditor: 'inactive',
  Arbitrator: 'inactive',
  Admin: 'inactive',
}

interface ProtocolState {
  loading: boolean
  error?: string
  roleStates: Record<UserRole, RoleState>
  invoices: InvoiceRecord[]
  financings: FinancingRecord[]
  fundings: FundingRecord[]
  platformFeeBps: number
  gracePeriod: number
  disputes: DisputeRecord[]
  roleRequests: RoleRequestRecord[]
  activeRoleAssignments: RoleRequestRecord[]
  roleRequestsError?: string
}

const deploymentBlockCache = new Map<string, Promise<number>>()

export function useProtocolData(signer: JsonRpcSigner | undefined, address: string, isSepolia: boolean, version: number) {
  const [state, setState] = useState<ProtocolState>({
    loading: false,
    roleStates: emptyRoleStates,
    invoices: [],
    financings: [],
    fundings: [],
    platformFeeBps: 0,
    gracePeriod: 0,
    disputes: [],
    roleRequests: [],
    activeRoleAssignments: [],
  })

  const load = useCallback(async () => {
    if (!signer || !address || !isSepolia || !contractsConfigured) {
      setState({ loading: false, roleStates: emptyRoleStates, invoices: [], financings: [], fundings: [], platformFeeBps: 0, gracePeriod: 0, disputes: [], roleRequests: [], activeRoleAssignments: [] })
      return
    }

    setState((current) => ({ ...current, loading: true, error: undefined }))
    try {
      const roleContract = getWritableContract('roleRegistry', signer)
      const invoiceContract = getWritableContract('invoiceRegistry', signer)
      const marketContract = getWritableContract('financingMarket', signer)
      const poolContract = getWritableContract('financingPool', signer)
      const disputeContract = getWritableContract('disputeResolution', signer)

      const [admin, rolePairs, invoiceCountValue, financingCountValue, platformFeeBpsValue, gracePeriodValue, disputeCountValue] = await Promise.all([
        roleContract.getFunction('admin')(),
        Promise.all(participantRoles.map(async (_, index) => Promise.all([
          roleContract.getFunction('hasRole')(address, index),
          roleContract.getFunction('roleRequested')(address, index),
        ]))),
        invoiceContract.getFunction('invoiceCount')(),
        marketContract.getFunction('financingCount')(),
        poolContract.getFunction('platformFeeBps')(),
        poolContract.getFunction('GRACE_PERIOD')(),
        disputeContract.getFunction('disputeCount')(),
      ])

      const roleStates = { ...emptyRoleStates }
      participantRoles.forEach((role, index) => {
        const [active, pending] = rolePairs[index]
        roleStates[role] = active ? 'active' : pending ? 'pending' : 'inactive'
      })
      roleStates.Admin = String(admin).toLowerCase() === address.toLowerCase() ? 'active' : 'inactive'

      let roleRequests: RoleRequestRecord[] = []
      let activeRoleAssignments: RoleRequestRecord[] = []
      let roleRequestsError: string | undefined
      if (roleStates.Admin === 'active') {
        try {
          const latestBlock = await signer.provider.getBlockNumber()
          const deploymentBlock = await getDeploymentBlock(signer.provider, contractAddresses.roleRegistry, latestBlock)
          const [requestEvents, approvedEvents] = await Promise.all([
            queryRoleEvents(roleContract, 'RoleRequested', deploymentBlock, latestBlock),
            queryRoleEvents(roleContract, 'RoleApproved', deploymentBlock, latestBlock),
          ])
          const uniqueRequests = new Map<string, RoleRequestRecord>()
          for (const event of requestEvents) {
            if (!('args' in event)) continue
            const args = event.args as unknown as Record<string | number, unknown>
            const account = String(args.account ?? args[0])
            const roleIndex = Number(args.role ?? args[1])
            const roleName = participantRoles[roleIndex]
            if (!roleName) continue
            uniqueRequests.set(`${account.toLowerCase()}:${roleIndex}`, {
              account,
              role: roleName,
              roleIndex,
              blockNumber: event.blockNumber,
            })
          }
          const checkedRequests = await Promise.all(Array.from(uniqueRequests.values()).map(async (request) => ({
            request,
            pending: Boolean(await roleContract.getFunction('roleRequested')(request.account, request.roleIndex)),
          })))
          roleRequests = checkedRequests
            .filter((item) => item.pending)
            .map((item) => item.request)
            .sort((a, b) => b.blockNumber - a.blockNumber)

          const approvedAssignments = new Map<string, RoleRequestRecord>()
          for (const event of approvedEvents) {
            if (!('args' in event)) continue
            const args = event.args as unknown as Record<string | number, unknown>
            const account = String(args.account ?? args[0])
            const roleIndex = Number(args.role ?? args[1])
            const roleName = participantRoles[roleIndex]
            if (!roleName) continue
            approvedAssignments.set(`${account.toLowerCase()}:${roleIndex}`, {
              account,
              role: roleName,
              roleIndex,
              blockNumber: event.blockNumber,
            })
          }
          const checkedAssignments = await Promise.all(Array.from(approvedAssignments.values()).map(async (assignment) => ({
            assignment,
            active: Boolean(await roleContract.getFunction('hasRole')(assignment.account, assignment.roleIndex)),
          })))
          activeRoleAssignments = checkedAssignments
            .filter((item) => item.active)
            .map((item) => item.assignment)
            .sort((a, b) => b.blockNumber - a.blockNumber)
        } catch (error) {
          roleRequestsError = errorMessage(error)
        }
      }

      const invoiceCount = Math.min(Number(invoiceCountValue), 200)
      const financingCount = Math.min(Number(financingCountValue), 200)
      const invoiceValues = await Promise.all(
        Array.from({ length: invoiceCount }, (_, index) => invoiceContract.getFunction('getInvoice')(index + 1)),
      )
      const invoices: InvoiceRecord[] = invoiceValues.map((record) => ({
        id: BigInt(record.id ?? record[0]),
        supplier: String(record.supplier ?? record[1]),
        buyer: String(record.buyer ?? record[2]),
        invoiceNumberHash: String(record.invoiceNumberHash ?? record[3]),
        faceValue: BigInt(record.faceValue ?? record[4]),
        issuedAt: Number(record.issuedAt ?? record[5]),
        dueAt: Number(record.dueAt ?? record[6]),
        documentHash: String(record.documentHash ?? record[7]),
        status: Number(record.status ?? record[8]),
      }))

      const financingValues = await Promise.all(
        Array.from({ length: financingCount }, (_, index) => marketContract.getFunction('getFinancing')(index + 1)),
      )
      const financings: FinancingRecord[] = await Promise.all(financingValues.map(async (record) => {
        const financingId = BigInt(record.id ?? record[0])
        const offerIds = await marketContract.getFunction('getOfferIds')(financingId)
        const offerValues = await Promise.all(
          Array.from(offerIds as bigint[], (offerId) => marketContract.getFunction('getOffer')(offerId)),
        )
        const offers: OfferRecord[] = offerValues.map((offer) => ({
          id: BigInt(offer.id ?? offer[0]),
          financingId: BigInt(offer.financingId ?? offer[1]),
          funder: String(offer.funder ?? offer[2]),
          rateBps: Number(offer.rateBps ?? offer[3]),
          status: Number(offer.status ?? offer[4]),
        }))
        return {
          id: financingId,
          invoiceId: BigInt(record.invoiceId ?? record[1]),
          supplier: String(record.supplier ?? record[2]),
          principal: BigInt(record.principal ?? record[3]),
          maxRateBps: Number(record.maxRateBps ?? record[4]),
          holdbackBps: Number(record.holdbackBps ?? record[5]),
          deadline: Number(record.deadline ?? record[6]),
          acceptedAt: Number(record.acceptedAt ?? record[7]),
          acceptedOfferId: BigInt(record.acceptedOfferId ?? record[8]),
          status: Number(record.status ?? record[9]),
          offers,
        }
      }))

      const fundedFinancings = financings.filter((item) => [3, 4, 7, 8].includes(item.status))
      const fundingValues = await Promise.all(
        fundedFinancings.map((item) => poolContract.getFunction('getFunding')(item.id)),
      )
      const fundings: FundingRecord[] = fundingValues.map((record) => ({
        financingId: BigInt(record.financingId ?? record[0]),
        invoiceId: BigInt(record.invoiceId ?? record[1]),
        supplier: String(record.supplier ?? record[2]),
        buyer: String(record.buyer ?? record[3]),
        funder: String(record.funder ?? record[4]),
        principal: BigInt(record.principal ?? record[5]),
        holdback: BigInt(record.holdback ?? record[6]),
        interest: BigInt(record.interest ?? record[7]),
        platformFee: BigInt(record.platformFee ?? record[8]),
        faceValue: BigInt(record.faceValue ?? record[9]),
        fundedAt: Number(record.fundedAt ?? record[10]),
        settled: Boolean(record.settled ?? record[11]),
        overdueAt: Number(record.overdueAt ?? record[12]),
        repaymentDeposited: Boolean(record.repaymentDeposited ?? record[13]),
        defaulted: Boolean(record.defaulted ?? record[14]),
        principalLoss: BigInt(record.principalLoss ?? record[15]),
        unpaidInterest: BigInt(record.unpaidInterest ?? record[16]),
      }))

      const disputeCount = Math.min(Number(disputeCountValue), 200)
      const disputeValues = await Promise.all(
        Array.from({ length: disputeCount }, (_, index) => disputeContract.getFunction('getDispute')(index + 1)),
      )
      const disputes: DisputeRecord[] = await Promise.all(disputeValues.map(async (record) => {
        const disputeId = BigInt(record.id ?? record[0])
        const evidenceCount = Number(await disputeContract.getFunction('getEvidenceCount')(disputeId))
        const evidenceValues = await Promise.all(
          Array.from({ length: evidenceCount }, (_, index) => disputeContract.getFunction('getEvidence')(disputeId, index)),
        )
        const evidence: EvidenceRecord[] = evidenceValues.map((item) => ({
          submitter: String(item.submitter ?? item[0]),
          evidenceHash: String(item.evidenceHash ?? item[1]),
          submittedAt: Number(item.submittedAt ?? item[2]),
        }))
        return {
          id: disputeId,
          invoiceId: BigInt(record.invoiceId ?? record[1]),
          openedBy: String(record.openedBy ?? record[2]),
          reasonHash: String(record.reasonHash ?? record[3]),
          status: Number(record.status ?? record[4]),
          ruling: Number(record.ruling ?? record[5]),
          openedAt: Number(record.openedAt ?? record[6]),
          resolvedAt: Number(record.resolvedAt ?? record[7]),
          arbitrator: String(record.arbitrator ?? record[8]),
          evidence,
        }
      }))

      setState({ loading: false, roleStates, invoices, financings, fundings, platformFeeBps: Number(platformFeeBpsValue), gracePeriod: Number(gracePeriodValue), disputes, roleRequests, activeRoleAssignments, roleRequestsError })
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: errorMessage(error) }))
    }
  }, [address, isSepolia, signer])

  useEffect(() => {
    void load()
  }, [load, version])

  return { ...state, refresh: load }
}

async function getDeploymentBlock(provider: Provider, address: string, latestBlock: number) {
  const key = address.toLowerCase()
  let cached = deploymentBlockCache.get(key)
  if (!cached) {
    cached = findDeploymentBlock(provider, address, latestBlock)
    deploymentBlockCache.set(key, cached)
  }
  return cached
}

async function findDeploymentBlock(provider: Provider, address: string, latestBlock: number) {
  let low = 0
  let high = latestBlock
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const code = await provider.getCode(address, middle)
    if (code === '0x') low = middle + 1
    else high = middle
  }
  return low
}

async function queryRoleEvents(contract: ReturnType<typeof getWritableContract>, eventName: 'RoleRequested' | 'RoleApproved', fromBlock: number, toBlock: number) {
  const events = []
  const chunkSize = 50_000
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, toBlock)
    events.push(...await contract.queryFilter(contract.filters[eventName](), start, end))
  }
  return events
}
