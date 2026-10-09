import { useState, type FormEvent, type ReactNode } from 'react'
import { Alert, Badge, Button, Group, Loader, NumberInput, Paper, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { formatEther, parseEther, type JsonRpcSigner } from 'ethers'
import { ContractNotice } from '../components/ContractNotice'
import { PageHeader } from '../components/PageHeader'
import { contractAddresses } from '../config/contracts'
import type { useProtocolData } from '../hooks/useProtocolData'
import type { InvoiceMetadata } from '../services/api'
import { sendContractTransaction } from '../services/contracts'
import type { TransactionRunner, UserRole } from '../types/domain'
import { financingStatusLabels, invoiceStatusLabels, offerStatusLabels, type FinancingRecord, type FundingRecord, type InvoiceRecord, type OfferRecord } from '../types/protocol'

interface Props {
  role: UserRole
  address: string
  signer?: JsonRpcSigner
  isSepolia: boolean
  protocol: ReturnType<typeof useProtocolData>
  invoiceMetadata: InvoiceMetadata[]
  runTransaction: TransactionRunner
}

export function FinancingPage(props: Props) {
  const address = props.address.toLowerCase()
  const [now] = useState(() => Date.now() / 1000)
  const roleActive = props.protocol.roleStates[props.role] === 'active'
  const marketDisabled = !props.signer || !props.isSepolia || !contractAddresses.financingMarket
  const newMarketActionDisabled = marketDisabled || !roleActive
  const poolDisabled = !props.signer || !props.isSepolia || !contractAddresses.financingPool
  const invoiceById = new Map(props.protocol.invoices.map((item) => [item.id.toString(), item]))
  const fundingById = new Map(props.protocol.fundings.map((item) => [item.financingId.toString(), item]))
  const metadataById = new Map(props.invoiceMetadata.filter((item) => item.onchainInvoiceId).map((item) => [item.onchainInvoiceId!, item]))
  const frozenInvoiceIds = new Set(props.protocol.disputes.filter((item) => item.status === 1).map((item) => item.invoiceId.toString()))
  const supplierItems = props.protocol.financings.filter((item) => item.supplier.toLowerCase() === address).reverse()
  const eligibleInvoices = props.protocol.invoices.filter((item) => item.supplier.toLowerCase() === address && item.status === 3 && !frozenInvoiceIds.has(item.id.toString())).reverse()
  const opportunities = props.protocol.financings.filter((item) => item.status === 1 && item.deadline > now && !frozenInvoiceIds.has(item.invoiceId.toString()) && !item.offers.some((offer) => offer.funder.toLowerCase() === address && offer.status === 1)).reverse()
  const funderItems = props.protocol.financings.filter((item) => item.offers.some((offer) => offer.funder.toLowerCase() === address)).reverse()
  const dueInvoices = props.protocol.invoices.filter((item) => item.buyer.toLowerCase() === address && [5, 7].includes(item.status)).reverse()
  const depositedInvoices = props.protocol.invoices.filter((item) => item.buyer.toLowerCase() === address && item.status === 8).reverse()
  const defaultedInvoices = props.protocol.invoices.filter((item) => item.buyer.toLowerCase() === address && item.status === 9).reverse()
  const paidInvoices = props.protocol.invoices.filter((item) => item.buyer.toLowerCase() === address && item.status === 6).reverse()

  const marketAction = async (label: string, method: string, args: readonly unknown[]) => {
    if (!props.signer) return
    await props.runTransaction(label, 'financingMarket', () => sendContractTransaction('financingMarket', props.signer!, method, args))
  }
  const accept = (financing: FinancingRecord, offer: OfferRecord) => marketAction('Accept funding offer', 'acceptOffer', [financing.id, offer.id])
  const fund = async (financing: FinancingRecord) => {
    if (!props.signer) return
    await props.runTransaction('Fund financing', 'financingPool', () => sendContractTransaction('financingPool', props.signer!, 'fundFinancing', [financing.id], financing.principal))
  }
  const repay = async (invoice: InvoiceRecord) => {
    if (!props.signer) return
    await props.runTransaction('Repay invoice', 'financingPool', () => sendContractTransaction('financingPool', props.signer!, 'repayInvoice', [invoice.id], invoice.faceValue))
  }
  const poolAction = (label: string, method: string, invoiceId: bigint) => {
    if (!props.signer) return
    return props.runTransaction(label, 'financingPool', () => sendContractTransaction('financingPool', props.signer!, method, [invoiceId]))
  }

  const supplierCard = (financing: FinancingRecord) => {
    const activeOffers = financing.offers.filter((offer) => offer.status === 1)
    const funding = fundingById.get(financing.id.toString())
    const invoice = invoiceById.get(financing.invoiceId.toString())
    const frozen = frozenInvoiceIds.has(financing.invoiceId.toString())
    return <FinancingCard key={financing.id.toString()} financing={financing} invoice={invoice} invoiceNumber={metadataById.get(financing.invoiceId.toString())?.invoiceNumber} funding={funding} platformFeeBps={props.protocol.platformFeeBps} currentTime={now} role="Supplier">
      {frozen && <Alert color="orange" variant="light" mt="sm">Financing actions are frozen while the dispute is open.</Alert>}
      {financing.status === 1 && financing.deadline > now && activeOffers.map((offer) => <Group key={offer.id.toString()} justify="space-between" className="offer-row" wrap="nowrap"><div><Text fw={650}>{(offer.rateBps / 100).toFixed(2)}% APR</Text><Text size="xs" c="dimmed">From {compactAddress(offer.funder)}</Text></div><Button size="xs" disabled={marketDisabled || frozen} onClick={() => void accept(financing, offer)}>Accept</Button></Group>)}
      {financing.status === 1 && financing.deadline > now && activeOffers.length === 0 && <Text size="sm" c="dimmed" mt="sm">No active offers yet.</Text>}
      {financing.status === 1 && financing.deadline <= now && <Button fullWidth mt="md" variant="light" disabled={marketDisabled || frozen} onClick={() => void marketAction('Close expired financing request', 'expireFinancing', [financing.id])}>Close expired request</Button>}
      {financing.status === 1 && financing.deadline > now && <Button fullWidth mt="sm" color="red" variant="subtle" disabled={marketDisabled || frozen} onClick={() => void marketAction('Cancel financing request', 'cancelFinancing', [financing.id])}>Cancel request</Button>}
      {financing.status === 2 && financing.acceptedAt + 86_400 < now && <Button fullWidth mt="md" variant="light" disabled={marketDisabled || frozen} onClick={() => void marketAction('Release expired accepted offer', 'expireAcceptedOffer', [financing.id])}>Release expired offer</Button>}
      {funding && invoice && <LifecycleActions invoice={invoice} funding={funding} currentTime={now} gracePeriod={props.protocol.gracePeriod} disabled={poolDisabled || frozen} onAction={poolAction} />}
    </FinancingCard>
  }

  const funderCard = (financing: FinancingRecord) => {
    const ownOffers = financing.offers.filter((offer) => offer.funder.toLowerCase() === address)
    const accepted = ownOffers.find((offer) => offer.id === financing.acceptedOfferId)
    const latest = ownOffers.at(-1)
    const funding = fundingById.get(financing.id.toString())
    const frozen = frozenInvoiceIds.has(financing.invoiceId.toString())
    return <FinancingCard key={financing.id.toString()} financing={financing} invoice={invoiceById.get(financing.invoiceId.toString())} invoiceNumber={metadataById.get(financing.invoiceId.toString())?.invoiceNumber} funding={funding} platformFeeBps={props.protocol.platformFeeBps} currentTime={now} role="Funder">
      {frozen && <Alert color="orange" variant="light" mt="sm">Financing actions are frozen while the dispute is open.</Alert>}
      {latest && <Group justify="space-between" className="offer-row"><div><Text size="xs" c="dimmed">Your offer</Text><Text fw={650}>{(latest.rateBps / 100).toFixed(2)}% APR</Text></div><Badge color={latest.status === 2 ? 'green' : latest.status === 1 ? 'blue' : 'gray'} variant="light">{offerStatusLabels[latest.status] ?? 'Unknown'}</Badge></Group>}
      {financing.status === 1 && latest?.status === 1 && financing.deadline > now && <Button fullWidth mt="md" color="red" variant="subtle" disabled={marketDisabled || frozen} onClick={() => void marketAction('Withdraw funding offer', 'withdrawOffer', [latest.id])}>Withdraw offer</Button>}
      {financing.status === 1 && financing.deadline <= now && <Button fullWidth mt="md" variant="light" disabled={marketDisabled || frozen} onClick={() => void marketAction('Close expired financing request', 'expireFinancing', [financing.id])}>Close expired request</Button>}
      {financing.status === 2 && accepted && financing.acceptedAt + 86_400 >= now && <Button fullWidth mt="md" disabled={poolDisabled || frozen} onClick={() => void fund(financing)}>Fund {formatEth(financing.principal)} ETH</Button>}
      {financing.status === 2 && accepted && financing.acceptedAt + 86_400 < now && <Button fullWidth mt="md" variant="light" disabled={marketDisabled || frozen} onClick={() => void marketAction('Release expired accepted offer', 'expireAcceptedOffer', [financing.id])}>Release expired offer</Button>}
      {financing.status === 2 && !accepted && <Text size="sm" c="dimmed" mt="md">Another funder&apos;s offer was selected.</Text>}
      {funding && invoiceById.get(financing.invoiceId.toString()) && <LifecycleActions invoice={invoiceById.get(financing.invoiceId.toString())!} funding={funding} currentTime={now} gracePeriod={props.protocol.gracePeriod} disabled={poolDisabled || frozen} onAction={poolAction} />}
    </FinancingCard>
  }

  const grouped = (items: FinancingRecord[], statuses: number[]) => items.filter((item) => statuses.includes(item.status))
  return <Stack gap="md">
    <PageHeader eyebrow="Marketplace" title="Financing" description="Choose a receivable or opportunity and continue from its card." />
    <ContractNotice />
    {props.protocol.error && <Alert color="red" title="Could not load financing data">{props.protocol.error}</Alert>}
    {!roleActive && props.address && <Alert color={props.protocol.roleStates[props.role] === 'pending' ? 'yellow' : 'blue'} title={`${props.role} role ${props.protocol.roleStates[props.role]}`}>{props.protocol.roleStates[props.role] === 'pending' ? 'Approval is required to start new work. Existing assigned projects remain available.' : 'You can complete existing assigned projects, but must request this role to start new work.'}</Alert>}
    {props.protocol.loading ? <Loader size="sm" /> : <>
      {props.role === 'Supplier' && <>
        {roleActive && <Section title="Ready for financing" description="Confirmed invoices that can be financed." count={eligibleInvoices.length}>{eligibleInvoices.map((invoice) => <OpenRequestCard key={invoice.id.toString()} invoice={invoice} invoiceNumber={metadataById.get(invoice.id.toString())?.invoiceNumber} signer={props.signer} disabled={newMarketActionDisabled} runTransaction={props.runTransaction} />)}</Section>}
        <Section title="Needs action" description="Open requests and accepted offers." count={grouped(supplierItems, [1, 2]).length}>{grouped(supplierItems, [1, 2]).map(supplierCard)}</Section>
        <Section title="In progress" description="Funded or overdue receivables awaiting repayment." count={grouped(supplierItems, [3, 7]).length}>{grouped(supplierItems, [3, 7]).map(supplierCard)}</Section>
        <Section title="Completed" description="Settled financing remains available for reference." count={grouped(supplierItems, [4]).length}>{grouped(supplierItems, [4]).map(supplierCard)}</Section>
        <Section title="Closed" description="Cancelled, expired, and defaulted financing remains in history." count={grouped(supplierItems, [5, 6, 8]).length}>{grouped(supplierItems, [5, 6, 8]).map(supplierCard)}</Section>
      </>}
      {props.role === 'Funder' && <>
        {roleActive && <Section title="Open opportunities" description="Review the terms, then quote your rate." count={opportunities.length}>{opportunities.map((item) => <OfferCard key={item.id.toString()} financing={item} invoice={invoiceById.get(item.invoiceId.toString())} invoiceNumber={metadataById.get(item.invoiceId.toString())?.invoiceNumber} signer={props.signer} disabled={newMarketActionDisabled} currentTime={now} runTransaction={props.runTransaction} />)}</Section>}
        <Section title="Your active projects" description="Offers, accepted terms, funded and overdue investments." count={grouped(funderItems, [1, 2, 3, 7]).length}>{grouped(funderItems, [1, 2, 3, 7]).map(funderCard)}</Section>
        <Section title="Completed investments" description="Repaid investments remain in your history." count={grouped(funderItems, [4]).length}>{grouped(funderItems, [4]).map(funderCard)}</Section>
        <Section title="Closed" description="Cancelled, expired, and defaulted projects." count={grouped(funderItems, [5, 6, 8]).length}>{grouped(funderItems, [5, 6, 8]).map(funderCard)}</Section>
      </>}
      {props.role === 'Buyer' && <>
        <Section title="Repayments due" description="Overdue invoices can still be repaid during the grace period." count={dueInvoices.length}>{dueInvoices.map((invoice) => { const funding = fundingForInvoice(invoice, props.protocol.financings, fundingById); return <BuyerCard key={invoice.id.toString()} invoice={invoice} invoiceNumber={metadataById.get(invoice.id.toString())?.invoiceNumber} funding={funding}><Button fullWidth mt="sm" disabled={poolDisabled} onClick={() => void repay(invoice)}>Repay {formatEth(invoice.faceValue)} ETH</Button>{funding && <LifecycleActions invoice={invoice} funding={funding} currentTime={now} gracePeriod={props.protocol.gracePeriod} disabled={poolDisabled} onAction={poolAction} />}</BuyerCard> })}</Section>
        <Section title="Payment held for dispute" description="Deposited repayments settle automatically when the dispute resumes." count={depositedInvoices.length}>{depositedInvoices.map((invoice) => <BuyerCard key={invoice.id.toString()} invoice={invoice} invoiceNumber={metadataById.get(invoice.id.toString())?.invoiceNumber} funding={fundingForInvoice(invoice, props.protocol.financings, fundingById)}><Alert color="yellow" variant="light" mt="sm">Payment is safely held in the pool.</Alert></BuyerCard>)}</Section>
        <Section title="Payment history" description="Completed repayments remain available for reference." count={paidInvoices.length}>{paidInvoices.map((invoice) => <BuyerCard key={invoice.id.toString()} invoice={invoice} invoiceNumber={metadataById.get(invoice.id.toString())?.invoiceNumber} funding={fundingForInvoice(invoice, props.protocol.financings, fundingById)} settled />)}</Section>
        <Section title="Defaults" description="Closed invoices that passed the grace period without repayment." count={defaultedInvoices.length}>{defaultedInvoices.map((invoice) => <BuyerCard key={invoice.id.toString()} invoice={invoice} invoiceNumber={metadataById.get(invoice.id.toString())?.invoiceNumber} funding={fundingForInvoice(invoice, props.protocol.financings, fundingById)} />)}</Section>
      </>}
      {!['Supplier', 'Buyer', 'Funder'].includes(props.role) && <Alert color="blue">Choose Supplier, Buyer, or Funder to use financing actions.</Alert>}
    </>}
  </Stack>
}

function Section({ title, description, count, children }: { title: string; description: string; count: number; children: ReactNode }) {
  return <section><Group justify="space-between" mb="xs"><div><Text fw={700}>{title}</Text><Text size="sm" c="dimmed">{description}</Text></div><Badge variant="light">{count}</Badge></Group>{count ? <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">{children}</SimpleGrid> : <Paper withBorder radius="lg" ta="center" className="compact-empty"><Text size="sm" c="dimmed">Nothing here yet.</Text></Paper>}</section>
}

function BuyerCard({ invoice, invoiceNumber, funding, settled = false, children }: { invoice: InvoiceRecord; invoiceNumber?: string; funding?: FundingRecord; settled?: boolean; children?: ReactNode }) {
  return <Paper withBorder radius="lg" p="md" className="record-card"><Group justify="space-between"><div><Text fw={750}>{invoiceNumber ?? `${formatEth(invoice.faceValue)} ETH invoice`}</Text><Text size="sm" c="dimmed">{formatEth(invoice.faceValue)} ETH · Due {new Date(invoice.dueAt * 1000).toLocaleDateString()}</Text></div><Badge color={invoice.status === 9 ? 'red' : invoice.status === 7 ? 'orange' : settled ? 'green' : 'blue'} variant="light">{invoiceStatusLabels[invoice.status] ?? 'Unknown'}</Badge></Group>{funding && <CashFlow role="Buyer" funding={funding} />}{children}<RecordLink address={contractAddresses.invoiceRegistry} /></Paper>
}

function OpenRequestCard({ invoice, invoiceNumber, signer, disabled, runTransaction }: { invoice: InvoiceRecord; invoiceNumber?: string; signer?: JsonRpcSigner; disabled: boolean; runTransaction: TransactionRunner }) {
  const [values, setValues] = useState(() => ({ principal: formatEther(invoice.faceValue * 80n / 100n), maxRate: '800', holdback: '1000', deadline: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16) }))
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!signer) return; await runTransaction('Open financing request', 'financingMarket', () => sendContractTransaction('financingMarket', signer, 'openFinancing', [invoice.id, parseEther(values.principal), Number(values.maxRate), Number(values.holdback), Math.floor(new Date(values.deadline).getTime() / 1000)])) }
  return <Paper withBorder radius="lg" p="md" className="record-card"><Group justify="space-between"><div><Text fw={750}>{invoiceNumber ?? `${formatEth(invoice.faceValue)} ETH invoice`}</Text><Text size="sm" c="dimmed">{formatEth(invoice.faceValue)} ETH · Due {new Date(invoice.dueAt * 1000).toLocaleDateString()}</Text></div><Badge variant="light">Confirmed</Badge></Group><form onSubmit={submit} className="form-stack compact-form"><TextInput label="Funding amount (ETH)" required value={values.principal} onChange={(event) => setValues({ ...values, principal: event.currentTarget.value })} /><SimpleGrid cols={2} spacing="sm"><TextInput label="Max rate (bps)" required value={values.maxRate} onChange={(event) => setValues({ ...values, maxRate: event.currentTarget.value })} /><TextInput label="Holdback (bps)" required value={values.holdback} onChange={(event) => setValues({ ...values, holdback: event.currentTarget.value })} /></SimpleGrid><TextInput label="Offer deadline" type="datetime-local" required value={values.deadline} onChange={(event) => setValues({ ...values, deadline: event.currentTarget.value })} /><Button type="submit" disabled={disabled}>Request financing</Button></form><RecordLink address={contractAddresses.invoiceRegistry} /></Paper>
}

function OfferCard({ financing, invoice, invoiceNumber, signer, disabled, currentTime, runTransaction }: { financing: FinancingRecord; invoice?: InvoiceRecord; invoiceNumber?: string; signer?: JsonRpcSigner; disabled: boolean; currentTime: number; runTransaction: TransactionRunner }) {
  const [rate, setRate] = useState<number | string>(Math.min(financing.maxRateBps, 600))
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!signer) return; await runTransaction('Submit funding offer', 'financingMarket', () => sendContractTransaction('financingMarket', signer, 'submitOffer', [financing.id, Number(rate)])) }
  return <FinancingCard financing={financing} invoice={invoice} invoiceNumber={invoiceNumber} currentTime={currentTime}><form onSubmit={submit} className="offer-form"><NumberInput label="Your annual rate (bps)" min={1} max={financing.maxRateBps} required value={rate} onChange={setRate} /><Button type="submit" disabled={disabled}>Submit offer</Button></form></FinancingCard>
}

function FinancingCard({ financing, invoice, invoiceNumber, funding, platformFeeBps = 0, currentTime, role, children }: { financing: FinancingRecord; invoice?: InvoiceRecord; invoiceNumber?: string; funding?: FundingRecord; platformFeeBps?: number; currentTime: number; role?: 'Supplier' | 'Funder'; children?: ReactNode }) {
  const estimate = !funding && invoice && financing.status === 2 ? estimateBreakdown(financing, invoice, platformFeeBps, currentTime) : undefined
  return <Paper withBorder radius="lg" p="md" className="record-card"><Group justify="space-between" align="flex-start"><div><Text fw={750}>{invoiceNumber ?? `${formatEth(financing.principal)} ETH requested`}</Text><Text size="sm" c="dimmed">{formatEth(financing.principal)} ETH requested · Invoice value {invoice ? formatEth(invoice.faceValue) : '—'} ETH</Text></div><Badge color={financing.status === 8 ? 'red' : financing.status === 7 ? 'orange' : undefined} variant="light">{financingStatusLabels[financing.status] ?? 'Unknown'}</Badge></Group><SimpleGrid cols={2} mt="sm" spacing="sm"><Metric label="Maximum APR" value={`${(financing.maxRateBps / 100).toFixed(2)}%`} /><Metric label="Offer deadline" value={new Date(financing.deadline * 1000).toLocaleString()} /></SimpleGrid>{funding?.defaulted ? <DefaultBreakdown funding={funding} /> : (funding || estimate) && <FundingBreakdown breakdown={funding ?? estimate!} estimated={!funding} />}{funding && <CashFlow role={role} funding={funding} />}{children}<RecordLink address={funding ? contractAddresses.financingPool : contractAddresses.financingMarket} /></Paper>
}

type PaymentBreakdown = Pick<FundingRecord, 'principal' | 'holdback' | 'interest' | 'platformFee' | 'faceValue'>

function FundingBreakdown({ breakdown, estimated = false }: { breakdown: PaymentBreakdown; estimated?: boolean }) {
  const funderPayment = breakdown.principal + breakdown.interest
  const supplierFinal = breakdown.faceValue + breakdown.holdback - funderPayment - breakdown.platformFee
  return <div className="funding-breakdown"><Text size="sm" fw={700} mb="xs">{estimated ? 'Estimated payment breakdown' : 'Payment breakdown'}</Text><SimpleGrid cols={2}><Metric label="Supplier upfront" value={`${formatEth(breakdown.principal - breakdown.holdback)} ETH`} /><Metric label="Held back" value={`${formatEth(breakdown.holdback)} ETH`} /><Metric label="Interest" value={`${formatEth(breakdown.interest)} ETH`} /><Metric label="Platform fee" value={`${formatEth(breakdown.platformFee)} ETH`} /><Metric label="Funder repayment" value={`${formatEth(funderPayment)} ETH`} /><Metric label="Supplier final" value={`${formatEth(supplierFinal)} ETH`} /></SimpleGrid>{estimated && <Text size="xs" c="dimmed" mt="xs">Interest locks when funding is confirmed, so the final amount may differ slightly.</Text>}</div>
}

function DefaultBreakdown({ funding }: { funding: FundingRecord }) {
  return <div className="funding-breakdown"><Text size="sm" fw={700} mb="xs">Default outcome</Text><SimpleGrid cols={2}><Metric label="Holdback returned" value={`${formatEth(funding.holdback)} ETH`} /><Metric label="Principal loss" value={`${formatEth(funding.principalLoss)} ETH`} /><Metric label="Unpaid interest" value={`${formatEth(funding.unpaidInterest)} ETH`} /><Metric label="Total exposure" value={`${formatEth(funding.principalLoss + funding.unpaidInterest)} ETH`} /></SimpleGrid></div>
}

function LifecycleActions({ invoice, funding, currentTime, gracePeriod, disabled, onAction }: { invoice: InvoiceRecord; funding: FundingRecord; currentTime: number; gracePeriod: number; disabled: boolean; onAction: (label: string, method: string, invoiceId: bigint) => Promise<void> | undefined }) {
  if (funding.settled || funding.defaulted || funding.repaymentDeposited) return null
  const defaultAvailable = [5, 7].includes(invoice.status) && currentTime > invoice.dueAt + gracePeriod
  const overdueAvailable = invoice.status === 5 && currentTime > invoice.dueAt && !defaultAvailable
  return <Group grow mt="sm">{overdueAvailable && <Button color="orange" variant="light" disabled={disabled} onClick={() => void onAction('Mark invoice overdue', 'markOverdue', invoice.id)}>Mark overdue</Button>}{defaultAvailable && <Button color="red" variant="light" disabled={disabled} onClick={() => void onAction('Declare default', 'declareDefault', invoice.id)}>Declare default</Button>}</Group>
}

function CashFlow({ role, funding }: { role?: 'Supplier' | 'Funder' | 'Buyer'; funding: FundingRecord }) {
  if (funding.defaulted) return <Alert color="red" variant="light" mt="sm"><Text size="sm" fw={650}>Default closed · {formatEth(funding.holdback)} ETH holdback returned to the funder.</Text></Alert>
  if (funding.repaymentDeposited) return <Alert color="yellow" variant="light" mt="sm"><Text size="sm" fw={650}>Buyer payment is held while the dispute is open.</Text></Alert>
  if (role === 'Supplier') return <Alert color="green" variant="light" mt="sm"><Text size="sm" fw={650}>Received {formatEth(funding.principal - funding.holdback)} ETH upfront{funding.settled ? ` and ${formatEth(funding.faceValue + funding.holdback - funding.principal - funding.interest - funding.platformFee)} ETH at settlement.` : '.'}</Text></Alert>
  if (role === 'Funder') return <Alert color={funding.settled ? 'green' : 'blue'} variant="light" mt="sm"><Text size="sm" fw={650}>{funding.settled ? `Repaid ${formatEth(funding.principal + funding.interest)} ETH.` : `Invested ${formatEth(funding.principal)} ETH · Awaiting repayment.`}</Text></Alert>
  if (role === 'Buyer') return <Alert color={funding.settled ? 'green' : 'blue'} variant="light" mt="sm"><Text size="sm" fw={650}>{funding.settled ? `Paid ${formatEth(funding.faceValue)} ETH.` : `${formatEth(funding.faceValue)} ETH due for settlement.`}</Text></Alert>
  return null
}

function fundingForInvoice(invoice: InvoiceRecord, financings: FinancingRecord[], fundings: Map<string, FundingRecord>) { const financing = financings.find((item) => item.invoiceId === invoice.id); return financing ? fundings.get(financing.id.toString()) : undefined }
function estimateBreakdown(financing: FinancingRecord, invoice: InvoiceRecord, platformFeeBps: number, currentTime: number): PaymentBreakdown | undefined { const offer = financing.offers.find((item) => item.id === financing.acceptedOfferId); if (!offer) return undefined; const holdback = financing.principal * BigInt(financing.holdbackBps) / 10_000n; const seconds = Math.max(invoice.dueAt - Math.floor(currentTime), 0); const days = BigInt(Math.ceil(seconds / 86_400)); return { principal: financing.principal, holdback, interest: financing.principal * BigInt(offer.rateBps) * days / 10_000n / 365n, platformFee: financing.principal * BigInt(platformFeeBps) / 10_000n, faceValue: invoice.faceValue } }
function Metric({ label, value }: { label: string; value: string }) { return <div><Text size="xs" c="dimmed">{label}</Text><Text size="sm" fw={650}>{value}</Text></div> }
function formatEth(value: bigint) { return Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 6 }) }
function compactAddress(value: string) { return `${value.slice(0, 6)}…${value.slice(-4)}` }
function RecordLink({ address }: { address: string }) { return <Text component="a" href={`https://sepolia.etherscan.io/address/${address}`} target="_blank" rel="noreferrer" size="sm" fw={650} c="blue" mt="md" className="record-link">View on Etherscan →</Text> }
