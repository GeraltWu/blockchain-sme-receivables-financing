import { useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Group, Loader, NumberInput, Paper, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { formatEther, parseEther, type JsonRpcSigner } from 'ethers'
import { PageHeader } from '../components/PageHeader'
import { ContractNotice } from '../components/ContractNotice'
import { contractAddresses } from '../config/contracts'
import type { useProtocolData } from '../hooks/useProtocolData'
import { sendContractTransaction } from '../services/contracts'
import type { TransactionRunner, UserRole } from '../types/domain'
import { financingStatusLabels, offerStatusLabels, type FinancingRecord, type InvoiceRecord, type OfferRecord } from '../types/protocol'

interface FinancingPageProps {
  role: UserRole
  address: string
  signer?: JsonRpcSigner
  isSepolia: boolean
  protocol: ReturnType<typeof useProtocolData>
  runTransaction: TransactionRunner
}

export function FinancingPage(props: FinancingPageProps) {
  const address = props.address.toLowerCase()
  const [loadedAt] = useState(Date.now)
  const roleActive = props.protocol.roleStates[props.role] === 'active'
  const marketDisabled = !props.signer || !props.isSepolia || !contractAddresses.financingMarket || !roleActive
  const poolDisabled = !props.signer || !props.isSepolia || !contractAddresses.financingPool || !roleActive
  const invoiceById = new Map(props.protocol.invoices.map((invoice) => [invoice.id.toString(), invoice]))
  const supplierFinancings = props.protocol.financings.filter((item) => item.supplier.toLowerCase() === address).reverse()
  const eligibleInvoices = props.protocol.invoices.filter((item) => item.supplier.toLowerCase() === address && item.status === 3).reverse()
  const openFinancings = props.protocol.financings.filter((item) =>
    item.status === 1
    && item.deadline > loadedAt / 1000
    && !item.offers.some((offer) => offer.funder.toLowerCase() === address && offer.status === 1),
  ).reverse()
  const funderProjects = props.protocol.financings.filter((item) =>
    item.offers.some((offer) => offer.funder.toLowerCase() === address),
  ).reverse()
  const repayableInvoices = props.protocol.invoices.filter((invoice) => invoice.buyer.toLowerCase() === address && invoice.status === 5).reverse()
  const repaidInvoices = props.protocol.invoices.filter((invoice) => invoice.buyer.toLowerCase() === address && invoice.status === 6).reverse()

  const acceptOffer = async (financing: FinancingRecord, offer: OfferRecord) => {
    if (!props.signer) return
    await props.runTransaction('Accept funding offer', 'financingMarket', () =>
      sendContractTransaction('financingMarket', props.signer!, 'acceptOffer', [financing.id, offer.id]),
    )
  }

  const fund = async (financing: FinancingRecord) => {
    if (!props.signer) return
    await props.runTransaction('Fund financing', 'financingPool', () =>
      sendContractTransaction('financingPool', props.signer!, 'fundFinancing', [financing.id], financing.principal),
    )
  }

  const repay = async (invoice: InvoiceRecord) => {
    if (!props.signer) return
    await props.runTransaction('Repay invoice', 'financingPool', () =>
      sendContractTransaction('financingPool', props.signer!, 'repayInvoice', [invoice.id], invoice.faceValue),
    )
  }

  return (
    <Stack gap="lg">
      <PageHeader eyebrow="Marketplace" title="Financing" description="Choose a receivable or financing opportunity and continue without entering contract IDs." />
      <ContractNotice />
      {props.protocol.error && <Alert color="red" title="Could not load financing data">{props.protocol.error}</Alert>}
      {!roleActive && props.address && (
        <Alert color={props.protocol.roleStates[props.role] === 'pending' ? 'yellow' : 'blue'} title={`${props.role} role ${props.protocol.roleStates[props.role]}`}>
          {props.protocol.roleStates[props.role] === 'pending'
            ? 'An administrator must approve this role before you can perform its actions.'
            : 'Open Roles to request access for this wallet.'}
        </Alert>
      )}
      {props.protocol.loading ? <Loader size="sm" /> : (
        <>
          {props.role === 'Supplier' && (
            <>
              <RecordSection title="Ready for financing" description="Confirmed invoices that can be financed." count={eligibleInvoices.length}>
                {eligibleInvoices.map((invoice) => (
                  <OpenRequestCard key={invoice.id.toString()} invoice={invoice} signer={props.signer} disabled={marketDisabled} runTransaction={props.runTransaction} />
                ))}
              </RecordSection>
              <RecordSection title="Your financing requests" description="Review offers and accept one directly." count={supplierFinancings.length}>
                {supplierFinancings.map((financing) => (
                  <FinancingCard key={financing.id.toString()} financing={financing} invoice={invoiceById.get(financing.invoiceId.toString())}>
                    {financing.status === 1 && financing.offers.filter((offer) => offer.status === 1).map((offer) => (
                      <Group key={offer.id.toString()} justify="space-between" className="offer-row" wrap="nowrap">
                        <div>
                          <Text fw={650}>{(offer.rateBps / 100).toFixed(2)}% APR</Text>
                          <Text size="xs" c="dimmed">From {compactAddress(offer.funder)}</Text>
                        </div>
                        <Button size="xs" disabled={marketDisabled} onClick={() => void acceptOffer(financing, offer)}>Accept</Button>
                      </Group>
                    ))}
                    {financing.status === 1 && financing.offers.filter((offer) => offer.status === 1).length === 0 && <Text size="sm" c="dimmed" mt="md">No active offers yet.</Text>}
                  </FinancingCard>
                ))}
              </RecordSection>
            </>
          )}
          {props.role === 'Funder' && (
            <>
              <RecordSection title="Open opportunities" description="Review the terms, then quote your rate." count={openFinancings.length}>
                {openFinancings.map((financing) => (
                  <OfferCard key={financing.id.toString()} financing={financing} invoice={invoiceById.get(financing.invoiceId.toString())} signer={props.signer} disabled={marketDisabled} runTransaction={props.runTransaction} />
                ))}
              </RecordSection>
              <RecordSection title="Your offers and investments" description="Your projects remain here as they move from offer to funding and settlement." count={funderProjects.length} emptyText="You have not submitted any offers yet.">
                {funderProjects.map((financing) => {
                  const ownOffers = financing.offers.filter((offer) => offer.funder.toLowerCase() === address)
                  const acceptedOffer = ownOffers.find((offer) => offer.id === financing.acceptedOfferId)
                  const latestOffer = ownOffers.at(-1)
                  return (
                  <FinancingCard key={financing.id.toString()} financing={financing} invoice={invoiceById.get(financing.invoiceId.toString())}>
                    {latestOffer && (
                      <Group justify="space-between" className="offer-row">
                        <div>
                          <Text size="xs" c="dimmed">Your offer</Text>
                          <Text fw={650}>{(latestOffer.rateBps / 100).toFixed(2)}% APR</Text>
                        </div>
                        <Badge color={latestOffer.status === 2 ? 'green' : latestOffer.status === 1 ? 'blue' : 'gray'} variant="light">
                          {offerStatusLabels[latestOffer.status] ?? 'Unknown'}
                        </Badge>
                      </Group>
                    )}
                    {financing.status === 2 && acceptedOffer && (
                      <Button fullWidth mt="md" disabled={poolDisabled} onClick={() => void fund(financing)}>Fund {formatEth(financing.principal)} ETH</Button>
                    )}
                    {financing.status === 2 && !acceptedOffer && <Text size="sm" c="dimmed" mt="md">Another funder's offer was selected.</Text>}
                    {financing.status === 3 && acceptedOffer && <Text size="sm" c="green" fw={650} mt="md">Funding sent · Awaiting buyer repayment</Text>}
                    {financing.status === 4 && acceptedOffer && <Text size="sm" c="green" fw={650} mt="md">Investment repaid and settled</Text>}
                  </FinancingCard>
                  )
                })}
              </RecordSection>
            </>
          )}
          {props.role === 'Buyer' && (
            <>
              <RecordSection title="Repayments due" description="Funded invoices assigned to your wallet. The exact amount is filled automatically." count={repayableInvoices.length}>
                {repayableInvoices.map((invoice) => (
                  <BuyerFinancingCard key={invoice.id.toString()} invoice={invoice}>
                    <Button fullWidth mt="md" disabled={poolDisabled} onClick={() => void repay(invoice)}>Repay {formatEth(invoice.faceValue)} ETH</Button>
                  </BuyerFinancingCard>
                ))}
              </RecordSection>
              <RecordSection title="Payment history" description="Completed financed invoices remain available for reference." count={repaidInvoices.length} emptyText="No completed repayments yet.">
                {repaidInvoices.map((invoice) => (
                  <BuyerFinancingCard key={invoice.id.toString()} invoice={invoice} settled />
                ))}
              </RecordSection>
            </>
          )}
          {!['Supplier', 'Buyer', 'Funder'].includes(props.role) && <Alert color="blue">Choose Supplier, Buyer, or Funder to use financing actions.</Alert>}
        </>
      )}
    </Stack>
  )
}

function RecordSection({ title, description, count, children, emptyText = 'Nothing needs your attention here.' }: { title: string; description: string; count: number; children: React.ReactNode; emptyText?: string }) {
  return (
    <section>
      <Group justify="space-between" mb="sm">
        <div><Text fw={700}>{title}</Text><Text size="sm" c="dimmed">{description}</Text></div>
        <Badge variant="light">{count}</Badge>
      </Group>
      {count === 0
        ? <Paper withBorder radius="lg" p="xl" ta="center"><Text c="dimmed">{emptyText}</Text></Paper>
        : <SimpleGrid cols={{ base: 1, md: 2 }}>{children}</SimpleGrid>}
    </section>
  )
}

function BuyerFinancingCard({ invoice, settled = false, children }: { invoice: InvoiceRecord; settled?: boolean; children?: React.ReactNode }) {
  return (
    <Paper withBorder radius="lg" p="lg" className="record-card">
      <Group justify="space-between">
        <Text fw={750}>{formatEth(invoice.faceValue)} ETH</Text>
        <Badge color={settled ? 'green' : 'blue'} variant="light">{settled ? 'Repaid' : 'Funded'}</Badge>
      </Group>
      <Text size="sm" c="dimmed" mt={4}>Due {new Date(invoice.dueAt * 1000).toLocaleDateString()}</Text>
      {children}
      <RecordLink address={contractAddresses.invoiceRegistry} />
    </Paper>
  )
}

function OpenRequestCard({ invoice, signer, disabled, runTransaction }: { invoice: InvoiceRecord; signer?: JsonRpcSigner; disabled: boolean; runTransaction: TransactionRunner }) {
  const [values, setValues] = useState(() => ({ principal: formatEther(invoice.faceValue * 80n / 100n), maxRate: '800', holdback: '1000', deadline: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16) }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!signer) return
    await runTransaction('Open financing request', 'financingMarket', () => sendContractTransaction('financingMarket', signer, 'openFinancing', [
      invoice.id, parseEther(values.principal), Number(values.maxRate), Number(values.holdback), Math.floor(new Date(values.deadline).getTime() / 1000),
    ]))
  }
  return (
    <Paper withBorder radius="lg" p="lg" className="record-card">
      <Group justify="space-between"><div><Text fw={750}>{formatEth(invoice.faceValue)} ETH invoice</Text><Text size="sm" c="dimmed">Due {new Date(invoice.dueAt * 1000).toLocaleDateString()}</Text></div><Badge variant="light">Confirmed</Badge></Group>
      <form onSubmit={submit} className="form-stack compact-form">
        <TextInput label="Funding amount (ETH)" required value={values.principal} onChange={(e) => setValues({ ...values, principal: e.currentTarget.value })} />
        <SimpleGrid cols={2}>
          <TextInput label="Max rate (bps)" required value={values.maxRate} onChange={(e) => setValues({ ...values, maxRate: e.currentTarget.value })} />
          <TextInput label="Holdback (bps)" required value={values.holdback} onChange={(e) => setValues({ ...values, holdback: e.currentTarget.value })} />
        </SimpleGrid>
        <TextInput label="Offer deadline" type="datetime-local" required value={values.deadline} onChange={(e) => setValues({ ...values, deadline: e.currentTarget.value })} />
        <Button type="submit" disabled={disabled}>Request financing</Button>
      </form>
      <RecordLink address={contractAddresses.invoiceRegistry} />
    </Paper>
  )
}

function OfferCard({ financing, invoice, signer, disabled, runTransaction }: { financing: FinancingRecord; invoice?: InvoiceRecord; signer?: JsonRpcSigner; disabled: boolean; runTransaction: TransactionRunner }) {
  const [rate, setRate] = useState<number | string>(Math.min(financing.maxRateBps, 600))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!signer) return
    await runTransaction('Submit funding offer', 'financingMarket', () => sendContractTransaction('financingMarket', signer, 'submitOffer', [financing.id, Number(rate)]))
  }
  return (
    <FinancingCard financing={financing} invoice={invoice}>
      <form onSubmit={submit} className="offer-form">
        <NumberInput label="Your annual rate (bps)" min={1} max={financing.maxRateBps} required value={rate} onChange={setRate} />
        <Button type="submit" disabled={disabled}>Submit offer</Button>
      </form>
    </FinancingCard>
  )
}

function FinancingCard({ financing, invoice, children }: { financing: FinancingRecord; invoice?: InvoiceRecord; children?: React.ReactNode }) {
  return (
    <Paper withBorder radius="lg" p="lg" className="record-card">
      <Group justify="space-between" align="flex-start">
        <div><Text fw={750}>{formatEth(financing.principal)} ETH requested</Text><Text size="sm" c="dimmed">Invoice value {invoice ? formatEth(invoice.faceValue) : '—'} ETH</Text></div>
        <Badge variant="light">{financingStatusLabels[financing.status] ?? 'Unknown'}</Badge>
      </Group>
      <SimpleGrid cols={2} mt="md">
        <div><Text size="xs" c="dimmed">Maximum APR</Text><Text size="sm" fw={650}>{(financing.maxRateBps / 100).toFixed(2)}%</Text></div>
        <div><Text size="xs" c="dimmed">Offer deadline</Text><Text size="sm" fw={650}>{new Date(financing.deadline * 1000).toLocaleString()}</Text></div>
      </SimpleGrid>
      {children}
      <RecordLink address={contractAddresses.financingMarket} />
    </Paper>
  )
}

function formatEth(value: bigint) {
  return Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 6 })
}

function compactAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function RecordLink({ address }: { address: string }) {
  return (
    <Text
      component="a"
      href={`https://sepolia.etherscan.io/address/${address}`}
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
  )
}
