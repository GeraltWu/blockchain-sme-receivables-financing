import { useState } from 'react'
import { Alert, Badge, Button, Group, Loader, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { formatEther } from 'ethers'
import type { useProtocolData } from '../hooks/useProtocolData'
import type { ActivitySection, TransactionItem, UserRole } from '../types/domain'
import type { InvoiceMetadata } from '../services/api'
import { invoiceStatusLabels } from '../types/protocol'

interface HomePageProps {
  role: UserRole
  address: string
  authenticated: boolean
  isSepolia: boolean
  transactions: TransactionItem[]
  protocol: ReturnType<typeof useProtocolData>
  invoiceMetadata: InvoiceMetadata[]
  hasExistingAccess: boolean
  onConnect: () => void
  onSignIn: () => void
  onOpenActivity: (section: ActivitySection | 'roles') => void
  onOpenTransactions: () => void
}

const roleHeadings: Record<UserRole, [string, string]> = {
  Supplier: ['Manage your receivables', 'Create invoices, request early funding, and compare offers.'],
  Buyer: ['Review and settle invoices', 'Confirm invoices assigned to you and repay funded receivables.'],
  Funder: ['Find financing opportunities', 'Quote rates and fund the requests that accept your offer.'],
  Auditor: ['Review protocol activity', 'Inspect on-chain records and recent transactions.'],
  Arbitrator: ['Resolve protected workflows', 'Review evidence hashes and apply predefined dispute outcomes.'],
  Admin: ['Manage platform access', 'Approve participant roles for the wallets joining the platform.'],
}

export function HomePage(props: HomePageProps) {
  const [loadedAt] = useState(Date.now)
  const address = props.address.toLowerCase()
  const [heading, description] = roleHeadings[props.role]
  const roleStatus = props.protocol.roleStates[props.role]
  const workspaceAvailable = Boolean(props.address && props.isSepolia && (roleStatus === 'active' || props.hasExistingAccess))
  const relatedInvoices = props.protocol.invoices.filter((invoice) => {
    if (props.role === 'Supplier') return invoice.supplier.toLowerCase() === address
    if (props.role === 'Buyer') return invoice.buyer.toLowerCase() === address
    return props.role === 'Auditor' || props.role === 'Admin'
  }).reverse()
  const todo = getTasks(props.role, address, props.protocol.invoices, props.protocol.financings, props.protocol.disputes, loadedAt, roleStatus === 'active')
  const recentTransactions = props.transactions.slice(0, 3)

  return (
    <Stack gap="lg">
      <section>
        <Group gap="sm">
          <Text className="eyebrow">{props.role} workspace</Text>
          {props.address && <Badge size="sm" color={roleStatus === 'active' ? 'green' : roleStatus === 'pending' ? 'yellow' : 'gray'} variant="light">{roleStatus === 'active' ? 'Active role' : roleStatus === 'pending' ? 'Approval pending' : 'Role not active'}</Badge>}
        </Group>
        <Title order={1} mt={4}>{heading}</Title>
        <Text c="dimmed" mt="xs" maw={660}>{description}</Text>
      </section>

      {!props.address ? (
        <Paper className="primary-panel" radius="xl" p={{ base: 'lg', sm: 'xl' }} withBorder>
          <Stack gap="md" align="flex-start"><div><Title order={2}>Connect your wallet</Title><Text c="dimmed" mt={6}>Connect MetaMask to load your roles, invoices, and financing from Sepolia.</Text></div><Button onClick={props.onConnect}>Connect MetaMask</Button></Stack>
        </Paper>
      ) : !props.isSepolia ? (
        <Alert color="yellow" title="Sepolia required">Switch MetaMask to Sepolia to load your workspace.</Alert>
      ) : roleStatus !== 'active' ? (
        <Paper className="primary-panel" radius="xl" p="lg" withBorder>
          <Group justify="space-between" align="center"><div><Text fw={750}>{roleStatus === 'pending' ? 'Role request awaiting approval' : `${props.role} access is not active`}</Text><Text size="sm" c="dimmed" mt={4}>{props.hasExistingAccess ? 'You can review and complete records already assigned to this wallet, but cannot start new work for this role.' : roleStatus === 'pending' ? 'You can use this workspace after an administrator approves the request.' : 'Review your wallet roles and request the access you need.'}</Text></div><Button variant="light" onClick={() => props.onOpenActivity('roles')}>Manage roles</Button></Group>
        </Paper>
      ) : !props.authenticated ? (
        <Paper className="primary-panel" radius="xl" p="lg" withBorder>
          <Group justify="space-between" align="center"><div><Text fw={750}>Sign in for saved business details</Text><Text size="sm" c="dimmed" mt={4}>On-chain data is already available. Signing in also loads private invoice metadata.</Text></div><Button onClick={props.onSignIn}>Sign in</Button></Group>
        </Paper>
      ) : null}

      {workspaceAvailable && props.protocol.error && <Alert color="red" title="Could not load on-chain workspace">{props.protocol.error}</Alert>}
      {workspaceAvailable && (props.protocol.loading ? <Loader size="sm" /> : (
        <section>
          <Group justify="space-between" mb="sm"><div><Title order={2}>To do</Title><Text size="sm" c="dimmed">Items that currently need your attention</Text></div><Badge variant="light">{todo.reduce((sum, item) => sum + item.count, 0)}</Badge></Group>
          {todo.length === 0 ? <Paper withBorder radius="lg" ta="center" className="compact-empty"><Stack gap={2}><Text fw={650}>You're all caught up</Text><Text size="sm" c="dimmed">New work will appear here as the on-chain status changes.</Text></Stack></Paper> : (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              {todo.map((item) => <Paper key={item.title} className="task-card" radius="lg" p="md" withBorder onClick={() => props.onOpenActivity(item.section)}><Group justify="space-between" wrap="nowrap"><div><Text fw={700}>{item.title}</Text><Text size="sm" c="dimmed" mt={4}>{item.description}</Text></div><Badge variant="filled">{item.count}</Badge></Group></Paper>)}
            </SimpleGrid>
          )}
        </section>
      ))}

      {workspaceAvailable && <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        <section>
          <Group justify="space-between" mb="sm"><div><Title order={2}>Invoices</Title><Text size="sm" c="dimmed">On-chain records linked to this view</Text></div><Button variant="subtle" size="compact-sm" onClick={() => props.onOpenActivity('invoices')}>View all</Button></Group>
          <Paper radius="lg" withBorder className="list-panel">
            {relatedInvoices.length === 0 ? <EmptyRow title="No invoices yet" description="Relevant invoices will appear here automatically." /> : relatedInvoices.slice(0, 3).map((invoice) => (
              <Group key={invoice.id.toString()} className="list-row" justify="space-between" wrap="nowrap"><div><Text fw={650}>{props.invoiceMetadata.find((metadata) => metadata.onchainInvoiceId === invoice.id.toString())?.invoiceNumber ?? `${formatAmount(invoice.faceValue)} ETH`}</Text><Text size="xs" c="dimmed">{formatAmount(invoice.faceValue)} ETH · Due {new Date(invoice.dueAt * 1000).toLocaleDateString()}</Text></div><Badge size="xs" variant="light">{invoiceStatusLabels[invoice.status] ?? 'Unknown'}</Badge></Group>
            ))}
          </Paper>
        </section>
        <section>
          <Group justify="space-between" mb="sm"><div><Title order={2}>Recent activity</Title><Text size="sm" c="dimmed">Saved and current wallet transactions</Text></div><Button variant="subtle" size="compact-sm" onClick={props.onOpenTransactions}>View all</Button></Group>
          <Paper radius="lg" withBorder className="list-panel">
            {recentTransactions.length === 0 ? <EmptyRow title="No recent activity" description="Your latest contract actions will appear here." /> : recentTransactions.map((transaction) => (
              <Group key={transaction.id} className="list-row" justify="space-between" wrap="nowrap"><div><Text fw={650}>{transaction.action}</Text><Text size="xs" c="dimmed">{new Date(transaction.createdAt).toLocaleTimeString()}</Text></div><Badge color={transaction.status === 'confirmed' ? 'green' : transaction.status === 'failed' ? 'red' : 'blue'} variant="light">{transaction.status.replace('_', ' ')}</Badge></Group>
            ))}
          </Paper>
        </section>
      </SimpleGrid>}
    </Stack>
  )
}

function getTasks(role: UserRole, address: string, invoices: ReturnType<typeof useProtocolData>['invoices'], financings: ReturnType<typeof useProtocolData>['financings'], disputes: ReturnType<typeof useProtocolData>['disputes'], loadedAt: number, roleActive: boolean) {
  if (role === 'Supplier') {
    const ready = invoices.filter((item) => item.supplier.toLowerCase() === address && item.status === 3).length
    const offers = financings.filter((item) => item.supplier.toLowerCase() === address && item.status === 1 && item.offers.some((offer) => offer.status === 1)).length
    return [
      ...(roleActive && ready ? [{ title: 'Request financing', description: 'Confirmed invoices are ready for funding.', count: ready, section: 'financing' as const }] : []),
      ...(offers ? [{ title: 'Review funding offers', description: 'Funders have submitted offers to your requests.', count: offers, section: 'financing' as const }] : []),
    ]
  }
  if (role === 'Buyer') {
    const review = invoices.filter((item) => item.buyer.toLowerCase() === address && item.status === 1).length
    const repay = invoices.filter((item) => item.buyer.toLowerCase() === address && item.status === 5).length
    return [
      ...(review ? [{ title: 'Review invoices', description: 'Confirm or reject invoices sent to your wallet.', count: review, section: 'invoices' as const }] : []),
      ...(repay ? [{ title: 'Make repayments', description: 'Funded invoices are ready for settlement.', count: repay, section: 'financing' as const }] : []),
    ]
  }
  if (role === 'Funder') {
    const open = roleActive ? financings.filter((item) => item.status === 1 && item.deadline > loadedAt / 1000).length : 0
    const fund = financings.filter((item) => item.status === 2 && item.offers.some((offer) => offer.id === item.acceptedOfferId && offer.funder.toLowerCase() === address)).length
    return [
      ...(open ? [{ title: 'Review opportunities', description: 'Open financing requests are accepting offers.', count: open, section: 'financing' as const }] : []),
      ...(fund ? [{ title: 'Fund accepted offers', description: 'Suppliers selected your financing terms.', count: fund, section: 'financing' as const }] : []),
    ]
  }
  if (role === 'Admin') return [{ title: 'Manage participant roles', description: 'Approve submitted role requests.', count: 1, section: 'roles' as const }]
  if (role === 'Auditor') return [{ title: 'Review audit records', description: 'Inspect protocol events and cash movements.', count: financings.length + invoices.length, section: 'audit' as const }]
  if (role === 'Arbitrator') {
    const openCases = disputes.filter((item) => item.status === 1).length
    return openCases ? [{ title: 'Review dispute cases', description: 'Resolve open cases with predefined outcomes.', count: openCases, section: 'disputes' as const }] : []
  }
  return []
}

function EmptyRow({ title, description }: { title: string; description: string }) {
  return <Stack align="center" gap={2} p="md" ta="center"><Text fw={650}>{title}</Text><Text size="sm" c="dimmed">{description}</Text></Stack>
}

function formatAmount(wei: bigint) {
  return Number(formatEther(wei)).toLocaleString(undefined, { maximumFractionDigits: 4 })
}
