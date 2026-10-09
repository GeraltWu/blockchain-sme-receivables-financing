import { useMemo, useState } from 'react'
import { Alert, Badge, Button, Group, Loader, Paper, Progress, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core'
import { formatEther, type JsonRpcSigner } from 'ethers'
import { PageHeader } from '../components/PageHeader'
import { useAuditData } from '../hooks/useAuditData'
import type { useProtocolData } from '../hooks/useProtocolData'
import type { InvoiceMetadata } from '../services/api'
import { financingStatusLabels, invoiceStatusLabels, offerStatusLabels, type AuditEventRecord, type FundingRecord } from '../types/protocol'

interface Props {
  signer?: JsonRpcSigner
  isSepolia: boolean
  roleActive: boolean
  protocol: ReturnType<typeof useProtocolData>
  invoiceMetadata: InvoiceMetadata[]
}

type AuditView = 'overview' | 'cash' | 'events'

const CASH_PAGE_SIZE = 6
const EVENT_PAGE_SIZE = 10
const participantRoleLabels = ['Supplier', 'Buyer', 'Funder', 'Auditor', 'Arbitrator'] as const

const eventLabels: Record<string, string> = {
  RoleRequested: 'Role requested',
  RoleApproved: 'Role approved',
  RoleRevoked: 'Role revoked',
  InvoiceSubmitted: 'Invoice submitted',
  InvoiceConfirmed: 'Invoice confirmed',
  InvoiceRejected: 'Invoice rejected',
  InvoiceStatusChanged: 'Invoice status changed',
  InvoiceFinancingOpened: 'Invoice entered financing',
  InvoiceRestored: 'Invoice restored',
  InvoiceFunded: 'Invoice funded',
  InvoiceRepaid: 'Invoice repaid',
  FinancingOpened: 'Financing opened',
  FinancingCancelled: 'Financing cancelled',
  FinancingExpired: 'Financing expired',
  OfferSubmitted: 'Offer submitted',
  OfferWithdrawn: 'Offer withdrawn',
  OfferAccepted: 'Offer accepted',
  AcceptedOfferExpired: 'Accepted offer expired',
  FinancingFunded: 'Financing funded',
  FinancingSettled: 'Financing settled',
  FinancingOverdue: 'Financing overdue',
  FinancingDefaulted: 'Financing defaulted',
  InvoiceMarkedOverdue: 'Invoice marked overdue',
  RepaymentDeposited: 'Repayment deposited',
  DisputeOpened: 'Dispute opened',
  EvidenceSubmitted: 'Evidence submitted',
  DisputeResolved: 'Dispute resolved',
}

export function AuditPage({ signer, isSepolia, roleActive, protocol, invoiceMetadata }: Props) {
  const audit = useAuditData(signer, isSepolia && roleActive)
  const [view, setView] = useState<AuditView>('overview')
  const [category, setCategory] = useState<string | null>('all')
  const [search, setSearch] = useState('')
  const [cashLimit, setCashLimit] = useState(CASH_PAGE_SIZE)
  const [eventLimit, setEventLimit] = useState(EVENT_PAGE_SIZE)
  const metadataByInvoice = new Map(invoiceMetadata.filter((item) => item.onchainInvoiceId).map((item) => [item.onchainInvoiceId!, item]))
  const settled = protocol.fundings.filter((item) => item.settled)
  const totals = {
    funded: sum(protocol.fundings, (item) => item.principal),
    repaid: sum(settled, (item) => item.faceValue),
    fees: sum(settled, (item) => item.platformFee),
    supplierPaid: sum(protocol.fundings, (item) => item.principal - item.holdback) + sum(settled, supplierFinal),
  }
  const visibleEvents = useMemo(() => audit.events.filter((event) => {
    const categoryMatches = category === 'all'
      || category === 'roles' && event.contract === 'roleRegistry'
      || category === 'invoices' && event.contract === 'invoiceRegistry'
      || category === 'financing' && event.contract === 'financingMarket'
      || category === 'cash' && event.contract === 'financingPool'
      || category === 'disputes' && event.contract === 'disputeResolution'
    const term = search.trim().toLowerCase()
    return categoryMatches && (!term || event.eventName.toLowerCase().includes(term) || transactionSearchText(event).includes(term))
  }), [audit.events, category, search])
  const cashFlows = [...protocol.fundings].reverse()

  const changeCategory = (value: string | null) => {
    setCategory(value)
    setEventLimit(EVENT_PAGE_SIZE)
  }

  const changeSearch = (value: string) => {
    setSearch(value)
    setEventLimit(EVENT_PAGE_SIZE)
  }

  return <Stack gap="md">
    <PageHeader eyebrow="Read-only" title="Audit dashboard" description="Review protocol health, cash movements, and confirmed Sepolia events." />
    {!signer && <Alert color="blue">Connect MetaMask to read Sepolia audit records.</Alert>}
    {signer && !isSepolia && <Alert color="yellow">Switch to Sepolia to load audit records.</Alert>}
    {isSepolia && !roleActive && <Alert color="blue">The Auditor role must be active for this workspace.</Alert>}
    {roleActive && audit.error && <Alert color="red" title="Could not load audit events">{audit.error}</Alert>}

    {roleActive && <>
      <div className="audit-view-tabs">
        <SegmentedControl
          fullWidth
          value={view}
          onChange={(value) => setView(value as AuditView)}
          data={[
            { value: 'overview', label: 'Overview' },
            { value: 'cash', label: 'Cash flow' },
            { value: 'events', label: 'Events' },
          ]}
        />
      </div>

      {view === 'overview' && <Overview
        protocol={protocol}
        totals={totals}
        settledCount={settled.length}
        indexedThroughBlock={audit.indexedThroughBlock}
        refreshing={audit.loading}
        onRefresh={() => void audit.refresh()}
      />}

      {view === 'cash' && <section>
        <Group justify="space-between" mb="sm"><div><Title order={2}>Cash flow audit</Title><Text size="sm" c="dimmed">Funding and settlement values read from FinancingPool.</Text></div><Badge variant="light">{protocol.fundings.length}</Badge></Group>
        {cashFlows.length === 0 ? <Empty text="No funded projects are available yet." /> : <>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">{cashFlows.slice(0, cashLimit).map((funding) => <CashFlowCard key={funding.financingId.toString()} funding={funding} invoiceNumber={metadataByInvoice.get(funding.invoiceId.toString())?.invoiceNumber} />)}</SimpleGrid>
          {cashLimit < cashFlows.length && <Group justify="center" mt="md"><Button variant="light" onClick={() => setCashLimit((current) => current + CASH_PAGE_SIZE)}>Load more</Button></Group>}
        </>}
      </section>}

      {view === 'events' && <section>
        <Group justify="space-between" align="flex-end" mb="sm"><div><Title order={2}>Event timeline</Title><Text size="sm" c="dimmed">Newest confirmed event first.</Text></div><Badge variant="light">{Math.min(eventLimit, visibleEvents.length)} of {visibleEvents.length}</Badge></Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" mb="sm">
          <Select label="Event category" value={category} onChange={changeCategory} allowDeselect={false} data={[{ value: 'all', label: 'All events' }, { value: 'invoices', label: 'Invoices' }, { value: 'financing', label: 'Financing and offers' }, { value: 'cash', label: 'Cash flows' }, { value: 'disputes', label: 'Disputes' }, { value: 'roles', label: 'Roles' }]} />
          <TextInput label="Search events" placeholder="Event, transaction, or wallet" value={search} onChange={(event) => changeSearch(event.currentTarget.value)} />
        </SimpleGrid>
        {audit.loading ? <Loader size="sm" /> : visibleEvents.length === 0 ? <Empty text="No matching on-chain events were found." /> : <>
          <Stack gap="sm">{visibleEvents.slice(0, eventLimit).map((event) => <EventCard key={event.id} event={event} />)}</Stack>
          {eventLimit < visibleEvents.length && <Group justify="center" mt="md"><Button variant="light" onClick={() => setEventLimit((current) => current + EVENT_PAGE_SIZE)}>Load more</Button></Group>}
        </>}
      </section>}
    </>}
  </Stack>
}

function Overview({ protocol, totals, settledCount, indexedThroughBlock, refreshing, onRefresh }: {
  protocol: ReturnType<typeof useProtocolData>
  totals: { funded: bigint; repaid: bigint; fees: bigint; supplierPaid: bigint }
  settledCount: number
  indexedThroughBlock?: number
  refreshing: boolean
  onRefresh: () => void
}) {
  return <Stack gap="md">
    <section>
      <Group justify="space-between" mb="sm"><div><Title order={2}>Protocol overview</Title><Text size="sm" c="dimmed">Live contract state{indexedThroughBlock ? ` · Block ${indexedThroughBlock.toLocaleString()}` : ''}</Text></div><Button variant="light" size="xs" loading={refreshing} onClick={onRefresh}>Refresh</Button></Group>
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <SummaryCard label="Invoices" value={protocol.invoices.length.toLocaleString()} note={`${protocol.invoices.filter((item) => item.status === 6).length} repaid`} />
        <SummaryCard label="Total funded" value={`${formatEth(totals.funded)} ETH`} note={`${protocol.fundings.length} financings`} />
        <SummaryCard label="Buyer repayments" value={`${formatEth(totals.repaid)} ETH`} note={`${settledCount} settled`} />
        <SummaryCard label="Platform fees" value={`${formatEth(totals.fees)} ETH`} note={`Supplier paid ${formatEth(totals.supplierPaid)} ETH`} />
      </SimpleGrid>
    </section>
    <section>
      <Group justify="space-between" mb="sm"><div><Title order={2}>Status distribution</Title><Text size="sm" c="dimmed">Current state of on-chain records.</Text></div></Group>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        <StatusDistribution title="Invoices" labels={invoiceStatusLabels} statuses={protocol.invoices.map((item) => item.status)} />
        <StatusDistribution title="Financing" labels={financingStatusLabels} statuses={protocol.financings.map((item) => item.status)} />
      </SimpleGrid>
    </section>
  </Stack>
}

function StatusDistribution({ title, labels, statuses }: { title: string; labels: readonly string[]; statuses: number[] }) {
  const rows = labels.map((label, status) => ({ label, count: statuses.filter((value) => value === status).length })).filter((item) => item.count > 0)
  return <Paper withBorder radius="lg" p="md" className="record-card">
    <Group justify="space-between"><Text fw={700}>{title}</Text><Badge variant="light">{statuses.length}</Badge></Group>
    {rows.length === 0 ? <Text size="sm" c="dimmed" mt="sm">No records yet.</Text> : <Stack gap="sm" mt="sm">
      {rows.map((row) => <div key={row.label}><Group justify="space-between" mb={4}><Text size="sm">{row.label}</Text><Text size="xs" c="dimmed">{row.count} · {Math.round(row.count / statuses.length * 100)}%</Text></Group><Progress value={row.count / statuses.length * 100} size="sm" radius="xl" /></div>)}
    </Stack>}
  </Paper>
}

function SummaryCard({ label, value, note }: { label: string; value: string; note: string }) {
  return <Paper withBorder radius="lg" p="md" className="audit-summary-card"><Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text><Text fw={800} size="lg" mt={4}>{value}</Text><Text size="xs" c="dimmed" mt={3}>{note}</Text></Paper>
}

function CashFlowCard({ funding, invoiceNumber }: { funding: FundingRecord; invoiceNumber?: string }) {
  const finalPayment = supplierFinal(funding)
  return <Paper withBorder radius="lg" p="md" className="record-card"><Group justify="space-between"><div><Text fw={750}>{invoiceNumber ?? 'Financed invoice'}</Text><Text size="xs" c="dimmed">Funded {new Date(funding.fundedAt * 1000).toLocaleString()}</Text></div><Badge color={funding.defaulted ? 'red' : funding.settled ? 'green' : funding.repaymentDeposited ? 'yellow' : funding.overdueAt ? 'orange' : 'blue'} variant="light">{funding.defaulted ? 'Defaulted' : funding.settled ? 'Settled' : funding.repaymentDeposited ? 'Payment held' : funding.overdueAt ? 'Overdue' : 'Funded'}</Badge></Group>{funding.defaulted ? <SimpleGrid cols={2} mt="sm" spacing="sm"><Metric label="Funder invested" value={`${formatEth(funding.principal)} ETH`} /><Metric label="Holdback returned" value={`${formatEth(funding.holdback)} ETH`} /><Metric label="Principal loss" value={`${formatEth(funding.principalLoss)} ETH`} /><Metric label="Unpaid interest" value={`${formatEth(funding.unpaidInterest)} ETH`} /></SimpleGrid> : <SimpleGrid cols={2} mt="sm" spacing="sm"><Metric label="Funder invested" value={`${formatEth(funding.principal)} ETH`} /><Metric label="Supplier upfront" value={`${formatEth(funding.principal - funding.holdback)} ETH`} /><Metric label="Holdback" value={`${formatEth(funding.holdback)} ETH`} /><Metric label="Interest" value={`${formatEth(funding.interest)} ETH`} /><Metric label="Funder repayment" value={`${formatEth(funding.principal + funding.interest)} ETH`} /><Metric label="Platform fee" value={`${formatEth(funding.platformFee)} ETH`} /><Metric label="Buyer payment" value={`${formatEth(funding.faceValue)} ETH`} /><Metric label="Supplier final" value={`${formatEth(finalPayment)} ETH`} /></SimpleGrid>}<Group gap="xs" mt="sm"><Text size="xs" c="dimmed">Supplier {compact(funding.supplier)}</Text><Text size="xs" c="dimmed">Buyer {compact(funding.buyer)}</Text><Text size="xs" c="dimmed">Funder {compact(funding.funder)}</Text></Group></Paper>
}

function EventCard({ event }: { event: AuditEventRecord }) {
  const visibleFields = Object.entries(event.payload).filter(([key]) => !['invoiceId', 'financingId', 'offerId', 'invoiceKey'].includes(key)).slice(0, 5)
  return <Paper withBorder radius="lg" p="md" className="audit-event-card"><Group justify="space-between" align="flex-start" wrap="nowrap"><div><Text fw={700}>{eventLabels[event.eventName] ?? splitName(event.eventName)}</Text><Text size="xs" c="dimmed">{event.timestamp ? new Date(event.timestamp * 1000).toLocaleString() : `Block ${event.blockNumber.toLocaleString()}`} · Block {event.blockNumber.toLocaleString()}</Text></div><Badge variant="light">{contractLabel(event.contract)}</Badge></Group>{visibleFields.length > 0 && <SimpleGrid cols={{ base: 1, xs: 2 }} mt="sm" spacing="sm">{visibleFields.map(([key, value]) => <Metric key={key} label={splitName(key)} value={formatPayload(event, key, value)} />)}</SimpleGrid>}<Text component="a" href={`https://sepolia.etherscan.io/tx/${event.transactionHash}`} target="_blank" rel="noreferrer" size="sm" fw={650} c="blue" mt="sm" className="record-link">View transaction on Etherscan →</Text></Paper>
}

function Empty({ text }: { text: string }) { return <Paper withBorder radius="lg" ta="center" className="compact-empty"><Text size="sm" c="dimmed">{text}</Text></Paper> }
function Metric({ label, value }: { label: string; value: string }) { return <div><Text size="xs" c="dimmed">{label}</Text><Text size="sm" fw={650} className="audit-value">{value}</Text></div> }
function supplierFinal(item: FundingRecord) { return item.faceValue + item.holdback - item.principal - item.interest - item.platformFee }
function sum(items: FundingRecord[], select: (item: FundingRecord) => bigint) { return items.reduce((total, item) => total + select(item), 0n) }
function formatEth(value: bigint) { return Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 6 }) }
function compact(value: string) { return `${value.slice(0, 6)}…${value.slice(-4)}` }
function splitName(value: string) { return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (character) => character.toUpperCase()) }
function contractLabel(value: AuditEventRecord['contract']) { return ({ roleRegistry: 'Roles', invoiceRegistry: 'Invoices', financingMarket: 'Financing', financingPool: 'Cash flow', disputeResolution: 'Disputes' } as const)[value] }
function transactionSearchText(event: AuditEventRecord) { return `${event.transactionHash} ${Object.values(event.payload).join(' ')}`.toLowerCase() }

function formatPayload(event: AuditEventRecord, key: string, value: string | boolean) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (key.toLowerCase() === 'role' && /^\d+$/.test(value)) return participantRoleLabels[Number(value)] ?? 'Unknown role'
  if (key.toLowerCase() === 'status' && /^\d+$/.test(value)) {
    const status = Number(value)
    if (event.contract === 'invoiceRegistry') return invoiceStatusLabels[status] ?? 'Unknown status'
    if (event.eventName.toLowerCase().includes('offer')) return offerStatusLabels[status] ?? 'Unknown status'
    if (event.contract === 'financingMarket') return financingStatusLabels[status] ?? 'Unknown status'
  }
  if (/rateBps|holdbackBps/i.test(key) && /^\d+$/.test(value)) return `${(Number(value) / 100).toFixed(2)}%`
  if (/deadline|acceptedAt|fundedAt/i.test(key) && /^\d+$/.test(value) && Number(value) > 0) return new Date(Number(value) * 1000).toLocaleString()
  if (/amount|principal|holdback|interest|fee|payment|value|upfront/i.test(key) && /^\d+$/.test(value)) return `${formatEth(BigInt(value))} ETH`
  if (/address|account|supplier|buyer|funder|approvedBy|recipient/i.test(key) && value.startsWith('0x')) return compact(value)
  return value
}
