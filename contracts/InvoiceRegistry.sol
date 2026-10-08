// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRoleRegistry} from "./interfaces/IRoleRegistry.sol";
import {IInvoiceRegistry} from "./interfaces/IInvoiceRegistry.sol";

contract InvoiceRegistry is IInvoiceRegistry {
    IRoleRegistry public immutable roleRegistry;
    address public financingMarket;
    address public financingPool;
    uint256 public invoiceCount;

    mapping(uint256 invoiceId => InvoiceView invoice) private _invoices;
    mapping(bytes32 invoiceKey => uint256 invoiceId) public invoiceIdByKey;

    error AdminOnly();
    error MarketOnly();
    error PoolOnly();
    error MissingRole();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidDate();
    error InvalidHash();
    error DuplicateInvoice();
    error InvoiceNotFound();
    error BuyerOnly();
    error InvalidStatus(InvoiceStatus expected, InvoiceStatus actual);

    event OperatorsConfigured(address indexed financingMarket, address indexed financingPool);
    event InvoiceSubmitted(
        uint256 indexed invoiceId,
        bytes32 indexed invoiceKey,
        address indexed supplier,
        address buyer,
        uint256 faceValue
    );
    event InvoiceConfirmed(uint256 indexed invoiceId, address indexed buyer);
    event InvoiceRejected(uint256 indexed invoiceId, address indexed buyer);
    event InvoiceStatusChanged(uint256 indexed invoiceId, InvoiceStatus status);

    constructor(address roleRegistryAddress) {
        if (roleRegistryAddress == address(0)) revert InvalidAddress();
        roleRegistry = IRoleRegistry(roleRegistryAddress);
    }

    modifier onlyAdmin() {
        if (msg.sender != roleRegistry.admin()) revert AdminOnly();
        _;
    }

    modifier onlyMarket() {
        if (msg.sender != financingMarket) revert MarketOnly();
        _;
    }

    modifier onlyPool() {
        if (msg.sender != financingPool) revert PoolOnly();
        _;
    }

    function configureOperators(address market, address pool) external onlyAdmin {
        if (market == address(0) || pool == address(0)) revert InvalidAddress();
        financingMarket = market;
        financingPool = pool;
        emit OperatorsConfigured(market, pool);
    }

    function submitInvoice(
        address buyer,
        bytes32 invoiceNumberHash,
        uint256 faceValue,
        uint64 issuedAt,
        uint64 dueAt,
        bytes32 documentHash
    ) external returns (uint256 invoiceId) {
        if (!roleRegistry.hasRole(msg.sender, IRoleRegistry.Role.Supplier)) revert MissingRole();
        if (!roleRegistry.hasRole(buyer, IRoleRegistry.Role.Buyer)) revert MissingRole();
        if (buyer == address(0) || buyer == msg.sender) revert InvalidAddress();
        if (faceValue == 0) revert InvalidAmount();
        if (issuedAt == 0 || dueAt <= issuedAt || dueAt <= block.timestamp) revert InvalidDate();
        if (invoiceNumberHash == bytes32(0) || documentHash == bytes32(0)) revert InvalidHash();

        bytes32 invoiceKey = keccak256(
            abi.encode(block.chainid, msg.sender, buyer, invoiceNumberHash, issuedAt)
        );
        if (invoiceIdByKey[invoiceKey] != 0) revert DuplicateInvoice();

        invoiceId = ++invoiceCount;
        _invoices[invoiceId] = InvoiceView({
            id: invoiceId,
            supplier: msg.sender,
            buyer: buyer,
            invoiceNumberHash: invoiceNumberHash,
            faceValue: faceValue,
            issuedAt: issuedAt,
            dueAt: dueAt,
            documentHash: documentHash,
            status: InvoiceStatus.PendingConfirmation
        });
        invoiceIdByKey[invoiceKey] = invoiceId;
        emit InvoiceSubmitted(invoiceId, invoiceKey, msg.sender, buyer, faceValue);
    }

    function confirmInvoice(uint256 invoiceId) external {
        InvoiceView storage invoice = _invoice(invoiceId);
        if (msg.sender != invoice.buyer) revert BuyerOnly();
        _requireStatus(invoice, InvoiceStatus.PendingConfirmation);
        invoice.status = InvoiceStatus.Confirmed;
        emit InvoiceConfirmed(invoiceId, msg.sender);
    }

    function rejectInvoice(uint256 invoiceId) external {
        InvoiceView storage invoice = _invoice(invoiceId);
        if (msg.sender != invoice.buyer) revert BuyerOnly();
        _requireStatus(invoice, InvoiceStatus.PendingConfirmation);
        invoice.status = InvoiceStatus.Rejected;
        emit InvoiceRejected(invoiceId, msg.sender);
    }

    function markFinancingOpen(uint256 invoiceId) external override onlyMarket {
        InvoiceView storage invoice = _invoice(invoiceId);
        _requireStatus(invoice, InvoiceStatus.Confirmed);
        _setStatus(invoice, InvoiceStatus.FinancingOpen);
    }

    function restoreConfirmed(uint256 invoiceId) external override onlyMarket {
        InvoiceView storage invoice = _invoice(invoiceId);
        _requireStatus(invoice, InvoiceStatus.FinancingOpen);
        _setStatus(invoice, InvoiceStatus.Confirmed);
    }

    function markFunded(uint256 invoiceId) external override onlyPool {
        InvoiceView storage invoice = _invoice(invoiceId);
        _requireStatus(invoice, InvoiceStatus.FinancingOpen);
        _setStatus(invoice, InvoiceStatus.Funded);
    }

    function markRepaid(uint256 invoiceId) external override onlyPool {
        InvoiceView storage invoice = _invoice(invoiceId);
        _requireStatus(invoice, InvoiceStatus.Funded);
        _setStatus(invoice, InvoiceStatus.Repaid);
    }

    function getInvoice(uint256 invoiceId) external view override returns (InvoiceView memory) {
        InvoiceView memory invoice = _invoices[invoiceId];
        if (invoice.id == 0) revert InvoiceNotFound();
        return invoice;
    }

    function _invoice(uint256 invoiceId) private view returns (InvoiceView storage invoice) {
        invoice = _invoices[invoiceId];
        if (invoice.id == 0) revert InvoiceNotFound();
    }

    function _requireStatus(InvoiceView storage invoice, InvoiceStatus expected) private view {
        if (invoice.status != expected) revert InvalidStatus(expected, invoice.status);
    }

    function _setStatus(InvoiceView storage invoice, InvoiceStatus status) private {
        invoice.status = status;
        emit InvoiceStatusChanged(invoice.id, status);
    }
}
