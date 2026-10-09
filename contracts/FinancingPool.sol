// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRoleRegistry} from "./interfaces/IRoleRegistry.sol";
import {IInvoiceRegistry} from "./interfaces/IInvoiceRegistry.sol";
import {IFinancingMarket} from "./interfaces/IFinancingMarket.sol";
import {IDisputeResolution} from "./interfaces/IDisputeResolution.sol";
import {IFinancingPool} from "./interfaces/IFinancingPool.sol";

contract FinancingPool is ReentrancyGuard, IFinancingPool {
    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 private constant DAYS_PER_YEAR = 365;
    uint256 public constant GRACE_PERIOD = 3 days;

    struct Funding {
        uint256 financingId;
        uint256 invoiceId;
        address supplier;
        address buyer;
        address funder;
        uint256 principal;
        uint256 holdback;
        uint256 interest;
        uint256 platformFee;
        uint256 faceValue;
        uint64 fundedAt;
        bool settled;
        uint64 overdueAt;
        bool repaymentDeposited;
        bool defaulted;
        uint256 principalLoss;
        uint256 unpaidInterest;
    }

    IRoleRegistry public immutable roleRegistry;
    IInvoiceRegistry public immutable invoiceRegistry;
    IFinancingMarket public immutable financingMarket;
    address payable public immutable treasury;
    uint16 public immutable platformFeeBps;
    address public disputeResolution;

    mapping(uint256 financingId => Funding funding) private _fundings;
    mapping(uint256 invoiceId => uint256 financingId) public financingIdByInvoice;

    error InvalidAddress();
    error InvalidFee();
    error InvalidStatus();
    error FunderOnly();
    error BuyerOnly();
    error FundingWindowExpired();
    error IncorrectEthValue(uint256 expected, uint256 actual);
    error InsolventTerms();
    error AlreadyFunded();
    error AlreadySettled();
    error TransferFailed(address recipient, uint256 amount);
    error DirectTransferDisabled();
    error AdminOnly();
    error DisputeOnly();
    error OperationsFrozen();
    error TooEarly();
    error UnauthorizedParticipant();
    error RepaymentNotDeposited();

    event FinancingFunded(
        uint256 indexed financingId,
        uint256 indexed invoiceId,
        address indexed funder,
        uint256 principal,
        uint256 holdback,
        uint256 supplierUpfront,
        uint256 interest
    );
    event InvoiceRepaid(
        uint256 indexed financingId,
        uint256 indexed invoiceId,
        address indexed buyer,
        uint256 paidAmount,
        uint256 funderPayment,
        uint256 platformFee,
        uint256 supplierFinalPayment
    );
    event DisputeResolutionConfigured(address indexed disputeResolution);
    event InvoiceMarkedOverdue(
        uint256 indexed financingId,
        uint256 indexed invoiceId,
        uint64 overdueAt
    );
    event RepaymentDeposited(
        uint256 indexed financingId,
        uint256 indexed invoiceId,
        address indexed buyer,
        uint256 amount
    );
    event FinancingDefaulted(
        uint256 indexed financingId,
        uint256 indexed invoiceId,
        address indexed funder,
        uint256 holdbackReturned,
        uint256 principalLoss,
        uint256 unpaidInterest
    );

    constructor(
        address roleRegistryAddress,
        address invoiceRegistryAddress,
        address financingMarketAddress,
        address payable treasuryAddress,
        uint16 feeBps
    ) {
        if (
            roleRegistryAddress == address(0) ||
            invoiceRegistryAddress == address(0) ||
            financingMarketAddress == address(0) ||
            treasuryAddress == address(0)
        ) revert InvalidAddress();
        if (feeBps > 1_000) revert InvalidFee();
        roleRegistry = IRoleRegistry(roleRegistryAddress);
        invoiceRegistry = IInvoiceRegistry(invoiceRegistryAddress);
        financingMarket = IFinancingMarket(financingMarketAddress);
        treasury = treasuryAddress;
        platformFeeBps = feeBps;
    }

    modifier onlyAdmin() {
        if (msg.sender != roleRegistry.admin()) revert AdminOnly();
        _;
    }

    modifier onlyDispute() {
        if (msg.sender != disputeResolution) revert DisputeOnly();
        _;
    }

    function configureDisputeResolution(address dispute) external onlyAdmin {
        if (dispute == address(0)) revert InvalidAddress();
        disputeResolution = dispute;
        emit DisputeResolutionConfigured(dispute);
    }

    function fundFinancing(uint256 financingId) external payable nonReentrant {
        if (_fundings[financingId].financingId != 0) revert AlreadyFunded();
        IFinancingMarket.FinancingView memory financing = financingMarket.getFinancing(financingId);
        _requireNotFrozen(financing.invoiceId);
        if (financing.status != IFinancingMarket.FinancingStatus.OfferAccepted) revert InvalidStatus();
        if (block.timestamp > uint256(financing.acceptedAt) + 24 hours) revert FundingWindowExpired();

        IFinancingMarket.OfferView memory offer = financingMarket.getOffer(financing.acceptedOfferId);
        if (offer.funder != msg.sender) revert FunderOnly();
        if (msg.value != financing.principal) {
            revert IncorrectEthValue(financing.principal, msg.value);
        }

        IInvoiceRegistry.InvoiceView memory invoice = invoiceRegistry.getInvoice(financing.invoiceId);
        if (invoice.status != IInvoiceRegistry.InvoiceStatus.FinancingOpen) revert InvalidStatus();
        if (block.timestamp >= invoice.dueAt) revert FundingWindowExpired();

        uint256 holdback = (financing.principal * financing.holdbackBps) / BPS_DENOMINATOR;
        uint256 financingDays = (uint256(invoice.dueAt) - block.timestamp + 1 days - 1) / 1 days;
        uint256 interest =
            (financing.principal * offer.rateBps * financingDays) /
            BPS_DENOMINATOR /
            DAYS_PER_YEAR;
        uint256 fee = (financing.principal * platformFeeBps) / BPS_DENOMINATOR;
        if (invoice.faceValue + holdback < financing.principal + interest + fee) {
            revert InsolventTerms();
        }

        uint256 supplierUpfront = financing.principal - holdback;
        _fundings[financingId] = Funding({
            financingId: financingId,
            invoiceId: financing.invoiceId,
            supplier: financing.supplier,
            buyer: invoice.buyer,
            funder: offer.funder,
            principal: financing.principal,
            holdback: holdback,
            interest: interest,
            platformFee: fee,
            faceValue: invoice.faceValue,
            fundedAt: uint64(block.timestamp),
            settled: false,
            overdueAt: 0,
            repaymentDeposited: false,
            defaulted: false,
            principalLoss: 0,
            unpaidInterest: 0
        });
        financingIdByInvoice[financing.invoiceId] = financingId;

        financingMarket.markFunded(financingId);
        invoiceRegistry.markFunded(financing.invoiceId);
        _sendEth(payable(financing.supplier), supplierUpfront);

        emit FinancingFunded(
            financingId,
            financing.invoiceId,
            offer.funder,
            financing.principal,
            holdback,
            supplierUpfront,
            interest
        );
    }

    function repayInvoice(uint256 invoiceId) external payable nonReentrant {
        uint256 financingId = financingIdByInvoice[invoiceId];
        Funding storage funding = _fundings[financingId];
        if (funding.financingId == 0) revert InvalidStatus();
        if (funding.settled) revert AlreadySettled();
        if (funding.defaulted || funding.repaymentDeposited) revert InvalidStatus();
        if (msg.sender != funding.buyer) revert BuyerOnly();
        if (msg.value != funding.faceValue) {
            revert IncorrectEthValue(funding.faceValue, msg.value);
        }

        if (_isFrozen(invoiceId)) {
            funding.repaymentDeposited = true;
            invoiceRegistry.markRepaymentDeposited(invoiceId);
            emit RepaymentDeposited(financingId, invoiceId, msg.sender, msg.value);
            return;
        }

        _settle(funding, msg.sender);
    }

    function finalizeSettlement(uint256 invoiceId) external override nonReentrant {
        uint256 financingId = financingIdByInvoice[invoiceId];
        Funding storage funding = _fundings[financingId];
        if (!funding.repaymentDeposited) revert RepaymentNotDeposited();
        if (_isFrozen(invoiceId)) revert OperationsFrozen();
        _settle(funding, funding.buyer);
    }

    function markOverdue(uint256 invoiceId) external {
        uint256 financingId = financingIdByInvoice[invoiceId];
        Funding storage funding = _fundings[financingId];
        _requireParticipant(funding);
        _requireNotFrozen(invoiceId);
        if (funding.financingId == 0 || funding.settled || funding.defaulted) revert InvalidStatus();
        if (block.timestamp <= invoiceRegistry.getInvoice(invoiceId).dueAt) revert TooEarly();
        if (funding.overdueAt != 0) revert InvalidStatus();

        funding.overdueAt = uint64(block.timestamp);
        financingMarket.markOverdue(financingId);
        invoiceRegistry.markOverdue(invoiceId);
        emit InvoiceMarkedOverdue(financingId, invoiceId, funding.overdueAt);
    }

    function declareDefault(uint256 invoiceId) external nonReentrant {
        uint256 financingId = financingIdByInvoice[invoiceId];
        Funding storage funding = _fundings[financingId];
        _requireParticipant(funding);
        _requireNotFrozen(invoiceId);
        if (funding.financingId == 0 || funding.settled || funding.defaulted) revert InvalidStatus();
        if (funding.repaymentDeposited) revert InvalidStatus();
        if (block.timestamp <= uint256(invoiceRegistry.getInvoice(invoiceId).dueAt) + GRACE_PERIOD) {
            revert TooEarly();
        }
        _defaultFunding(funding);
    }

    function confirmDefaultByDispute(uint256 invoiceId) external override onlyDispute nonReentrant {
        uint256 financingId = financingIdByInvoice[invoiceId];
        Funding storage funding = _fundings[financingId];
        if (
            funding.financingId == 0 ||
            funding.settled ||
            funding.defaulted ||
            funding.repaymentDeposited
        ) revert InvalidStatus();
        _defaultFunding(funding);
    }

    function getFunding(uint256 financingId) external view returns (Funding memory) {
        Funding memory funding = _fundings[financingId];
        if (funding.financingId == 0) revert InvalidStatus();
        return funding;
    }

    function _settle(Funding storage funding, address buyer) private {
        uint256 funderPayment = funding.principal + funding.interest;
        uint256 supplierFinalPayment =
            funding.faceValue +
            funding.holdback -
            funderPayment -
            funding.platformFee;

        funding.settled = true;
        funding.repaymentDeposited = false;
        financingMarket.markSettled(funding.financingId);
        invoiceRegistry.markRepaid(funding.invoiceId);

        _sendEth(payable(funding.funder), funderPayment);
        _sendEth(treasury, funding.platformFee);
        _sendEth(payable(funding.supplier), supplierFinalPayment);

        emit InvoiceRepaid(
            funding.financingId,
            funding.invoiceId,
            buyer,
            funding.faceValue,
            funderPayment,
            funding.platformFee,
            supplierFinalPayment
        );
    }

    function _defaultFunding(Funding storage funding) private {
        funding.defaulted = true;
        funding.principalLoss = funding.principal - funding.holdback;
        funding.unpaidInterest = funding.interest;
        financingMarket.markDefaulted(funding.financingId);
        invoiceRegistry.markDefaulted(funding.invoiceId);

        uint256 holdbackReturned = funding.holdback;
        _sendEth(payable(funding.funder), holdbackReturned);
        emit FinancingDefaulted(
            funding.financingId,
            funding.invoiceId,
            funding.funder,
            holdbackReturned,
            funding.principalLoss,
            funding.unpaidInterest
        );
    }

    function _requireParticipant(Funding storage funding) private view {
        if (
            msg.sender != funding.supplier &&
            msg.sender != funding.buyer &&
            msg.sender != funding.funder
        ) revert UnauthorizedParticipant();
    }

    function _isFrozen(uint256 invoiceId) private view returns (bool) {
        return
            disputeResolution != address(0) &&
            IDisputeResolution(disputeResolution).operationsFrozen(invoiceId);
    }

    function _requireNotFrozen(uint256 invoiceId) private view {
        if (_isFrozen(invoiceId)) revert OperationsFrozen();
    }

    function _sendEth(address payable recipient, uint256 amount) private {
        if (amount == 0) return;
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed(recipient, amount);
    }

    receive() external payable {
        revert DirectTransferDisabled();
    }
}
