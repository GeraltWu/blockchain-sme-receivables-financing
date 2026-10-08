import type { InterfaceAbi } from 'ethers'
import type { ContractName } from '../types/domain'

const fallbackAbis: Record<ContractName, InterfaceAbi> = {
  roleRegistry: [
    'event RoleRequested(address indexed account, uint8 indexed role)',
    'event RoleApproved(address indexed account, uint8 indexed role, address indexed approvedBy)',
    'function requestRole(uint8 role)',
    'function approveRole(address account, uint8 role)',
    'function revokeRole(address account, uint8 role)',
    'function hasRole(address account, uint8 role) view returns (bool)',
    'function roleRequested(address account, uint8 role) view returns (bool)',
    'function admin() view returns (address)',
  ],
  invoiceRegistry: [
    'event InvoiceSubmitted(uint256 indexed invoiceId, bytes32 indexed invoiceKey, address indexed supplier, address buyer, uint256 faceValue)',
    'event InvoiceConfirmed(uint256 indexed invoiceId, address indexed buyer)',
    'event InvoiceRejected(uint256 indexed invoiceId, address indexed buyer)',
    'function submitInvoice(address buyer, bytes32 invoiceNumberHash, uint256 faceValue, uint64 issuedAt, uint64 dueAt, bytes32 documentHash) returns (uint256)',
    'function confirmInvoice(uint256 invoiceId)',
    'function rejectInvoice(uint256 invoiceId)',
    'function invoiceCount() view returns (uint256)',
    'function getInvoice(uint256 invoiceId) view returns (tuple(uint256 id,address supplier,address buyer,bytes32 invoiceNumberHash,uint256 faceValue,uint64 issuedAt,uint64 dueAt,bytes32 documentHash,uint8 status))',
  ],
  financingMarket: [
    'event FinancingOpened(uint256 indexed financingId, uint256 indexed invoiceId, address indexed supplier, uint256 principal, uint16 maxRateBps, uint16 holdbackBps, uint64 deadline)',
    'event OfferSubmitted(uint256 indexed offerId, uint256 indexed financingId, address indexed funder, uint16 rateBps)',
    'event OfferAccepted(uint256 indexed offerId, uint256 indexed financingId, address indexed funder)',
    'function openFinancing(uint256 invoiceId, uint256 principal, uint16 maxRateBps, uint16 holdbackBps, uint64 deadline) returns (uint256)',
    'function submitOffer(uint256 financingId, uint16 rateBps) returns (uint256)',
    'function withdrawOffer(uint256 offerId)',
    'function acceptOffer(uint256 financingId, uint256 offerId)',
    'function cancelFinancing(uint256 financingId)',
    'function expireFinancing(uint256 financingId)',
    'function expireAcceptedOffer(uint256 financingId)',
    'function financingCount() view returns (uint256)',
    'function offerCount() view returns (uint256)',
    'function getOfferIds(uint256 financingId) view returns (uint256[])',
    'function getFinancing(uint256 financingId) view returns (tuple(uint256 id,uint256 invoiceId,address supplier,uint256 principal,uint16 maxRateBps,uint16 holdbackBps,uint64 deadline,uint64 acceptedAt,uint256 acceptedOfferId,uint8 status))',
    'function getOffer(uint256 offerId) view returns (tuple(uint256 id,uint256 financingId,address funder,uint16 rateBps,uint8 status))',
  ],
  financingPool: [
    'event FinancingFunded(uint256 indexed financingId, uint256 indexed invoiceId, address indexed funder, uint256 principal, uint256 holdback, uint256 supplierUpfront, uint256 interest)',
    'event InvoiceRepaid(uint256 indexed financingId, uint256 indexed invoiceId, address indexed buyer, uint256 paidAmount, uint256 funderPayment, uint256 platformFee, uint256 supplierFinalPayment)',
    'function fundFinancing(uint256 financingId) payable',
    'function repayInvoice(uint256 invoiceId) payable',
    'function getFunding(uint256 financingId) view returns (tuple(uint256 financingId,uint256 invoiceId,address supplier,address buyer,address funder,uint256 principal,uint256 holdback,uint256 interest,uint256 platformFee,uint256 faceValue,uint64 fundedAt,bool settled))',
  ],
}

const compiledAbiFiles = import.meta.glob('./abi/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

function loadAbi(fileName: string, fallback: InterfaceAbi): InterfaceAbi {
  const file = compiledAbiFiles[`./abi/${fileName}.json`]
  if (Array.isArray(file)) return file as InterfaceAbi
  if (file && typeof file === 'object' && 'abi' in file) {
    const abi = (file as { abi?: unknown }).abi
    if (Array.isArray(abi)) return abi as InterfaceAbi
  }
  return fallback
}

export const contractAbis: Record<ContractName, InterfaceAbi> = {
  roleRegistry: loadAbi('RoleRegistry', fallbackAbis.roleRegistry),
  invoiceRegistry: loadAbi('InvoiceRegistry', fallbackAbis.invoiceRegistry),
  financingMarket: loadAbi('FinancingMarket', fallbackAbis.financingMarket),
  financingPool: loadAbi('FinancingPool', fallbackAbis.financingPool),
}

