import { useCallback, useEffect, useState } from 'react'
import type { JsonRpcSigner, Log, Provider } from 'ethers'
import { contractAddresses, contractsConfigured } from '../config/contracts'
import { getWritableContract } from '../services/contracts'
import type { ContractName } from '../types/domain'
import type { AuditEventRecord } from '../types/protocol'
import { errorMessage } from './useWallet'

interface AuditState {
  loading: boolean
  error?: string
  indexedThroughBlock?: number
  events: AuditEventRecord[]
}

const contractNames: ContractName[] = ['roleRegistry', 'invoiceRegistry', 'financingMarket', 'financingPool', 'disputeResolution']
const deploymentBlocks = new Map<string, Promise<number>>()
const blockTimestampCache = new Map<number, number>()

export function useAuditData(signer: JsonRpcSigner | undefined, enabled: boolean) {
  const [state, setState] = useState<AuditState>({ loading: false, events: [] })

  const load = useCallback(async () => {
    if (!signer || !enabled || !contractsConfigured) {
      setState({ loading: false, events: [] })
      return
    }
    setState((current) => ({ ...current, loading: true, error: undefined }))
    try {
      const provider = signer.provider
      const latestBlock = await provider.getBlockNumber()
      const batches = await Promise.all(contractNames.map(async (contract) => {
        const address = contractAddresses[contract]
        const instance = getWritableContract(contract, signer)
        const deploymentBlock = await getDeploymentBlock(provider, address, latestBlock)
        const logs = await queryLogs(provider, address, deploymentBlock, latestBlock)
        return logs.map((log) => {
          const parsed = instance.interface.parseLog(log)
          if (!parsed) return undefined
          const payload: Record<string, string | boolean> = {}
          parsed.fragment.inputs.forEach((input, index) => {
            const value = parsed.args[index]
            payload[input.name || `value${index}`] = typeof value === 'bigint' ? value.toString() : typeof value === 'boolean' ? value : String(value)
          })
          return {
            id: `${log.transactionHash}:${log.index}`,
            contract,
            eventName: parsed.name,
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber,
            logIndex: log.index,
            timestamp: 0,
            payload,
          } satisfies AuditEventRecord
        }).filter((item): item is AuditEventRecord => Boolean(item))
      }))
      const events = batches.flat().sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex).slice(0, 300)
      const blockNumbers = Array.from(new Set(events.map((event) => event.blockNumber)))
      const timestamps = await getBlockTimestamps(provider, blockNumbers)
      setState({
        loading: false,
        indexedThroughBlock: latestBlock,
        events: events.map((event) => ({ ...event, timestamp: timestamps.get(event.blockNumber) ?? 0 })),
      })
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: errorMessage(error) }))
    }
  }, [enabled, signer])

  useEffect(() => { void load() }, [load])
  return { ...state, refresh: load }
}

async function getDeploymentBlock(provider: Provider, address: string, latestBlock: number) {
  const key = address.toLowerCase()
  let cached = deploymentBlocks.get(key)
  if (!cached) {
    cached = findDeploymentBlock(provider, address, latestBlock)
    deploymentBlocks.set(key, cached)
  }
  return cached
}

async function findDeploymentBlock(provider: Provider, address: string, latestBlock: number) {
  let low = 0
  let high = latestBlock
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (await provider.getCode(address, middle) === '0x') low = middle + 1
    else high = middle
  }
  return low
}

async function queryLogs(provider: Provider, address: string, fromBlock: number, toBlock: number) {
  const logs: Log[] = []
  const chunkSize = 20_000
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, toBlock)
    logs.push(...await provider.getLogs({ address, fromBlock: start, toBlock: end }))
  }
  return logs
}

async function getBlockTimestamps(provider: Provider, blockNumbers: number[]) {
  const missing = blockNumbers.filter((blockNumber) => !blockTimestampCache.has(blockNumber))
  const batchSize = 20
  for (let start = 0; start < missing.length; start += batchSize) {
    const batch = missing.slice(start, start + batchSize)
    const blocks = await Promise.all(batch.map((blockNumber) => provider.getBlock(blockNumber)))
    batch.forEach((blockNumber, index) => blockTimestampCache.set(blockNumber, blocks[index]?.timestamp ?? 0))
  }
  return new Map(blockNumbers.map((blockNumber) => [blockNumber, blockTimestampCache.get(blockNumber) ?? 0]))
}
