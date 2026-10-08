import { SegmentedControl, Stack } from '@mantine/core'
import type { JsonRpcSigner } from 'ethers'
import type { useProtocolData } from '../hooks/useProtocolData'
import { FinancingPage } from './FinancingPage'
import { InvoicesPage } from './InvoicesPage'
import { RolesPage } from './RolesPage'
import type { ActivitySection, TransactionRunner, UserRole } from '../types/domain'

interface ActivityPageProps {
  section: ActivitySection
  role: UserRole
  signer?: JsonRpcSigner
  isSepolia: boolean
  authenticated: boolean
  address: string
  protocol: ReturnType<typeof useProtocolData>
  onSectionChange: (section: ActivitySection) => void
  runTransaction: TransactionRunner
}

export function ActivityPage(props: ActivityPageProps) {
  const sections = props.role === 'Admin' || props.role === 'Auditor' || props.role === 'Arbitrator'
    ? [{ value: 'roles', label: 'Roles' }]
    : props.role === 'Funder'
      ? [{ value: 'financing', label: 'Financing' }, { value: 'roles', label: 'Roles' }]
      : [
          { value: 'invoices', label: 'Invoices' },
          { value: 'financing', label: 'Financing' },
          { value: 'roles', label: 'Roles' },
        ]
  const visibleSection = sections.some((item) => item.value === props.section)
    ? props.section
    : sections[0].value as ActivitySection

  return (
    <Stack gap="lg">
      {sections.length > 1 && <div className="section-tabs">
        <SegmentedControl
          fullWidth
          value={visibleSection}
          onChange={(value) => props.onSectionChange(value as ActivitySection)}
          data={sections}
        />
      </div>}
      {visibleSection === 'invoices' && (
        <InvoicesPage
          role={props.role}
          signer={props.signer}
          isSepolia={props.isSepolia}
          authenticated={props.authenticated}
          address={props.address}
          protocol={props.protocol}
          runTransaction={props.runTransaction}
        />
      )}
      {visibleSection === 'financing' && (
        <FinancingPage role={props.role} address={props.address} signer={props.signer} isSepolia={props.isSepolia} protocol={props.protocol} runTransaction={props.runTransaction} />
      )}
      {visibleSection === 'roles' && (
        <RolesPage role={props.role} signer={props.signer} isSepolia={props.isSepolia} protocol={props.protocol} runTransaction={props.runTransaction} />
      )}
    </Stack>
  )
}

