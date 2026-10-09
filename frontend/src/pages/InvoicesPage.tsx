import { useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Group, Loader, Paper, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { formatEther, id, parseEther, type JsonRpcSigner } from 'ethers'
import { ActionCard } from '../components/ActionCard'
import { ContractNotice } from '../components/ContractNotice'
import { PageHeader } from '../components/PageHeader'
import { contractAddresses } from '../config/contracts'
import type { useProtocolData } from '../hooks/useProtocolData'
import { saveInvoiceMetadata, type InvoiceMetadata } from '../services/api'
import { getWritableContract, sendContractTransaction } from '../services/contracts'
import type { TransactionRunner, UserRole } from '../types/domain'
import { invoiceStatusLabels, type InvoiceRecord } from '../types/protocol'

interface InvoicesPageProps {
  role: UserRole
  address: string
  signer?: JsonRpcSigner
  isSepolia: boolean
  authenticated: boolean
  protocol: ReturnType<typeof useProtocolData>
  invoiceMetadata: InvoiceMetadata[]
  runTransaction: TransactionRunner
}

export function InvoicesPage(props: InvoicesPageProps) {
  const today = new Date().toISOString().slice(0, 10)
  const [invoice, setInvoice] = useState({ buyer: '', number: '', amount: '', issuedAt: today, dueAt: '', documentHash: '' })
  const roleActive = props.protocol.roleStates[props.role] === 'active'
  const participantDisabled = !props.signer || !props.isSepolia || !contractAddresses.invoiceRegistry
  const newBusinessDisabled = participantDisabled || !roleActive
  const ownInvoices = props.protocol.invoices.filter((item) => {
    const address = props.address.toLowerCase()
    return props.role === 'Supplier'
      ? item.supplier.toLowerCase() === address
      : props.role === 'Buyer' && item.buyer.toLowerCase() === address
  }).reverse()

  const update = (field: keyof typeof invoice, value: string) => setInvoice((current) => ({ ...current, [field]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!props.signer) return
    const issuedAt = Math.floor(new Date(`${invoice.issuedAt}T00:00:00Z`).getTime() / 1000)
    const dueAt = Math.floor(new Date(`${invoice.dueAt}T00:00:00Z`).getTime() / 1000)
    const documentHash = invoice.documentHash || id(`invoice-document:${invoice.number}`)
    await props.runTransaction('Submit invoice', 'invoiceRegistry', async () => {
      const faceValue = parseEther(invoice.amount)
      const roleRegistry = getWritableContract('roleRegistry', props.signer!)
      const buyerRoleActive = Boolean(await roleRegistry.getFunction('hasRole')(invoice.buyer, 1))
      if (!buyerRoleActive) {
        throw new Error('The buyer wallet does not have an active Buyer role. Ask the buyer to request access and wait for administrator approval.')
      }
      const prepared = await sendContractTransaction('invoiceRegistry', props.signer!, 'submitInvoice', [
        invoice.buyer, id(invoice.number), faceValue, issuedAt, dueAt, documentHash,
      ])
      return {
        ...prepared,
        send: async () => {
          let metadataId: string | undefined
          if (props.authenticated) {
            const metadata = await saveInvoiceMetadata({
              invoiceNumber: invoice.number,
              buyer: invoice.buyer,
              faceValue: faceValue.toString(),
              issuedAt: new Date(issuedAt * 1000).toISOString(),
              dueAt: new Date(dueAt * 1000).toISOString(),
              documentHash,
            })
            metadataId = metadata.data.id
          }
          const transaction = await prepared.send()
          return { transaction: 'transaction' in transaction ? transaction.transaction : transaction, metadataId }
        },
      }
    })
  }

  const decide = async (invoiceId: bigint, action: 'confirmInvoice' | 'rejectInvoice') => {
    if (!props.signer) return
    await props.runTransaction(action === 'confirmInvoice' ? 'Confirm invoice' : 'Reject invoice', 'invoiceRegistry', () =>
      sendContractTransaction('invoiceRegistry', props.signer!, action, [invoiceId]),
    )
  }

  return (
    <Stack gap="lg">
      <PageHeader eyebrow="Receivables" title="Invoices" description="Work from the invoices linked to your connected wallet." />
      <ContractNotice />
      {props.protocol.error && <Alert color="red" title="Could not load invoices">{props.protocol.error}</Alert>}
      {!roleActive && props.address && (
        <Alert color={props.protocol.roleStates[props.role] === 'pending' ? 'yellow' : 'blue'} title={`${props.role} role ${props.protocol.roleStates[props.role]}`}>
          {props.protocol.roleStates[props.role] === 'pending'
            ? 'Approval is required to start new work. Existing assigned records remain available.'
            : 'You can complete existing assigned records, but must request this role to start new work.'}
        </Alert>
      )}
      {props.role === 'Supplier' && roleActive && (
        <ActionCard title="Create invoice" description="Enter the receivable details the buyer will review.">
          {!props.authenticated && <Alert color="blue" variant="light" mb="md">Sign in to save the business invoice number with your account.</Alert>}
          <form onSubmit={submit} className="form-grid">
            <TextInput label="Buyer wallet" placeholder="0x…" required value={invoice.buyer} onChange={(e) => update('buyer', e.currentTarget.value)} />
            <TextInput label="Invoice number" placeholder="INV-2026-001" required value={invoice.number} onChange={(e) => update('number', e.currentTarget.value)} />
            <TextInput label="Face value (ETH)" placeholder="0.10" required value={invoice.amount} onChange={(e) => update('amount', e.currentTarget.value)} />
            <TextInput label="Issue date" type="date" required value={invoice.issuedAt} onChange={(e) => update('issuedAt', e.currentTarget.value)} />
            <TextInput label="Due date" type="date" required value={invoice.dueAt} onChange={(e) => update('dueAt', e.currentTarget.value)} />
            <TextInput label="Document hash (optional)" placeholder="0x bytes32" value={invoice.documentHash} onChange={(e) => update('documentHash', e.currentTarget.value)} />
            <Button type="submit" disabled={newBusinessDisabled} className="full-span">Submit invoice</Button>
          </form>
        </ActionCard>
      )}
      {(props.role === 'Supplier' || props.role === 'Buyer') && (
        <section>
          <Group justify="space-between" mb="sm">
            <div>
              <Text fw={700}>{props.role === 'Buyer' ? 'Invoices for your review' : 'Your invoices'}</Text>
              <Text size="sm" c="dimmed">Status and available actions update from Sepolia.</Text>
            </div>
            <Badge variant="light">{ownInvoices.length}</Badge>
          </Group>
          {props.protocol.loading ? <Loader size="sm" /> : ownInvoices.length === 0 ? (
            <Paper withBorder radius="lg" ta="center" className="compact-empty"><Text size="sm" c="dimmed">No invoices are linked to this wallet.</Text></Paper>
          ) : (
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {ownInvoices.map((item) => (
                <InvoiceCard key={item.id.toString()} invoice={item} metadata={props.invoiceMetadata.find((metadata) => metadata.onchainInvoiceId === item.id.toString())}>
                  {props.role === 'Buyer' && item.status === 1 && (
                    <Group grow mt="md">
                      <Button disabled={participantDisabled} onClick={() => void decide(item.id, 'confirmInvoice')}>Confirm</Button>
                      <Button color="red" variant="light" disabled={participantDisabled} onClick={() => void decide(item.id, 'rejectInvoice')}>Reject</Button>
                    </Group>
                  )}
                </InvoiceCard>
              ))}
            </SimpleGrid>
          )}
        </section>
      )}
      {!['Supplier', 'Buyer'].includes(props.role) && <Alert color="blue">Choose Supplier or Buyer to work with invoices.</Alert>}
    </Stack>
  )
}

function InvoiceCard({ invoice, metadata, children }: { invoice: InvoiceRecord; metadata?: InvoiceMetadata; children?: React.ReactNode }) {
  return (
    <Paper withBorder radius="lg" p="md" className="record-card">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={750}>{metadata?.invoiceNumber ?? `${formatEth(invoice.faceValue)} ETH`}</Text>
          {metadata && <Text size="sm" fw={650}>{formatEth(invoice.faceValue)} ETH</Text>}
          <Text size="sm" c="dimmed">Due {new Date(invoice.dueAt * 1000).toLocaleDateString()}</Text>
        </div>
        <Badge color={invoiceStatusColor(invoice.status)} variant="light">{invoiceStatusLabels[invoice.status] ?? 'Unknown'}</Badge>
      </Group>
      <Group justify="space-between" mt="sm" gap="xs">
        <Text size="sm" c="dimmed">Supplier {compactAddress(invoice.supplier)}</Text>
        <Text size="sm" c="dimmed">Buyer {compactAddress(invoice.buyer)}</Text>
      </Group>
      {children}
      <Text
        component="a"
        href={`https://sepolia.etherscan.io/address/${contractAddresses.invoiceRegistry}`}
        target="_blank"
        rel="noreferrer"
        size="sm"
        fw={650}
        c="blue"
        mt="md"
        className="record-link"
      >
        View on Etherscan ↗
      </Text>
    </Paper>
  )
}

function formatEth(value: bigint) {
  return Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 6 })
}

function compactAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function invoiceStatusColor(status: number) {
  if (status === 2 || status === 9) return 'red'
  if (status === 6) return 'green'
  if (status === 7 || status === 8) return 'orange'
  if (status === 1) return 'yellow'
  return 'blue'
}
