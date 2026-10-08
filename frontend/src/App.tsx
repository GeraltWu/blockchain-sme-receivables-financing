import { useState } from 'react'
import type { TransactionResponse } from 'ethers'
import { errorMessage, isUserRejectedError, useWallet } from './hooks/useWallet'
import { useProtocolData } from './hooks/useProtocolData'
import { AppLayout } from './layouts/AppLayout'
import { ActivityPage } from './pages/ActivityPage'
import { HomePage } from './pages/HomePage'
import { ProfilePage } from './pages/ProfilePage'
import { TransactionsPage } from './pages/TransactionsPage'
import { verifyTransaction } from './services/api'
import type { ActionFeedback, ActivitySection, ContractName, PageKey, TransactionItem, TransactionRunner, UserRole } from './types/domain'

function App() {
  const wallet = useWallet()
  const [page, setPage] = useState<PageKey>('home')
  const [roleSelection, setRoleSelection] = useState<{ address: string; role: UserRole }>()
  const [activitySection, setActivitySection] = useState<ActivitySection>('invoices')
  const [transactions, setTransactions] = useState<TransactionItem[]>([])
  const [protocolVersion, setProtocolVersion] = useState(0)
  const [feedback, setFeedback] = useState<ActionFeedback>()
  const protocol = useProtocolData(wallet.signer, wallet.address, wallet.isSepolia, protocolVersion)
  const defaultRole = (protocol.roleStates.Admin === 'active'
    ? 'Admin'
    : Object.entries(protocol.roleStates).find(([, status]) => status === 'active')?.[0] ?? 'Supplier') as UserRole
  const role = roleSelection?.address.toLowerCase() === wallet.address.toLowerCase()
    ? roleSelection.role
    : defaultRole
  const visibleTransactions = transactions.filter(
    (transaction) => transaction.walletAddress.toLowerCase() === wallet.address.toLowerCase(),
  )

  const changeRole = (nextRole: UserRole) => {
    setRoleSelection({ address: wallet.address, role: nextRole })
    if (nextRole === 'Admin') setActivitySection('roles')
    if (nextRole === 'Funder') setActivitySection('financing')
    if (nextRole === 'Supplier' || nextRole === 'Buyer') setActivitySection('invoices')
    if (nextRole === 'Auditor' || nextRole === 'Arbitrator') setActivitySection('roles')
  }

  const openActivity = (section: ActivitySection) => {
    setActivitySection(section)
    setPage('activity')
  }

  const runTransaction: TransactionRunner = async (
    action: string,
    contract: ContractName,
    send: () => Promise<TransactionResponse>,
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
    setFeedback({ type: 'info', title: action, message: 'Confirm this request in MetaMask.' })
    try {
      const response = await send()
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
      setFeedback({ type: 'success', title: `${action} complete`, message: 'The transaction is confirmed. On-chain records will refresh automatically.' })
      if (wallet.authenticated) {
        void verifyTransaction(response.hash, contract, action)
          .then(() => {
            setTransactions((current) => current.map((item) => item.id === id
              ? { ...item, syncStatus: 'verified', syncError: undefined }
              : item))
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
            onConnect={() => void wallet.connect()}
            onSwitchNetwork={() => void wallet.switchToSepolia()}
            onSignIn={() => void wallet.signIn()}
            onSignOut={wallet.signOut}
            onManageRoles={() => openActivity('roles')}
          />
        )
    }
  })()

  return (
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
      feedback={feedback}
      onDismissFeedback={() => setFeedback(undefined)}
      onConnect={() => void wallet.connect()}
      onSwitchNetwork={() => void wallet.switchToSepolia()}
      onSignIn={() => void wallet.signIn()}
      onSignOut={wallet.signOut}
    >
      {content}
    </AppLayout>
  )
}

export default App
