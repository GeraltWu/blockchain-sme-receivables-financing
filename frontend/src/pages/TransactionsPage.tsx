import { Anchor, Badge, Group, Paper, Stack, Text } from '@mantine/core'
import { PageHeader } from '../components/PageHeader'
import type { ContractName, TransactionItem } from '../types/domain'

interface TransactionsPageProps {
  transactions: TransactionItem[]
}

const contractLabels: Record<ContractName, string> = {
  roleRegistry: 'Role Registry',
  invoiceRegistry: 'Invoice Registry',
  financingMarket: 'Financing Market',
  financingPool: 'Financing Pool',
  disputeResolution: 'Dispute Resolution',
}

export function TransactionsPage({ transactions }: TransactionsPageProps) {
  return (
    <Stack gap="lg">
      <PageHeader eyebrow="Activity" title="Transactions" description="Follow wallet requests and verified Sepolia transaction history." />
      {transactions.length === 0 ? (
        <Paper radius="lg" withBorder ta="center" className="compact-empty">
          <Stack gap={2}>
            <Text fw={700}>No transactions yet</Text>
            <Text size="sm" c="dimmed">Your role, invoice, and financing actions will appear here.</Text>
          </Stack>
        </Paper>
      ) : (
        <Stack gap="sm">
          {transactions.map((transaction) => (
            <Paper key={transaction.id} radius="lg" p="md" withBorder className="transaction-card record-card">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div className="transaction-main">
                  <Text fw={700}>{transaction.action}</Text>
                  <Text size="xs" c="dimmed" mt={2}>
                    {contractLabels[transaction.contract]} · {new Date(transaction.createdAt).toLocaleString()}
                  </Text>
                </div>
                <Badge color={statusColor(transaction.status)} variant="light" className="transaction-status">
                  {statusLabel(transaction.status)}
                </Badge>
              </Group>

              {transaction.error && (
                <div className="transaction-error">
                  <Text size="sm" fw={650} c="red.8">Transaction not completed</Text>
                  <Text size="sm" c="red.7" mt={2}>{transaction.error}</Text>
                </div>
              )}

              {transaction.status === 'confirmed' && transaction.syncStatus === 'failed' && (
                <div className="transaction-sync-warning">
                  <Text size="sm" fw={650} c="orange.9">Confirmed on-chain · Sync incomplete</Text>
                  <Text size="sm" c="orange.8" mt={2}>{transaction.syncError}</Text>
                </div>
              )}

              {transaction.status === 'confirmed' && transaction.syncStatus === 'verifying' && (
                <Text size="xs" c="dimmed" mt="sm">Verifying transaction with the platform…</Text>
              )}

              {transaction.hash && (
                <Anchor
                  size="sm"
                  fw={650}
                  className="record-link transaction-footer"
                  href={`https://sepolia.etherscan.io/tx/${transaction.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Etherscan ↗
                </Anchor>
              )}

              {!transaction.hash && (transaction.status === 'failed' || transaction.status === 'cancelled') ? (
                <Text size="xs" c="dimmed" mt="sm">No transaction was submitted to Sepolia.</Text>
              ) : null}
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  )
}

function statusColor(status: TransactionItem['status']) {
  if (status === 'confirmed') return 'green'
  if (status === 'failed') return 'red'
  if (status === 'cancelled') return 'gray'
  return 'blue'
}

function statusLabel(status: TransactionItem['status']) {
  const labels: Record<TransactionItem['status'], string> = {
    awaiting_signature: 'Awaiting signature',
    confirming: 'Confirming',
    confirmed: 'Confirmed',
    failed: 'Failed',
    cancelled: 'Cancelled',
  }
  return labels[status]
}
