import { Alert, SegmentedControl, Stack } from '@mantine/core'
import type { JsonRpcSigner } from 'ethers'
import type { useProtocolData } from '../hooks/useProtocolData'
import { FinancingPage } from './FinancingPage'
import { InvoicesPage } from './InvoicesPage'
import { AuditPage } from './AuditPage'
import { DisputesPage } from './DisputesPage'
import { PageHeader } from '../components/PageHeader'
import type { ActivitySection, TransactionRunner, UserRole } from '../types/domain'
import type { InvoiceMetadata } from '../services/api'

interface ActivityPageProps {
  section: ActivitySection
  role: UserRole
  signer?: JsonRpcSigner
  isSepolia: boolean
  authenticated: boolean
  address: string
  protocol: ReturnType<typeof useProtocolData>
  invoiceMetadata: InvoiceMetadata[]
  onSectionChange: (section: ActivitySection) => void
  runTransaction: TransactionRunner
}

export function ActivityPage(props: ActivityPageProps) {
  const sections = props.role === 'Admin'
    ? []
    : props.role === 'Arbitrator'
      ? [{ value: 'disputes', label: 'Disputes' }]
    : props.role === 'Auditor'
      ? [{ value: 'audit', label: 'Audit' }]
    : props.role === 'Funder'
      ? [{ value: 'financing', label: 'Financing' }, { value: 'disputes', label: 'Disputes' }]
      : [
          { value: 'invoices', label: 'Invoices' },
          { value: 'financing', label: 'Financing' },
          { value: 'disputes', label: 'Disputes' },
        ]
  if (sections.length === 0) {
    return <Stack gap="md"><PageHeader eyebrow="Workspace" title="Activity" description="Operational activity appears here when the selected role has an active workflow." /><Alert color="blue">Role access is managed from Profile.</Alert></Stack>
  }
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
          invoiceMetadata={props.invoiceMetadata}
          runTransaction={props.runTransaction}
        />
      )}
      {visibleSection === 'financing' && (
        <FinancingPage role={props.role} address={props.address} signer={props.signer} isSepolia={props.isSepolia} protocol={props.protocol} invoiceMetadata={props.invoiceMetadata} runTransaction={props.runTransaction} />
      )}
      {visibleSection === 'audit' && (
        <AuditPage signer={props.signer} isSepolia={props.isSepolia} roleActive={props.protocol.roleStates.Auditor === 'active'} protocol={props.protocol} invoiceMetadata={props.invoiceMetadata} />
      )}
      {visibleSection === 'disputes' && (
        <DisputesPage role={props.role} address={props.address} signer={props.signer} isSepolia={props.isSepolia} protocol={props.protocol} runTransaction={props.runTransaction} />
      )}
    </Stack>
  )
}

