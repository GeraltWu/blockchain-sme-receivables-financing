// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRoleRegistry} from "./interfaces/IRoleRegistry.sol";
import {IInvoiceRegistry} from "./interfaces/IInvoiceRegistry.sol";
import {IFinancingMarket} from "./interfaces/IFinancingMarket.sol";

contract FinancingMarket is IFinancingMarket {
    uint256 public constant MAX_OFFERS_PER_REQUEST = 20;
    uint256 public constant FUNDING_WINDOW = 24 hours;

    IRoleRegistry public immutable roleRegistry;
    IInvoiceRegistry public immutable invoiceRegistry;
    address public financingPool;
    uint256 public financingCount;
    uint256 public offerCount;

    mapping(uint256 financingId => FinancingView financing) private _financings;
    mapping(uint256 offerId => OfferView offer) private _offers;
    mapping(uint256 financingId => uint256[] offerIds) private _offerIds;

    error AdminOnly();
    error PoolOnly();
    error MissingRole();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidRate();
    error InvalidHoldback();
    error InvalidDeadline();
    error FinancingNotFound();
    error OfferNotFound();
    error SupplierOnly();
    error FunderConflict();
    error TooManyOffers();
    error InvalidFinancingStatus(FinancingStatus expected, FinancingStatus actual);
    error InvalidOfferStatus(OfferStatus expected, OfferStatus actual);
    error FundingWindowActive();

    event FinancingPoolConfigured(address indexed financingPool);
    event FinancingOpened(
        uint256 indexed financingId,
        uint256 indexed invoiceId,
        address indexed supplier,
        uint256 principal,
        uint16 maxRateBps,
        uint16 holdbackBps,
        uint64 deadline
    );
    event FinancingCancelled(uint256 indexed financingId);
    event FinancingExpired(uint256 indexed financingId);
    event OfferSubmitted(
        uint256 indexed offerId,
        uint256 indexed financingId,
        address indexed funder,
        uint16 rateBps
    );
    event OfferWithdrawn(uint256 indexed offerId, uint256 indexed financingId);
    event OfferAccepted(uint256 indexed offerId, uint256 indexed financingId, address indexed funder);
    event AcceptedOfferExpired(uint256 indexed offerId, uint256 indexed financingId);
    event FinancingFunded(uint256 indexed financingId, uint256 indexed invoiceId);
    event FinancingSettled(uint256 indexed financingId, uint256 indexed invoiceId);

    constructor(address roleRegistryAddress, address invoiceRegistryAddress) {
        if (roleRegistryAddress == address(0) || invoiceRegistryAddress == address(0)) {
            revert InvalidAddress();
        }
        roleRegistry = IRoleRegistry(roleRegistryAddress);
        invoiceRegistry = IInvoiceRegistry(invoiceRegistryAddress);
    }

    modifier onlyAdmin() {
        if (msg.sender != roleRegistry.admin()) revert AdminOnly();
        _;
    }

    modifier onlyPool() {
        if (msg.sender != financingPool) revert PoolOnly();
        _;
    }

    function configurePool(address pool) external onlyAdmin {
        if (pool == address(0)) revert InvalidAddress();
        financingPool = pool;
        emit FinancingPoolConfigured(pool);
    }

    function openFinancing(
        uint256 invoiceId,
        uint256 principal,
        uint16 maxRateBps,
        uint16 holdbackBps,
        uint64 deadline
    ) external returns (uint256 financingId) {
        if (!roleRegistry.hasRole(msg.sender, IRoleRegistry.Role.Supplier)) revert MissingRole();
        IInvoiceRegistry.InvoiceView memory invoice = invoiceRegistry.getInvoice(invoiceId);
        if (invoice.supplier != msg.sender) revert SupplierOnly();
        if (invoice.status != IInvoiceRegistry.InvoiceStatus.Confirmed) {
            revert InvalidFinancingStatus(FinancingStatus.Open, FinancingStatus.None);
        }
        if (principal == 0 || principal > invoice.faceValue) revert InvalidAmount();
        if (maxRateBps == 0 || maxRateBps > 10_000) revert InvalidRate();
        if (holdbackBps > 5_000) revert InvalidHoldback();
        if (deadline <= block.timestamp || deadline >= invoice.dueAt) revert InvalidDeadline();

        financingId = ++financingCount;
        _financings[financingId] = FinancingView({
            id: financingId,
            invoiceId: invoiceId,
            supplier: msg.sender,
            principal: principal,
            maxRateBps: maxRateBps,
            holdbackBps: holdbackBps,
            deadline: deadline,
            acceptedAt: 0,
            acceptedOfferId: 0,
            status: FinancingStatus.Open
        });
        invoiceRegistry.markFinancingOpen(invoiceId);
        emit FinancingOpened(
            financingId,
            invoiceId,
            msg.sender,
            principal,
            maxRateBps,
            holdbackBps,
            deadline
        );
    }

    function cancelFinancing(uint256 financingId) external {
        FinancingView storage financing = _financing(financingId);
        if (financing.supplier != msg.sender) revert SupplierOnly();
        _requireFinancingStatus(financing, FinancingStatus.Open);
        financing.status = FinancingStatus.Cancelled;
        _expireActiveOffers(financingId);
        invoiceRegistry.restoreConfirmed(financing.invoiceId);
        emit FinancingCancelled(financingId);
    }

    function expireFinancing(uint256 financingId) external {
        FinancingView storage financing = _financing(financingId);
        _requireFinancingStatus(financing, FinancingStatus.Open);
        if (block.timestamp <= financing.deadline) revert InvalidDeadline();
        financing.status = FinancingStatus.Expired;
        _expireActiveOffers(financingId);
        invoiceRegistry.restoreConfirmed(financing.invoiceId);
        emit FinancingExpired(financingId);
    }

    function submitOffer(uint256 financingId, uint16 rateBps) external returns (uint256 offerId) {
        if (!roleRegistry.hasRole(msg.sender, IRoleRegistry.Role.Funder)) revert MissingRole();
        FinancingView storage financing = _financing(financingId);
        _requireFinancingStatus(financing, FinancingStatus.Open);
        if (block.timestamp >= financing.deadline) revert InvalidDeadline();
        if (msg.sender == financing.supplier) revert FunderConflict();
        if (rateBps == 0 || rateBps > financing.maxRateBps) revert InvalidRate();
        if (_offerIds[financingId].length >= MAX_OFFERS_PER_REQUEST) revert TooManyOffers();

        offerId = ++offerCount;
        _offers[offerId] = OfferView({
            id: offerId,
            financingId: financingId,
            funder: msg.sender,
            rateBps: rateBps,
            status: OfferStatus.Active
        });
        _offerIds[financingId].push(offerId);
        emit OfferSubmitted(offerId, financingId, msg.sender, rateBps);
    }

    function withdrawOffer(uint256 offerId) external {
        OfferView storage offer = _offer(offerId);
        if (offer.funder != msg.sender) revert FunderConflict();
        _requireOfferStatus(offer, OfferStatus.Active);
        offer.status = OfferStatus.Expired;
        emit OfferWithdrawn(offerId, offer.financingId);
    }

    function acceptOffer(uint256 financingId, uint256 offerId) external {
        FinancingView storage financing = _financing(financingId);
        if (financing.supplier != msg.sender) revert SupplierOnly();
        _requireFinancingStatus(financing, FinancingStatus.Open);
        if (block.timestamp >= financing.deadline) revert InvalidDeadline();

        OfferView storage offer = _offer(offerId);
        if (offer.financingId != financingId) revert OfferNotFound();
        _requireOfferStatus(offer, OfferStatus.Active);

        offer.status = OfferStatus.Accepted;
        financing.acceptedOfferId = offerId;
        financing.acceptedAt = uint64(block.timestamp);
        financing.status = FinancingStatus.OfferAccepted;
        emit OfferAccepted(offerId, financingId, offer.funder);
    }

    function expireAcceptedOffer(uint256 financingId) external {
        FinancingView storage financing = _financing(financingId);
        _requireFinancingStatus(financing, FinancingStatus.OfferAccepted);
        if (block.timestamp <= uint256(financing.acceptedAt) + FUNDING_WINDOW) {
            revert FundingWindowActive();
        }

        OfferView storage acceptedOffer = _offers[financing.acceptedOfferId];
        acceptedOffer.status = OfferStatus.Expired;
        emit AcceptedOfferExpired(acceptedOffer.id, financingId);
        financing.acceptedOfferId = 0;
        financing.acceptedAt = 0;

        if (block.timestamp < financing.deadline) {
            financing.status = FinancingStatus.Open;
        } else {
            financing.status = FinancingStatus.Expired;
            _expireActiveOffers(financingId);
            invoiceRegistry.restoreConfirmed(financing.invoiceId);
            emit FinancingExpired(financingId);
        }
    }

    function markFunded(uint256 financingId) external override onlyPool {
        FinancingView storage financing = _financing(financingId);
        _requireFinancingStatus(financing, FinancingStatus.OfferAccepted);
        financing.status = FinancingStatus.Funded;
        _expireActiveOffers(financingId);
        emit FinancingFunded(financingId, financing.invoiceId);
    }

    function markSettled(uint256 financingId) external override onlyPool {
        FinancingView storage financing = _financing(financingId);
        _requireFinancingStatus(financing, FinancingStatus.Funded);
        financing.status = FinancingStatus.Settled;
        emit FinancingSettled(financingId, financing.invoiceId);
    }

    function getFinancing(uint256 financingId) external view override returns (FinancingView memory) {
        FinancingView memory financing = _financings[financingId];
        if (financing.id == 0) revert FinancingNotFound();
        return financing;
    }

    function getOffer(uint256 offerId) external view override returns (OfferView memory) {
        OfferView memory offer = _offers[offerId];
        if (offer.id == 0) revert OfferNotFound();
        return offer;
    }

    function getOfferIds(uint256 financingId) external view returns (uint256[] memory) {
        if (_financings[financingId].id == 0) revert FinancingNotFound();
        return _offerIds[financingId];
    }

    function _financing(uint256 financingId) private view returns (FinancingView storage financing) {
        financing = _financings[financingId];
        if (financing.id == 0) revert FinancingNotFound();
    }

    function _offer(uint256 offerId) private view returns (OfferView storage offer) {
        offer = _offers[offerId];
        if (offer.id == 0) revert OfferNotFound();
    }

    function _requireFinancingStatus(
        FinancingView storage financing,
        FinancingStatus expected
    ) private view {
        if (financing.status != expected) {
            revert InvalidFinancingStatus(expected, financing.status);
        }
    }

    function _requireOfferStatus(OfferView storage offer, OfferStatus expected) private view {
        if (offer.status != expected) revert InvalidOfferStatus(expected, offer.status);
    }

    function _expireActiveOffers(uint256 financingId) private {
        uint256[] storage ids = _offerIds[financingId];
        for (uint256 i = 0; i < ids.length; i++) {
            OfferView storage offer = _offers[ids[i]];
            if (offer.status == OfferStatus.Active) offer.status = OfferStatus.Expired;
        }
    }
}
