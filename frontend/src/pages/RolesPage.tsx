import { Alert, Badge, Button, Group, Loader, Paper, SimpleGrid, Stack, Text } from '@mantine/core'
import type { JsonRpcSigner } from 'ethers'
import { ContractNotice } from '../components/ContractNotice'
import { PageHeader } from '../components/PageHeader'
import { contractAddresses } from '../config/contracts'
import type { useProtocolData } from '../hooks/useProtocolData'
import { sendContractTransaction } from '../services/contracts'
import type { RoleState, TransactionRunner, UserRole } from '../types/domain'

const participantRoles = [
  { index: 0, role: 'Supplier', description: 'Create invoices and request early payment.' },
  { index: 1, role: 'Buyer', description: 'Review invoices and repay funded receivables.' },
  { index: 2, role: 'Funder', description: 'Make offers and fund accepted requests.' },
  { index: 3, role: 'Auditor', description: 'Review protocol records.' },
  { index: 4, role: 'Arbitrator', description: 'Reviews evidence and applies predefined dispute outcomes.' },
] as const

interface RolesPageProps {
  role: UserRole
  signer?: JsonRpcSigner
  isSepolia: boolean
  protocol: ReturnType<typeof useProtocolData>
  runTransaction: TransactionRunner
  onBack: () => void
}

export function RolesPage({ role, signer, isSepolia, protocol, runTransaction, onBack }: RolesPageProps) {
  const disabled = !signer || !isSepolia || !contractAddresses.roleRegistry

  const request = async (roleIndex: number, roleName: string) => {
    if (!signer) return
    await runTransaction(`Request ${roleName} role`, 'roleRegistry', () =>
      sendContractTransaction('roleRegistry', signer, 'requestRole', [roleIndex]),
    )
  }

  const approve = async (account: string, roleIndex: number, roleName: string) => {
    if (!signer) return
    await runTransaction(`Approve ${roleName} role`, 'roleRegistry', () =>
      sendContractTransaction('roleRegistry', signer, 'approveRole', [account, roleIndex]),
    )
  }

  const revoke = async (account: string, roleIndex: number, roleName: string) => {
    if (!signer) return
    await runTransaction(`Revoke ${roleName} role`, 'roleRegistry', () =>
      sendContractTransaction('roleRegistry', signer, 'revokeRole', [account, roleIndex]),
    )
  }

  return (
    <Stack gap="lg">
      <Button variant="subtle" size="compact-sm" onClick={onBack} className="back-link">← Back to profile</Button>
      <PageHeader eyebrow="Access" title="Participant roles" description="Active roles control available workspaces and new business actions." />
      <ContractNotice />
      {protocol.error && <Alert color="red" title="Could not load role status">{protocol.error}</Alert>}
      {!signer && <Alert color="blue">Connect MetaMask to load and manage roles.</Alert>}
      {role === 'Admin' ? (<>
        <section>
          <Group justify="space-between" mb="sm">
            <div>
              <Text fw={700}>Pending requests</Text>
              <Text size="sm" c="dimmed">Approve access requested by participant wallets.</Text>
            </div>
            <Badge variant="light">{protocol.roleRequests.length}</Badge>
          </Group>
          {protocol.roleRequestsError && <Alert color="red" title="Could not load role requests" mb="md">{protocol.roleRequestsError}</Alert>}
          {protocol.loading ? <Loader size="sm" /> : protocol.roleRequests.length === 0 ? (
            <Paper withBorder radius="lg" ta="center" className="compact-empty">
              <Text fw={650}>No pending role requests</Text>
              <Text size="sm" c="dimmed" mt={4}>New requests will appear here automatically.</Text>
            </Paper>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {protocol.roleRequests.map((request) => (
                <Paper key={`${request.account}:${request.roleIndex}`} withBorder radius="lg" p="md" className="record-card">
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <div>
                      <Text fw={750}>{request.role}</Text>
                      <Text size="sm" c="dimmed" mt={4} title={request.account}>{compactAddress(request.account)}</Text>
                    </div>
                    <Badge color="yellow" variant="light">Pending</Badge>
                  </Group>
                  <Button
                    fullWidth
                    mt="md"
                    disabled={disabled || protocol.roleStates.Admin !== 'active'}
                    onClick={() => void approve(request.account, request.roleIndex, request.role)}
                  >
                    Approve
                  </Button>
                </Paper>
              ))}
            </SimpleGrid>
          )}
        </section>
        <section>
          <Group justify="space-between" mb="sm">
            <div>
              <Text fw={700}>Active participant roles</Text>
              <Text size="sm" c="dimmed">Revoke access that should no longer start new business actions.</Text>
            </div>
            <Badge variant="light">{protocol.activeRoleAssignments.length}</Badge>
          </Group>
          {protocol.loading ? <Loader size="sm" /> : protocol.activeRoleAssignments.length === 0 ? (
            <Paper withBorder radius="lg" ta="center" className="compact-empty"><Text size="sm" c="dimmed">No active participant roles were found.</Text></Paper>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {protocol.activeRoleAssignments.map((assignment) => (
                <Paper key={`${assignment.account}:${assignment.roleIndex}`} withBorder radius="lg" p="md" className="record-card">
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <div><Text fw={750}>{assignment.role}</Text><Text size="sm" c="dimmed" mt={4} title={assignment.account}>{compactAddress(assignment.account)}</Text></div>
                    <Badge color="green" variant="light">Active</Badge>
                  </Group>
                  <Button fullWidth mt="md" color="red" variant="light" disabled={disabled || protocol.roleStates.Admin !== 'active'} onClick={() => void revoke(assignment.account, assignment.roleIndex, assignment.role)}>Revoke</Button>
                </Paper>
              ))}
            </SimpleGrid>
          )}
          <Alert color="blue" variant="light" mt="md">Revocation blocks new actions that require this role. Existing invoices and financing remain governed by their recorded participant addresses.</Alert>
        </section>
      </>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {participantRoles.map((item) => {
            const status = protocol.roleStates[item.role]
            return (
              <Paper key={item.role} withBorder radius="lg" p="md" className="record-card">
                <Group justify="space-between" align="flex-start">
                  <div><Text fw={750}>{item.role}</Text><Text size="sm" c="dimmed" mt={4}>{item.description}</Text></div>
                  <RoleBadge status={status} />
                </Group>
                {status === 'inactive' && <Button fullWidth mt="md" disabled={disabled} onClick={() => void request(item.index, item.role)}>Request role</Button>}
                {status === 'pending' && <Text size="sm" c="dimmed" mt="lg">Waiting for administrator approval.</Text>}
                {status === 'active' && <Text size="sm" c="green" fw={650} mt="lg">Ready to use</Text>}
              </Paper>
            )
          })}
        </SimpleGrid>
      )}
    </Stack>
  )
}

function compactAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}

function RoleBadge({ status }: { status: RoleState }) {
  const labels: Record<RoleState, string> = { active: 'Active', pending: 'Pending', inactive: 'Not active' }
  const colors: Record<RoleState, string> = { active: 'green', pending: 'yellow', inactive: 'gray' }
  return <Badge color={colors[status]} variant="light">{labels[status]}</Badge>
}
