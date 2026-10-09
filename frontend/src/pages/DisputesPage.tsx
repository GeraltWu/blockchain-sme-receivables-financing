import { useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Group, Loader, Paper, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { id, isHexString, type JsonRpcSigner } from 'ethers'
import { ContractNotice } from '../components/ContractNotice'
import { PageHeader } from '../components/PageHeader'
import { contractAddresses } from '../config/contracts'
import type { useProtocolData } from '../hooks/useProtocolData'
import { sendContractTransaction } from '../services/contracts'
import type { TransactionRunner, UserRole } from '../types/domain'
import { disputeRulingLabels, disputeStatusLabels, invoiceStatusLabels, type DisputeRecord, type InvoiceRecord } from '../types/protocol'

interface Props {
  role: UserRole
  address: string
  signer?: JsonRpcSigner
  isSepolia: boolean
  protocol: ReturnType<typeof useProtocolData>
  runTransaction: TransactionRunner
}

export function DisputesPage(props: Props) {
  const wallet = props.address.toLowerCase()
  const disabled = !props.signer || !props.isSepolia || !contractAddresses.disputeResolution
  const invoiceById = new Map(props.protocol.invoices.map((invoice) => [invoice.id.toString(), invoice]))
  const openInvoiceIds = new Set(props.protocol.disputes.filter((item) => item.status === 1).map((item) => item.invoiceId.toString()))
  const relatedDisputes = props.protocol.disputes.filter((dispute) => {
    if (props.role === 'Arbitrator') return true
    const invoice = invoiceById.get(dispute.invoiceId.toString())
    return invoice ? isParticipant(props.role, wallet, invoice, props.protocol.financings) : false
  }).reverse()
  const eligibleInvoices = props.role === 'Arbitrator' ? [] : props.protocol.invoices.filter((invoice) =>
    [3, 4, 5, 7, 8].includes(invoice.status)
    && !openInvoiceIds.has(invoice.id.toString())
    && isParticipant(props.role, wallet, invoice, props.protocol.financings),
  ).reverse()

  const action = (label: string, method: string, args: readonly unknown[]) => {
    if (!props.signer) return
    return props.runTransaction(label, 'disputeResolution', () => sendContractTransaction('disputeResolution', props.signer!, method, args))
  }

  return <Stack gap="md">
    <PageHeader eyebrow="Protected workflow" title="Disputes" description="Freeze a live invoice, add evidence hashes, or apply a predefined ruling." />
    <ContractNotice />
    {props.protocol.error && <Alert color="red" title="Could not load disputes">{props.protocol.error}</Alert>}
    {props.protocol.loading ? <Loader size="sm" /> : <>
      {props.role !== 'Arbitrator' && <Section title="Open a dispute" description="Only active, non-final invoices are eligible." count={eligibleInvoices.length}>
        {eligibleInvoices.map((invoice) => <OpenDisputeCard key={invoice.id.toString()} invoice={invoice} disabled={disabled} onAction={action} />)}
      </Section>}
      <Section title={props.role === 'Arbitrator' ? 'Cases' : 'Your cases'} description={props.role === 'Arbitrator' ? 'Resolve open cases using the permitted outcomes.' : 'Open and resolved cases remain visible.'} count={relatedDisputes.length}>
        {relatedDisputes.map((dispute) => <DisputeCard key={dispute.id.toString()} dispute={dispute} invoice={invoiceById.get(dispute.invoiceId.toString())} role={props.role} disabled={disabled} onAction={action} />)}
      </Section>
    </>}
  </Stack>
}

function OpenDisputeCard({ invoice, disabled, onAction }: { invoice: InvoiceRecord; disabled: boolean; onAction: Action }) {
  const [reason, setReason] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await onAction('Open dispute', 'openDispute', [invoice.id, hashValue(reason, `dispute:${invoice.id}`)])
  }
  return <Paper withBorder radius="lg" p="md" className="record-card">
    <Group justify="space-between"><div><Text fw={750}>Invoice #{invoice.id.toString()}</Text><Text size="sm" c="dimmed">{invoiceStatusLabels[invoice.status]} · Due {new Date(invoice.dueAt * 1000).toLocaleDateString()}</Text></div><Badge color="orange" variant="light">Eligible</Badge></Group>
    <form onSubmit={submit} className="form-stack compact-form"><TextInput label="Reason or reason hash" placeholder="Delivery evidence does not match" required value={reason} onChange={(event) => setReason(event.currentTarget.value)} /><Button type="submit" color="orange" disabled={disabled}>Open dispute</Button></form>
  </Paper>
}

function DisputeCard({ dispute, invoice, role, disabled, onAction }: { dispute: DisputeRecord; invoice?: InvoiceRecord; role: UserRole; disabled: boolean; onAction: Action }) {
  const [evidence, setEvidence] = useState('')
  const open = dispute.status === 1
  const submitEvidence = async (event: FormEvent) => {
    event.preventDefault()
    await onAction('Submit dispute evidence', 'submitEvidenceHash', [dispute.id, hashValue(evidence, `evidence:${dispute.id}`)])
    setEvidence('')
  }
  return <Paper withBorder radius="lg" p="md" className="record-card">
    <Group justify="space-between" align="flex-start"><div><Text fw={750}>Case #{dispute.id.toString()} · Invoice #{dispute.invoiceId.toString()}</Text><Text size="sm" c="dimmed">Opened {new Date(dispute.openedAt * 1000).toLocaleString()}</Text></div><Badge color={open ? 'orange' : 'green'} variant="light">{disputeStatusLabels[dispute.status]}</Badge></Group>
    <SimpleGrid cols={2} mt="sm" spacing="sm"><Metric label="Invoice stage" value={invoice ? invoiceStatusLabels[invoice.status] : 'Unknown'} /><Metric label="Opened by" value={compact(dispute.openedBy)} /><Metric label="Reason hash" value={compactHash(dispute.reasonHash)} /><Metric label="Outcome" value={disputeRulingLabels[dispute.ruling]} /></SimpleGrid>
    {dispute.evidence.length > 0 && <Stack gap={4} mt="sm"><Text size="xs" c="dimmed" fw={700}>EVIDENCE</Text>{dispute.evidence.map((item, index) => <Group key={`${item.evidenceHash}:${index}`} justify="space-between"><Text size="sm">{compactHash(item.evidenceHash)}</Text><Text size="xs" c="dimmed">{compact(item.submitter)}</Text></Group>)}</Stack>}
    {open && role !== 'Arbitrator' && <form onSubmit={submitEvidence} className="offer-form"><TextInput label="Evidence note or hash" required value={evidence} onChange={(event) => setEvidence(event.currentTarget.value)} /><Button type="submit" variant="light" disabled={disabled}>Add evidence</Button></form>}
    {open && role === 'Arbitrator' && invoice && <Stack gap="xs" mt="md"><Button disabled={disabled} onClick={() => void onAction('Resume disputed workflow', 'resolveDispute', [dispute.id, 1])}>Resume workflow</Button>{invoice.status === 4 && <Button color="orange" variant="light" disabled={disabled} onClick={() => void onAction('Cancel disputed financing', 'resolveDispute', [dispute.id, 2])}>Cancel financing</Button>}{[5, 7].includes(invoice.status) && <Button color="red" variant="light" disabled={disabled} onClick={() => void onAction('Confirm financing default', 'resolveDispute', [dispute.id, 3])}>Confirm default</Button>}</Stack>}
  </Paper>
}

function Section({ title, description, count, children }: { title: string; description: string; count: number; children: React.ReactNode }) {
  return <section><Group justify="space-between" mb="xs"><div><Text fw={700}>{title}</Text><Text size="sm" c="dimmed">{description}</Text></div><Badge variant="light">{count}</Badge></Group>{count ? <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">{children}</SimpleGrid> : <Paper withBorder radius="lg" ta="center" className="compact-empty"><Text size="sm" c="dimmed">Nothing here yet.</Text></Paper>}</section>
}

type Action = (label: string, method: string, args: readonly unknown[]) => Promise<void> | undefined

function isParticipant(role: UserRole, wallet: string, invoice: InvoiceRecord, financings: ReturnType<typeof useProtocolData>['financings']) {
  if (role === 'Supplier') return invoice.supplier.toLowerCase() === wallet
  if (role === 'Buyer') return invoice.buyer.toLowerCase() === wallet
  if (role === 'Funder') return financings.some((item) => item.invoiceId === invoice.id && item.offers.some((offer) => offer.funder.toLowerCase() === wallet))
  return false
}

function hashValue(value: string, fallback: string) { const trimmed = value.trim(); return isHexString(trimmed, 32) ? trimmed : id(trimmed || fallback) }
function compact(value: string) { return `${value.slice(0, 6)}…${value.slice(-4)}` }
function compactHash(value: string) { return `${value.slice(0, 10)}…${value.slice(-6)}` }
function Metric({ label, value }: { label: string; value: string }) { return <div><Text size="xs" c="dimmed">{label}</Text><Text size="sm" fw={650}>{value}</Text></div> }
