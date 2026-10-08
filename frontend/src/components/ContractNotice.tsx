import { Alert } from '@mantine/core'
import { contractsConfigured } from '../config/contracts'

export function ContractNotice() {
  if (contractsConfigured) return null
  return (
    <Alert color="blue" variant="light" title="Service temporarily unavailable" mb="lg">
      Contract actions will be enabled when the platform connection is ready.
    </Alert>
  )
}

