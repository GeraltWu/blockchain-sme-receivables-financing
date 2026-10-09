// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRoleRegistry} from "./interfaces/IRoleRegistry.sol";
import {IInvoiceRegistry} from "./interfaces/IInvoiceRegistry.sol";
import {IFinancingMarket} from "./interfaces/IFinancingMarket.sol";
import {IFinancingPool} from "./interfaces/IFinancingPool.sol";
import {IDisputeResolution} from "./interfaces/IDisputeResolution.sol";

contract DisputeResolution is IDisputeResolution {
    enum DisputeStatus {
        None,
        Open,
        Resolved
    }

    enum Ruling {
        None,
        Resume,
        Cancel,
        ConfirmDefault
    }

    struct DisputeView {
        uint256 id;
        uint256 invoiceId;
        address openedBy;
        bytes32 reasonHash;
        DisputeStatus status;
        Ruling ruling;
        uint64 openedAt;
        uint64 resolvedAt;
        address arbitrator;
    }

    struct EvidenceView {
        address submitter;
        bytes32 evidenceHash;
        uint64 submittedAt;
    }

    IRoleRegistry public immutable roleRegistry;
    IInvoiceRegistry public immutable invoiceRegistry;
    IFinancingMarket public immutable financingMarket;
    IFinancingPool public immutable financingPool;
    uint256 public disputeCount;

    mapping(uint256 disputeId => DisputeView dispute) private _disputes;
    mapping(uint256 invoiceId => uint256 disputeId) public activeDisputeIdByInvoice;
    mapping(uint256 disputeId => EvidenceView[] evidence) private _evidence;

    error InvalidAddress();
    error InvalidHash();
    error InvalidStatus();
    error UnauthorizedParticipant();
    error ArbitratorOnly();
    error ConflictOfInterest();
    error ActiveDisputeExists();
    error DisputeNotFound();
    error InvalidRuling();

    event DisputeOpened(
        uint256 indexed disputeId,
        uint256 indexed invoiceId,
        address indexed openedBy,
        bytes32 reasonHash
    );
    event EvidenceSubmitted(
        uint256 indexed disputeId,
        uint256 indexed invoiceId,
        address indexed submitter,
        bytes32 evidenceHash
    );
    event DisputeResolved(
        uint256 indexed disputeId,
        uint256 indexed invoiceId,
        address indexed arbitrator,
        Ruling ruling
    );

    constructor(
        address roleRegistryAddress,
        address invoiceRegistryAddress,
        address financingMarketAddress,
        address financingPoolAddress
    ) {
        if (
            roleRegistryAddress == address(0) ||
            invoiceRegistryAddress == address(0) ||
            financingMarketAddress == address(0) ||
            financingPoolAddress == address(0)
        ) revert InvalidAddress();
        roleRegistry = IRoleRegistry(roleRegistryAddress);
        invoiceRegistry = IInvoiceRegistry(invoiceRegistryAddress);
        financingMarket = IFinancingMarket(financingMarketAddress);
        financingPool = IFinancingPool(financingPoolAddress);
    }

    function openDispute(uint256 invoiceId, bytes32 reasonHash) external returns (uint256 disputeId) {
        if (reasonHash == bytes32(0)) revert InvalidHash();
        IInvoiceRegistry.InvoiceView memory invoice = invoiceRegistry.getInvoice(invoiceId);
        if (!_isOpenable(invoice.status)) revert InvalidStatus();
        if (!_isParticipant(invoice, msg.sender)) revert UnauthorizedParticipant();
        if (operationsFrozen(invoiceId)) revert ActiveDisputeExists();

        disputeId = ++disputeCount;
        _disputes[disputeId] = DisputeView({
            id: disputeId,
            invoiceId: invoiceId,
            openedBy: msg.sender,
            reasonHash: reasonHash,
            status: DisputeStatus.Open,
            ruling: Ruling.None,
            openedAt: uint64(block.timestamp),
            resolvedAt: 0,
            arbitrator: address(0)
        });
        activeDisputeIdByInvoice[invoiceId] = disputeId;
        emit DisputeOpened(disputeId, invoiceId, msg.sender, reasonHash);
    }

    function submitEvidenceHash(uint256 disputeId, bytes32 evidenceHash) external {
        if (evidenceHash == bytes32(0)) revert InvalidHash();
        DisputeView storage dispute = _dispute(disputeId);
        if (dispute.status != DisputeStatus.Open) revert InvalidStatus();
        IInvoiceRegistry.InvoiceView memory invoice = invoiceRegistry.getInvoice(dispute.invoiceId);
        if (!_isParticipant(invoice, msg.sender)) revert UnauthorizedParticipant();

        _evidence[disputeId].push(
            EvidenceView({
                submitter: msg.sender,
                evidenceHash: evidenceHash,
                submittedAt: uint64(block.timestamp)
            })
        );
        emit EvidenceSubmitted(disputeId, dispute.invoiceId, msg.sender, evidenceHash);
    }

    function resolveDispute(uint256 disputeId, Ruling ruling) external {
        if (!roleRegistry.hasRole(msg.sender, IRoleRegistry.Role.Arbitrator)) revert ArbitratorOnly();
        if (ruling == Ruling.None) revert InvalidRuling();
        DisputeView storage dispute = _dispute(disputeId);
        if (dispute.status != DisputeStatus.Open) revert InvalidStatus();
        IInvoiceRegistry.InvoiceView memory invoice = invoiceRegistry.getInvoice(dispute.invoiceId);
        if (_isParticipant(invoice, msg.sender)) revert ConflictOfInterest();

        if (ruling == Ruling.Cancel && invoice.status != IInvoiceRegistry.InvoiceStatus.FinancingOpen) {
            revert InvalidRuling();
        }
        if (
            ruling == Ruling.ConfirmDefault &&
            invoice.status != IInvoiceRegistry.InvoiceStatus.Funded &&
            invoice.status != IInvoiceRegistry.InvoiceStatus.Overdue
        ) revert InvalidRuling();

        dispute.status = DisputeStatus.Resolved;
        dispute.ruling = ruling;
        dispute.resolvedAt = uint64(block.timestamp);
        dispute.arbitrator = msg.sender;
        activeDisputeIdByInvoice[dispute.invoiceId] = 0;

        if (ruling == Ruling.Cancel) {
            financingMarket.cancelByDispute(dispute.invoiceId);
        } else if (ruling == Ruling.ConfirmDefault) {
            financingPool.confirmDefaultByDispute(dispute.invoiceId);
        } else if (invoice.status == IInvoiceRegistry.InvoiceStatus.RepaymentDeposited) {
            financingPool.finalizeSettlement(dispute.invoiceId);
        }

        emit DisputeResolved(disputeId, dispute.invoiceId, msg.sender, ruling);
    }

    function operationsFrozen(uint256 invoiceId) public view override returns (bool) {
        uint256 disputeId = activeDisputeIdByInvoice[invoiceId];
        return disputeId != 0 && _disputes[disputeId].status == DisputeStatus.Open;
    }

    function getDispute(uint256 disputeId) external view returns (DisputeView memory) {
        return _dispute(disputeId);
    }

    function getEvidenceCount(uint256 disputeId) external view returns (uint256) {
        _dispute(disputeId);
        return _evidence[disputeId].length;
    }

    function getEvidence(
        uint256 disputeId,
        uint256 evidenceIndex
    ) external view returns (EvidenceView memory) {
        _dispute(disputeId);
        return _evidence[disputeId][evidenceIndex];
    }

    function _dispute(uint256 disputeId) private view returns (DisputeView storage dispute) {
        dispute = _disputes[disputeId];
        if (dispute.id == 0) revert DisputeNotFound();
    }

    function _isParticipant(
        IInvoiceRegistry.InvoiceView memory invoice,
        address account
    ) private view returns (bool) {
        return
            account == invoice.supplier ||
            account == invoice.buyer ||
            financingMarket.isFunderParticipant(invoice.id, account);
    }

    function _isOpenable(IInvoiceRegistry.InvoiceStatus status) private pure returns (bool) {
        return
            status == IInvoiceRegistry.InvoiceStatus.Confirmed ||
            status == IInvoiceRegistry.InvoiceStatus.FinancingOpen ||
            status == IInvoiceRegistry.InvoiceStatus.Funded ||
            status == IInvoiceRegistry.InvoiceStatus.Overdue ||
            status == IInvoiceRegistry.InvoiceStatus.RepaymentDeposited;
    }
}
