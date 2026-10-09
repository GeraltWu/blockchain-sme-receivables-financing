import { Contract, type JsonRpcSigner, type TransactionResponse } from 'ethers'
import { contractAddresses } from '../config/contracts'
import { contractAbis } from '../contracts/abis'
import type { ContractName, PreparedTransaction } from '../types/domain'

export function getWritableContract(name: ContractName, signer: JsonRpcSigner) {
  const address = contractAddresses[name]
  if (!address) {
    throw new Error(`${name} address is not configured`)
  }
  return new Contract(address, contractAbis[name], signer)
}

export async function sendContractTransaction(
  name: ContractName,
  signer: JsonRpcSigner,
  method: string,
  args: readonly unknown[],
  value?: bigint,
): Promise<PreparedTransaction> {
  const contract = getWritableContract(name, signer)
  const methodCall = contract.getFunction(method)
  const valueOverrides = value === undefined ? undefined : { value }
  const [estimatedGas, gasPriceValue, walletBalance] = await Promise.all([
    valueOverrides === undefined ? methodCall.estimateGas(...args) : methodCall.estimateGas(...args, valueOverrides),
    signer.provider.send('eth_gasPrice', []),
    signer.provider.getBalance(await signer.getAddress()),
  ])
  const gasPrice = BigInt(gasPriceValue)
  const transactionOverrides = value === undefined ? { gasPrice } : { value, gasPrice }
  return {
    summary: {
      contractAddress: contractAddresses[name],
      value: value ?? 0n,
      estimatedGas,
      estimatedNetworkFee: estimatedGas * gasPrice,
      walletBalance,
    },
    send: async () => {
      const transaction = await methodCall(...args, transactionOverrides)
      return transaction as TransactionResponse
    },
  }
}


