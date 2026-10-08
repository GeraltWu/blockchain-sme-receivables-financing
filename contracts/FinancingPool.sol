// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRoleRegistry} from "./interfaces/IRoleRegistry.sol";
import {IInvoiceRegistry} from "./interfaces/IInvoiceRegistry.sol";
import {IFinancingMarket} from "./interfaces/IFinancingMarket.sol";

contract FinancingPool is ReentrancyGuard {
    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 private constant DAYS_PER_YEAR = 365;

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
    }

    IRoleRegistry public immutable roleRegistry;
    IInvoiceRegistry public immutable invoiceRegistry;
    IFinancingMarket public immutable financingMarket;
    address payable public immutable treasury;
    uint16 public immutable platformFeeBps;

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

    function fundFinancing(uint256 financingId) external payable nonReentrant {
        if (_fundings[financingId].financingId != 0) revert AlreadyFunded();
        IFinancingMarket.FinancingView memory financing = financingMarket.getFinancing(financingId);
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
            settled: false
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
        if (msg.sender != funding.buyer) revert BuyerOnly();
        if (msg.value != funding.faceValue) {
            revert IncorrectEthValue(funding.faceValue, msg.value);
        }

        uint256 funderPayment = funding.principal + funding.interest;
        uint256 supplierFinalPayment =
            funding.faceValue +
            funding.holdback -
            funderPayment -
            funding.platformFee;

        funding.settled = true;
        financingMarket.markSettled(financingId);
        invoiceRegistry.markRepaid(invoiceId);

        _sendEth(payable(funding.funder), funderPayment);
        _sendEth(treasury, funding.platformFee);
        _sendEth(payable(funding.supplier), supplierFinalPayment);

        emit InvoiceRepaid(
            financingId,
            invoiceId,
            msg.sender,
            funding.faceValue,
            funderPayment,
            funding.platformFee,
            supplierFinalPayment
        );
    }

    function getFunding(uint256 financingId) external view returns (Funding memory) {
        Funding memory funding = _fundings[financingId];
        if (funding.financingId == 0) revert InvalidStatus();
        return funding;
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
