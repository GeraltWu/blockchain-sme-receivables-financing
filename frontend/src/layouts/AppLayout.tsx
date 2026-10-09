import { useState } from 'react'
import { Alert, AppShell, Badge, Box, Button, Group, NavLink, ScrollArea, Select, Stack, Text, UnstyledButton } from '@mantine/core'
import type { ActionFeedback, PageKey, RoleState, UserRole } from '../types/domain'

interface AppLayoutProps {
  page: PageKey
  role: UserRole
  onRoleChange: (role: UserRole) => void
  onNavigate: (page: PageKey) => void
  address: string
  isSepolia: boolean
  authenticated: boolean
  busy: boolean
  error?: string
  roleStates: Record<UserRole, RoleState>
  availableRoles: UserRole[]
  feedback?: ActionFeedback
  onDismissFeedback: () => void
  onConnect: () => void
  onSwitchNetwork: () => void
  onSignIn: () => void
  onSignOut: () => void
  children: React.ReactNode
}

type NavigationIconName = 'home' | 'activity' | 'transactions' | 'profile'

const navigation: Array<{ key: PageKey; label: string; icon: NavigationIconName }> = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'activity', label: 'Activity', icon: 'activity' },
  { key: 'transactions', label: 'Transactions', icon: 'transactions' },
  { key: 'profile', label: 'Profile', icon: 'profile' },
]

const roles: UserRole[] = ['Supplier', 'Buyer', 'Funder', 'Auditor', 'Arbitrator', 'Admin']

function compactAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function AppLayout(props: AppLayoutProps) {
  const [copied, setCopied] = useState(false)
  const activeNavigationPage = props.page === 'roles' ? 'profile' : props.page
  const navigate = (key: PageKey) => {
    props.onNavigate(key)
  }

  const copyAddress = async () => {
    if (!props.address) return
    try {
      await navigator.clipboard.writeText(props.address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      const field = document.createElement('textarea')
      field.value = props.address
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      const succeeded = document.execCommand('copy')
      field.remove()
      if (succeeded) {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      }
    }
  }

  const roleOptions = roles.map((role) => ({
    value: role,
    label: role,
    disabled: Boolean(props.address) && !props.availableRoles.includes(role) && role !== props.role,
  }))

  return (
    <AppShell
      header={{ height: 66 }}
      navbar={{ width: 244, breakpoint: 'sm', collapsed: { mobile: true } }}
      padding={{ base: 'md', sm: 'xl' }}
    >
      <AppShell.Header px={{ base: 'md', sm: 'xl' }} className="app-header">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Box className="brand-mark">SF</Box>
            <Box visibleFrom="xs">
              <Text fw={750} lh={1.1}>SME Flow</Text>
              <Text size="xs" c="dimmed">Receivables finance</Text>
            </Box>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Select
              aria-label="Active role"
              className="role-select"
              size="xs"
              value={props.role}
              data={roleOptions}
              leftSection={props.address ? <RoleStatusDot active={props.roleStates[props.role] === 'active'} /> : undefined}
              renderOption={({ option }) => (
                <Group gap="xs" wrap="nowrap">
                  <RoleStatusDot active={props.roleStates[option.value as UserRole] === 'active'} />
                  <span>{option.label}</span>
                </Group>
              )}
              onChange={(value) => props.onRoleChange((value ?? 'Supplier') as UserRole)}
              allowDeselect={false}
              disabled={!props.address}
            />
            <Badge color={props.isSepolia ? 'blue' : 'gray'} variant="light" visibleFrom="xs">Sepolia</Badge>
            {!props.address && <Button size="xs" onClick={props.onConnect} loading={props.busy}>Connect</Button>}
            {props.address && (
              <UnstyledButton
                className="wallet-address-button"
                aria-label="Copy wallet address"
                title={copied ? 'Address copied' : `Copy ${props.address}`}
                onClick={() => void copyAddress()}
              >
                <span>{copied ? 'Copied' : compactAddress(props.address)}</span>
                <span className="copy-icon" aria-hidden="true">⧉</span>
              </UnstyledButton>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" className="app-sidebar">
        <AppShell.Section grow component={ScrollArea}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" mb="xs">Workspace</Text>
          <Stack gap={4}>
            {navigation.map((item) => (
              <NavLink
                key={item.key}
                active={activeNavigationPage === item.key}
                label={item.label}
                leftSection={<span className="nav-glyph"><NavigationIcon name={item.icon} /></span>}
                onClick={() => navigate(item.key)}
                className="nav-item"
              />
            ))}
          </Stack>
        </AppShell.Section>
        <AppShell.Section pt="md">
          <Box className="account-panel">
            <Text size="xs" c="dimmed">Connected account</Text>
            <Text size="sm" fw={650} mt={3}>{props.address ? compactAddress(props.address) : 'No wallet connected'}</Text>
            {props.error && <Text size="xs" c="red" mt="xs">{props.error}</Text>}
            {!props.address && <Button fullWidth mt="sm" loading={props.busy} onClick={props.onConnect}>Connect wallet</Button>}
            {props.address && !props.isSepolia && <Button fullWidth mt="sm" color="blue" loading={props.busy} onClick={props.onSwitchNetwork}>Switch network</Button>}
            {props.address && props.isSepolia && !props.authenticated && <Button fullWidth mt="sm" loading={props.busy} onClick={props.onSignIn}>Sign in</Button>}
            {props.address && props.authenticated && <Button fullWidth mt="sm" variant="subtle" color="gray" onClick={props.onSignOut}>Sign out</Button>}
          </Box>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Box className="content-shell">
          {props.feedback && (
            <Alert
              className="action-feedback"
              color={props.feedback.type === 'error' ? 'red' : props.feedback.type === 'success' ? 'green' : 'blue'}
              title={props.feedback.title}
              withCloseButton
              onClose={props.onDismissFeedback}
              mb="lg"
            >
              {props.feedback.message}
            </Alert>
          )}
          {!props.feedback && props.error && <Alert color="red" title="Wallet error" mb="lg">{props.error}</Alert>}
          {props.children}
        </Box>
      </AppShell.Main>

      <Box className="mobile-nav" hiddenFrom="sm">
        {navigation.map((item) => (
          <button key={item.key} className={activeNavigationPage === item.key ? 'active' : ''} onClick={() => navigate(item.key)}>
            <NavigationIcon name={item.icon} />
            {item.label}
          </button>
        ))}
      </Box>
    </AppShell>
  )
}

function RoleStatusDot({ active }: { active: boolean }) {
  return <span className={`role-status-dot ${active ? 'active' : 'inactive'}`} aria-label={active ? 'Active role' : 'Inactive role'} />
}

function NavigationIcon({ name }: { name: NavigationIconName }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === 'home' && <>
        <path d="M3.5 10.5 12 3.5l8.5 7" />
        <path d="M5.5 9.5V21h13V9.5" />
        <path d="M9.5 21v-6h5v6" />
      </>}
      {name === 'activity' && <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V2.5h6V4" />
        <path d="M8.5 9h7M8.5 13h7M8.5 17h4.5" />
      </>}
      {name === 'transactions' && <>
        <path d="M5 7h13" />
        <path d="m15 4 3 3-3 3" />
        <path d="M19 17H6" />
        <path d="m9 14-3 3 3 3" />
      </>}
      {name === 'profile' && <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </>}
    </svg>
  )
}
