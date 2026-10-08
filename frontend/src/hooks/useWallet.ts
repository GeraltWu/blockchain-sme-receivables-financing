import { useCallback, useEffect, useState } from 'react'
import { BrowserProvider, type Eip1193Provider, type JsonRpcSigner } from 'ethers'
import { SEPOLIA_CHAIN_HEX, SEPOLIA_CHAIN_ID } from '../config/contracts'
import { clearStoredToken, requestNonce, verifySignature } from '../services/api'

interface WalletState {
  address: string
  chainId?: bigint
  signer?: JsonRpcSigner
  authenticated: boolean
  busy: boolean
  error?: string
}

interface MetaMaskProvider extends Eip1193Provider {
  on(event: 'accountsChanged', listener: (accounts: string[]) => void): void
  on(event: 'chainChanged', listener: (chainId: string) => void): void
  removeListener(event: 'accountsChanged', listener: (accounts: string[]) => void): void
  removeListener(event: 'chainChanged', listener: (chainId: string) => void): void
}

function injectedProvider() {
  return (window as typeof window & { ethereum?: MetaMaskProvider }).ethereum
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: '',
    authenticated: false,
    busy: false,
  })

  const syncWallet = useCallback(async (ethereum: MetaMaskProvider) => {
    const accounts = await ethereum.request({ method: 'eth_accounts' }) as string[]
    if (accounts.length === 0) {
      setState({ address: '', authenticated: false, busy: false })
      return undefined
    }

    const provider = new BrowserProvider(ethereum)
    const signer = await provider.getSigner(accounts[0])
    const network = await provider.getNetwork()
    setState((current) => ({
      ...current,
      address: signer.address,
      chainId: network.chainId,
      signer,
      authenticated: false,
      busy: false,
      error: undefined,
    }))
    return { signer, address: signer.address, chainId: network.chainId }
  }, [])

  const authenticate = useCallback(async (signer: JsonRpcSigner, address: string) => {
    setState((current) => ({ ...current, busy: true, error: undefined }))
    const { message } = await requestNonce(address)
    const signature = await signer.signMessage(message)
    await verifySignature(address, message, signature)
    setState((current) => current.address.toLowerCase() === address.toLowerCase()
      ? { ...current, authenticated: true, busy: false, error: undefined }
      : current)
  }, [])

  useEffect(() => {
    const ethereum = injectedProvider()
    if (!ethereum) return

    const handleAccountsChanged = (accounts: string[]) => {
      clearStoredToken()
      if (accounts.length === 0) {
        setState({ address: '', authenticated: false, busy: false })
        return
      }
      void syncWallet(ethereum).catch((error) => {
        setState((current) => ({ ...current, authenticated: false, busy: false, error: errorMessage(error) }))
      })
    }

    const handleChainChanged = () => {
      clearStoredToken()
      void syncWallet(ethereum).catch((error) => {
        setState((current) => ({ ...current, authenticated: false, busy: false, error: errorMessage(error) }))
      })
    }

    ethereum.on('accountsChanged', handleAccountsChanged)
    ethereum.on('chainChanged', handleChainChanged)
    void syncWallet(ethereum).catch(() => undefined)

    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged)
      ethereum.removeListener('chainChanged', handleChainChanged)
    }
  }, [syncWallet])

  const connect = useCallback(async () => {
    const ethereum = injectedProvider()
    if (!ethereum) {
      setState((current) => ({ ...current, error: 'MetaMask is not installed.' }))
      return
    }
    setState((current) => ({ ...current, busy: true, error: undefined }))
    try {
      await ethereum.request({ method: 'eth_requestAccounts' })
      clearStoredToken()
      const connected = await syncWallet(ethereum)
      if (connected?.chainId === SEPOLIA_CHAIN_ID) {
        await authenticate(connected.signer, connected.address)
      }
    } catch (error) {
      setState((current) => ({ ...current, busy: false, error: errorMessage(error) }))
    }
  }, [authenticate, syncWallet])

  const switchToSepolia = useCallback(async () => {
    const ethereum = injectedProvider()
    if (!ethereum) return
    setState((current) => ({ ...current, busy: true, error: undefined }))
    try {
      await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA_CHAIN_HEX }] })
      clearStoredToken()
      const connected = await syncWallet(ethereum)
      if (connected?.chainId === SEPOLIA_CHAIN_ID) {
        await authenticate(connected.signer, connected.address)
      }
    } catch (error) {
      setState((current) => ({ ...current, busy: false, error: errorMessage(error) }))
    }
  }, [authenticate, syncWallet])

  const signIn = useCallback(async () => {
    if (!state.signer || !state.address) return
    setState((current) => ({ ...current, busy: true, error: undefined }))
    try {
      await authenticate(state.signer, state.address)
    } catch (error) {
      setState((current) => ({ ...current, busy: false, error: errorMessage(error) }))
    }
  }, [authenticate, state.address, state.signer])

  const signOut = useCallback(() => {
    clearStoredToken()
    setState((current) => ({ ...current, authenticated: false }))
  }, [])

  return {
    ...state,
    isSepolia: state.chainId === SEPOLIA_CHAIN_ID,
    connect,
    switchToSepolia,
    signIn,
    signOut,
  }
}

export function errorMessage(error: unknown) {
  const providerError = error as {
    code?: unknown
    data?: unknown
    error?: { data?: unknown }
    message?: unknown
    shortMessage?: unknown
    reason?: unknown
    info?: { error?: { data?: unknown; message?: unknown } }
  }

  if (isUserRejectedError(error)) return 'Request cancelled in MetaMask.'
  const contractError = decodeContractError(providerError)
  if (contractError) return contractError
  if (providerError.code === 'INSUFFICIENT_FUNDS') {
    return 'Insufficient Sepolia ETH for the transaction amount and gas.'
  }
  if (typeof providerError.reason === 'string' && providerError.reason) {
    return `Transaction reverted: ${providerError.reason}`
  }
  if (typeof providerError.shortMessage === 'string' && providerError.shortMessage) {
    return cleanErrorMessage(providerError.shortMessage)
  }
  const rpcMessage = providerError.info?.error?.message
  if (typeof rpcMessage === 'string' && rpcMessage) return cleanErrorMessage(rpcMessage)
  if (error instanceof Error) return cleanErrorMessage(error.message)
  return 'Something went wrong. Please try again.'
}

export function isUserRejectedError(error: unknown) {
  const value = error as { code?: unknown; message?: unknown }
  const message = typeof value?.message === 'string' ? value.message.toLowerCase() : ''
  return value?.code === 4001 || value?.code === 'ACTION_REJECTED' || message.includes('user rejected')
}

function cleanErrorMessage(message: string) {
  const firstLine = message.split('\n')[0]
  const technicalDetails = firstLine.indexOf(' (')
  const cleaned = technicalDetails > 0 ? firstLine.slice(0, technicalDetails) : firstLine
  return cleaned.length > 220 ? `${cleaned.slice(0, 217)}...` : cleaned
}

function decodeContractError(error: {
  data?: unknown
  error?: { data?: unknown }
  info?: { error?: { data?: unknown } }
}) {
  const data = extractHexData(error)
  if (!data) return undefined

  const messages: Record<string, string> = {
    '0xc15c60b4': 'Only the platform administrator can perform this action.',
    '0x6d187b28': 'The wallet address is invalid.',
    '0x2f6af0ee': 'This role request already exists.',
    '0xa810f304': 'This role is already active for the wallet.',
    '0x391cf229': 'This role is not active for the wallet.',
    '0x94235922': 'The required participant role is not active. Ask the administrator to approve it first.',
    '0xe6c4247b': 'One of the wallet or contract addresses is invalid.',
    '0x2c5211c6': 'The entered amount is invalid.',
    '0x81bf7f67': 'The selected date or deadline is invalid.',
    '0x769d11e4': 'The offer deadline must be in the future.',
    '0xf350785d': 'The holdback percentage is outside the allowed range.',
    '0x6a43f8d1': 'The interest rate is outside the allowed range.',
    '0x0af806e0': 'The document or invoice hash is invalid.',
    '0x3c002dc1': 'This invoice has already been registered.',
    '0x9ab90072': 'The invoice could not be found.',
    '0xf0e21312': 'The financing request could not be found.',
    '0x6df5846d': 'The funding offer could not be found.',
    '0xe2bc376b': 'Only the buyer assigned to this invoice can perform this action.',
    '0x01b51194': 'Only the supplier assigned to this invoice can perform this action.',
    '0x324a2e82': 'The selected funder conflicts with this financing request.',
    '0xcd086639': 'This financing request has reached its offer limit.',
    '0x05a4f3a8': 'The current funding window is still active.',
    '0xd0d71feb': 'Only the configured financing pool can perform this action.',
    '0x2bb661dd': 'Only the configured financing market can perform this action.',
    '0xf924664d': 'The invoice is not in the required status for this action.',
    '0xa9a54516': 'The financing request is not in the required status for this action.',
    '0x2fcb5438': 'The offer is not in the required status for this action.',
    '0x1d3b0b5b': 'Only the selected funder can complete this funding.',
    '0x3833dfbb': 'The funding window has expired.',
    '0xc7ffee87': 'The ETH amount must exactly match the required contract amount.',
    '0x2e0b8490': 'The financing terms cannot be settled from the invoice value.',
    '0x5adf6387': 'This financing request has already been funded.',
    '0x560ff900': 'This financing has already been settled.',
    '0x58d620b3': 'The configured platform fee is invalid.',
    '0xf525e320': 'The record is not in the required status for this payment.',
    '0x3ee5aeb5': 'The contract blocked a repeated call. Please try again.',
    '0x1c43b976': 'The contract could not transfer ETH to one of the recipients.',
    '0x067535a6': 'Direct ETH transfers to this contract are not allowed.',
  }
  return messages[data.slice(0, 10).toLowerCase()]
}

function extractHexData(value: unknown, depth = 0): string | undefined {
  if (depth > 5) return undefined
  if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) return value
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['data', 'error', 'originalError', 'cause', 'info', 'result']) {
      const found = extractHexData(record[key], depth + 1)
      if (found) return found
    }
  }
  return undefined
}
