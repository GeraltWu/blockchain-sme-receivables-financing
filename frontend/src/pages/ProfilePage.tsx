import { Badge, Button, Divider, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { formatEther } from 'ethers'
import { contractsConfigured } from '../config/contracts'
import type { RoleState, UserRole } from '../types/domain'

interface ProfilePageProps {
  role: UserRole
  roleStates: Record<UserRole, RoleState>
  address: string
  isSepolia: boolean
  authenticated: boolean
  busy: boolean
  balance?: bigint
  onConnect: () => void
  onSwitchNetwork: () => void
  onSignIn: () => void
  onSignOut: () => void
  onManageRoles: () => void
}

export function ProfilePage(props: ProfilePageProps) {
  return (
    <Stack gap="lg">
      <section>
        <Text className="eyebrow">Account</Text>
        <Title order={1} mt={4}>Profile and settings</Title>
        <Text c="dimmed" mt="xs">Manage your wallet connection, session, and platform access.</Text>
      </section>

      <Paper radius="lg" p="md" withBorder className="record-card">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text size="sm" c="dimmed">Wallet</Text>
            <Text fw={700} className="address-text" mt={3}>{props.address || 'Not connected'}</Text>
          </div>
          <Badge color={props.address ? 'blue' : 'gray'} variant="light">{props.address ? 'Connected' : 'Offline'}</Badge>
        </Group>
        <Divider my="md" />
        <SimpleGrid cols={{ base: 2, xs: 4 }} spacing="sm">
          <Status label="Active view" value={props.role} ready />
          <Status label="Network" value={props.isSepolia ? 'Sepolia' : 'Action required'} ready={props.isSepolia} />
          <Status label="Session" value={props.authenticated ? 'Signed in' : 'Signed out'} ready={props.authenticated} />
          <Status label="Sepolia balance" value={!props.isSepolia ? 'Switch network' : props.balance === undefined ? '—' : `${formatBalance(props.balance)} ETH`} ready={props.isSepolia && props.balance !== undefined} />
        </SimpleGrid>
        <Group mt="md">
          {!props.address && <Button loading={props.busy} onClick={props.onConnect}>Connect MetaMask</Button>}
          {props.address && !props.isSepolia && <Button loading={props.busy} onClick={props.onSwitchNetwork}>Switch to Sepolia</Button>}
          {props.address && props.isSepolia && !props.authenticated && <Button loading={props.busy} onClick={props.onSignIn}>Sign in</Button>}
          {props.authenticated && <Button variant="light" color="gray" onClick={props.onSignOut}>Sign out</Button>}
        </Group>
      </Paper>

      <Paper radius="lg" p="md" withBorder className="record-card">
        <Group justify="space-between" align="center">
          <div>
            <Title order={3}>Participant roles</Title>
            <Text size="sm" c="dimmed" mt={4}>Request access or review role approval status.</Text>
          </div>
          <Button variant="light" onClick={props.onManageRoles}>Manage</Button>
        </Group>
        <SimpleGrid cols={{ base: 2, sm: 3 }} mt="md" spacing="sm">
          {(Object.entries(props.roleStates) as Array<[UserRole, RoleState]>).map(([role, status]) => (
            <Group key={role} justify="space-between" className="role-status-row" wrap="nowrap">
              <Text size="sm" fw={650}>{role}</Text>
              <Badge size="xs" color={status === 'active' ? 'green' : status === 'pending' ? 'yellow' : 'gray'} variant="light">
                {status === 'active' ? 'Active' : status === 'pending' ? 'Pending' : 'Not active'}
              </Badge>
            </Group>
          ))}
        </SimpleGrid>
      </Paper>

      {!contractsConfigured && (
        <Paper radius="lg" p="md" className="soft-notice" withBorder>
          <Text fw={650}>Platform services are not connected</Text>
          <Text size="sm" c="dimmed" mt={3}>Contract actions will become available after service setup is complete.</Text>
        </Paper>
      )}
    </Stack>
  )
}

function formatBalance(value: bigint) {
  return Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 6 })
}

function Status({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
      <Text fw={650} c={ready ? undefined : 'gray'}>{value}</Text>
    </div>
  )
}
