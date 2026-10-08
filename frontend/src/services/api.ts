const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'
const TOKEN_KEY = 'sme-finance-session'

interface ApiErrorPayload {
  error?: { code?: string; message?: string; details?: Record<string, unknown> }
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly code?: string
  readonly details?: Record<string, unknown>

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export interface InvoiceMetadata {
  id: string
  supplier: string
  buyer: string
  invoiceNumber: string
  faceValue: string
  issuedAt: string
  dueAt: string
  documentHash: string
  createdAt: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload
    throw new ApiRequestError(
      payload.error?.message ?? `Request failed (${response.status})`,
      response.status,
      payload.error?.code,
      payload.error?.details,
    )
  }
  return response.json() as Promise<T>
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function requestNonce(address: string) {
  return request<{ nonce: string; message: string }>('/auth/nonce', {
    method: 'POST',
    body: JSON.stringify({ address, chainId: 11155111 }),
  })
}

export async function verifySignature(address: string, message: string, signature: string) {
  const result = await request<{ sessionToken: string }>('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ address, message, signature }),
  })
  localStorage.setItem(TOKEN_KEY, result.sessionToken)
  return result
}

export async function saveInvoiceMetadata(payload: {
  invoiceNumber: string
  buyer: string
  faceValue: string
  issuedAt: string
  dueAt: string
  documentHash: string
}) {
  return request('/invoices/metadata', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function listInvoiceMetadata() {
  return request<{ data: InvoiceMetadata[] }>('/invoices/metadata')
}

export async function verifyTransaction(hash: string, contract: string, action: string) {
  return request('/transactions/verify', {
    method: 'POST',
    body: JSON.stringify({ txHash: hash, contractName: contract, action }),
  })
}

