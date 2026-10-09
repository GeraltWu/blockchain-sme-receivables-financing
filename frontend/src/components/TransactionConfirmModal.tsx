import { Alert, Button, Code, Divider, Group, Modal, Paper, SimpleGrid, Stack, Text } from '@mantine/core'
import { formatEther } from 'ethers'
import type { ContractName, TransactionSummary } from '../types/domain'

interface Props {
  opened: boolean
  action: string
  contract: ContractName
  summary?: TransactionSummary
  onCancel: () => void
  onConfirm: () => void
}

const contractLabels: Record<ContractName, string> = {
  roleRegistry: 'Role Registry',
  invoiceRegistry: 'Invoice Registry',
  financingMarket: 'Financing Market',
  financingPool: 'Financing Pool',
  disputeResolution: 'Dispute Resolution',
}

export function TransactionConfirmModal({ opened, action, contract, summary, onCancel, onConfirm }: Props) {
  const total = summary ? summary.value + summary.estimatedNetworkFee : 0n
  const insufficient = Boolean(summary && total > summary.walletBalance)
  return (
    <Modal opened={opened} onClose={onCancel} title="Review transaction" centered radius="lg" size="md">
      {summary && <Stack gap="md">
        <div>
          <Text fw={750}>{action}</Text>
          <Text size="sm" c="dimmed">Review the estimated cost before opening MetaMask.</Text>
        </div>
        <Paper withBorder radius="md" p="md" className="transaction-review-panel">
          <Text size="xs" c="dimmed">Target contract</Text>
          <Text size="sm" fw={650} mt={2}>{contractLabels[contract]}</Text>
          <Code block mt="xs" className="contract-address-code">{summary.contractAddress}</Code>
          <Divider my="md" />
          <SimpleGrid cols={2} spacing="md">
            <Metric label="Amount sent" value={`${formatAmount(summary.value)} ETH`} />
            <Metric label="Estimated gas" value={summary.estimatedGas.toLocaleString()} />
            <Metric label="Estimated max fee" value={`${formatAmount(summary.estimatedNetworkFee)} ETH`} />
            <Metric label="Wallet balance" value={`${formatAmount(summary.walletBalance)} ETH`} />
          </SimpleGrid>
        </Paper>
        {insufficient && <Alert color="red" title="Insufficient Sepolia ETH">This wallet needs about {formatAmount(total)} ETH for the transfer and estimated network fee.</Alert>}
        <Text size="xs" c="dimmed">Gas prices can change before the transaction is confirmed. MetaMask will show the final wallet estimate.</Text>
        <Group grow>
          <Button variant="light" color="gray" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm} disabled={insufficient}>Continue to MetaMask</Button>
        </Group>
      </Stack>}
    </Modal>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><Text size="xs" c="dimmed">{label}</Text><Text size="sm" fw={700}>{value}</Text></div>
}

function formatAmount(value: bigint) {
  return Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 8 })
}
