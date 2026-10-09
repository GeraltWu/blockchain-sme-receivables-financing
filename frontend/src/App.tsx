import { useCallback, useEffect, useState } from 'react'
import { errorMessage, isUserRejectedError, useWallet } from './hooks/useWallet'
import { useProtocolData } from './hooks/useProtocolData'
import { AppLayout } from './layouts/AppLayout'
import { TransactionConfirmModal } from './components/TransactionConfirmModal'
import { ActivityPage } from './pages/ActivityPage'
import { HomePage } from './pages/HomePage'
import { ProfilePage } from './pages/ProfilePage'
import { RolesPage } from './pages/RolesPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { listInvoiceMetadata, listTransactions, verifyTransaction, type InvoiceMetadata } from './services/api'
import type { ActionFeedback, ActivitySection, ContractName, PageKey, PreparedTransaction, TransactionItem, TransactionRunner, UserRole } from './types/domain'

interface PendingReview {
  action: string
  contract: ContractName
  prepared: PreparedTransaction
  resolve: (approved: boolean) => void
}

function App() {
  const wallet = useWallet()
  const [page, setPage] = useState<PageKey>('home')
  const [roleSelection, setRoleSelection] = useState<{ address: string; role: UserRole }>()
  const [activitySection, setActivitySection] = useState<ActivitySection>('invoices')
  const [transactions, setTransactions] = useState<TransactionItem[]>([])
  const [invoiceMetadata, setInvoiceMetadata] = useState<InvoiceMetadata[]>([])
  const [protocolVersion, setProtocolVersion] = useState(0)
  const [feedback, setFeedback] = useState<ActionFeedback>()
  const [pendingReview, setPendingReview] = useState<PendingReview>()
  const protocol = useProtocolData(wallet.signer, wallet.address, wallet.isSepolia, protocolVersion)
  const defaultRole = (protocol.roleStates.Admin === 'active'
    ? 'Admin'
    : Object.entries(protocol.roleStates).find(([, status]) => status === 'active')?.[0] ?? 'Supplier') as UserRole
  const role = roleSelection?.address.toLowerCase() === wallet.address.toLowerCase()
    ? roleSelection.role
    : defaultRole
  const existingRoleViews = getExistingRoleViews(wallet.address, protocol)
  const availableRoleViews = (Object.entries(protocol.roleStates) as Array<[UserRole, string]>)
    .filter(([candidate, status]) => status === 'active' || existingRoleViews.has(candidate))
    .map(([candidate]) => candidate)
  const visibleTransactions = transactions.filter(
    (transaction) => transaction.walletAddress.toLowerCase() === wallet.address.toLowerCase(),
  )

  const refreshPrivateData = useCallback(async () => {
    if (!wallet.authenticated || !wallet.address) {
      setInvoiceMetadata([])
      return
    }
    const [metadataResult, transactionResult] = await Promise.allSettled([
      listInvoiceMetadata(),
      listTransactions(),
    ])
    if (metadataResult.status === 'fulfilled') setInvoiceMetadata(metadataResult.value.data)
    if (transactionResult.status === 'fulfilled') {
      const stored = transactionResult.value.data.map((item): TransactionItem => ({
        id: item.txHash,
        hash: item.txHash,
        walletAddress: item.wallet,
        action: item.action,
        contract: item.contractName as ContractName,
        status: item.status,
        createdAt: item.createdAt,
        syncStatus: 'verified',
      }))
      setTransactions((current) => {
        const storedHashes = new Set(stored.map((item) => item.hash))
        return [...current.filter((item) => !item.hash || !storedHashes.has(item.hash)), ...stored]
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      })
    }
  }, [wallet.address, wallet.authenticated])

  useEffect(() => {
    void refreshPrivateData()
  }, [refreshPrivateData])

  const changeRole = (nextRole: UserRole) => {
    setRoleSelection({ address: wallet.address, role: nextRole })
    if (nextRole === 'Funder') setActivitySection('financing')
    if (nextRole === 'Supplier' || nextRole === 'Buyer') setActivitySection('invoices')
    if (nextRole === 'Auditor') setActivitySection('audit')
    if (nextRole === 'Arbitrator') setActivitySection('disputes')
  }

  const openActivity = (section: ActivitySection | 'roles') => {
    if (section === 'roles') {
      setPage('roles')
      return
    }
    setActivitySection(section)
    setPage('activity')
  }

  const reviewTransaction = useCallback((action: string, contract: ContractName, prepared: PreparedTransaction) =>
    new Promise<boolean>((resolve) => setPendingReview({ action, contract, prepared, resolve })), [])

  const finishReview = (approved: boolean) => {
    const review = pendingReview
    setPendingReview(undefined)
    review?.resolve(approved)
  }

  const runTransaction: TransactionRunner = async (
    action: string,
    contract: ContractName,
    prepare,
  ) => {
    const id = crypto.randomUUID()
    setTransactions((current) => [{
      id,
      action,
      contract,
      walletAddress: wallet.address,
      status: 'awaiting_signature',
      createdAt: new Date().toISOString(),
    }, ...current])
    setFeedback({ type: 'info', title: action, message: 'Estimating the Sepolia transaction cost.' })
    try {
      const prepared = await prepare()
      const approved = await reviewTransaction(action, contract, prepared)
      if (!approved) {
        const cancelled = new Error('Transaction cancelled before opening MetaMask.') as Error & { code: string }
        cancelled.code = 'APP_REJECTED'
        throw cancelled
      }
      setFeedback({ type: 'info', title: action, message: 'Confirm this request in MetaMask.' })
      const submission = await prepared.send()
      const response = 'transaction' in submission ? submission.transaction : submission
      const metadataId = 'transaction' in submission ? submission.metadataId : undefined
      setFeedback({ type: 'info', title: action, message: 'Transaction submitted. Waiting for Sepolia confirmation.' })
      setTransactions((current) => current.map((item) => item.id === id
        ? { ...item, hash: response.hash, status: 'confirming' }
        : item))
      const receipt = await response.wait()
      if (!receipt || receipt.status !== 1) throw new Error('The transaction was reverted.')
      setTransactions((current) => current.map((item) => item.id === id
        ? {
            ...item,
            status: 'confirmed',
            syncStatus: wallet.authenticated ? 'verifying' : undefined,
          }
        : item))
      setProtocolVersion((current) => current + 1)
      void wallet.refreshBalance()
      setFeedback({ type: 'success', title: `${action} complete`, message: 'The transaction is confirmed. On-chain records will refresh automatically.' })
      if (wallet.authenticated) {
        void verifyTransaction(response.hash, contract, action, metadataId)
          .then(() => {
            setTransactions((current) => current.map((item) => item.id === id
              ? { ...item, syncStatus: 'verified', syncError: undefined }
              : item))
            void refreshPrivateData()
          })
          .catch((error) => {
            setTransactions((current) => current.map((item) => item.id === id
              ? { ...item, syncStatus: 'failed', syncError: errorMessage(error) }
              : item))
          })
      }
    } catch (error) {
      const message = errorMessage(error)
      setTransactions((current) => current.map((item) => item.id === id
        ? {
            ...item,
            status: isUserRejectedError(error) ? 'cancelled' : 'failed',
            error: message,
          }
        : item))
      setFeedback({
        type: 'error',
        title: isUserRejectedError(error) ? 'Request cancelled' : `${action} failed`,
        message,
      })
    }
  }

  const content = (() => {
    switch (page) {
      case 'home':
        return (
          <HomePage
            role={role}
            address={wallet.address}
            authenticated={wallet.authenticated}
            isSepolia={wallet.isSepolia}
            transactions={visibleTransactions}
            protocol={protocol}
            invoiceMetadata={invoiceMetadata}
            hasExistingAccess={existingRoleViews.has(role)}
            onConnect={() => void wallet.connect()}
            onSignIn={() => void wallet.signIn()}
            onOpenActivity={openActivity}
            onOpenTransactions={() => setPage('transactions')}
          />
        )
      case 'activity':
        return (
          <ActivityPage
            section={activitySection}
            role={role}
            signer={wallet.signer}
            isSepolia={wallet.isSepolia}
            authenticated={wallet.authenticated}
            address={wallet.address}
            protocol={protocol}
            invoiceMetadata={invoiceMetadata}
            onSectionChange={setActivitySection}
            runTransaction={runTransaction}
          />
        )
      case 'transactions':
        return <TransactionsPage transactions={visibleTransactions} />
      case 'profile':
        return (
          <ProfilePage
            role={role}
            roleStates={protocol.roleStates}
            address={wallet.address}
            isSepolia={wallet.isSepolia}
            authenticated={wallet.authenticated}
            busy={wallet.busy}
            balance={wallet.balance}
            onConnect={() => void wallet.connect()}
            onSwitchNetwork={() => void wallet.switchToSepolia()}
            onSignIn={() => void wallet.signIn()}
            onSignOut={wallet.signOut}
            onManageRoles={() => setPage('roles')}
          />
        )
      case 'roles':
        return (
          <RolesPage
            role={role}
            signer={wallet.signer}
            isSepolia={wallet.isSepolia}
            protocol={protocol}
            runTransaction={runTransaction}
            onBack={() => setPage('profile')}
          />
        )
    }
  })()

  return (
    <>
      <AppLayout
      page={page}
      role={role}
      onRoleChange={changeRole}
      onNavigate={setPage}
      address={wallet.address}
      isSepolia={wallet.isSepolia}
      authenticated={wallet.authenticated}
      busy={wallet.busy}
      error={wallet.error}
      roleStates={protocol.roleStates}
      availableRoles={availableRoleViews}
      feedback={feedback}
      onDismissFeedback={() => setFeedback(undefined)}
      onConnect={() => void wallet.connect()}
      onSwitchNetwork={() => void wallet.switchToSepolia()}
      onSignIn={() => void wallet.signIn()}
      onSignOut={wallet.signOut}
    >
      {content}
      </AppLayout>
      <TransactionConfirmModal
        opened={Boolean(pendingReview)}
        action={pendingReview?.action ?? ''}
        contract={pendingReview?.contract ?? 'roleRegistry'}
        summary={pendingReview?.prepared.summary}
        onCancel={() => finishReview(false)}
        onConfirm={() => finishReview(true)}
      />
    </>
  )
}

export default App

function getExistingRoleViews(address: string, protocol: ReturnType<typeof useProtocolData>) {
  const views = new Set<UserRole>()
  if (!address) return views
  const wallet = address.toLowerCase()
  if (protocol.invoices.some((item) => item.supplier.toLowerCase() === wallet) || protocol.financings.some((item) => item.supplier.toLowerCase() === wallet)) views.add('Supplier')
  if (protocol.invoices.some((item) => item.buyer.toLowerCase() === wallet)) views.add('Buyer')
  if (protocol.financings.some((item) => item.offers.some((offer) => offer.funder.toLowerCase() === wallet)) || protocol.fundings.some((item) => item.funder.toLowerCase() === wallet)) views.add('Funder')
  return views
}
