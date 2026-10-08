import { Contract, type JsonRpcSigner, type TransactionResponse } from 'ethers'
import { contractAddresses } from '../config/contracts'
import { contractAbis } from '../contracts/abis'
import type { ContractName } from '../types/domain'

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
): Promise<TransactionResponse> {
  const contract = getWritableContract(name, signer)
  const transaction = value === undefined
    ? await contract.getFunction(method)(...args)
    : await contract.getFunction(method)(...args, { value })
  return transaction as TransactionResponse
}


