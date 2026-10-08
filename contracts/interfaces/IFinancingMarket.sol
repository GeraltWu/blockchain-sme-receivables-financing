// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFinancingMarket {
    enum FinancingStatus {
        None,
        Open,
        OfferAccepted,
        Funded,
        Settled,
        Cancelled,
        Expired
    }

    enum OfferStatus {
        None,
        Active,
        Accepted,
        Expired
    }

    struct FinancingView {
        uint256 id;
        uint256 invoiceId;
        address supplier;
        uint256 principal;
        uint16 maxRateBps;
        uint16 holdbackBps;
        uint64 deadline;
        uint64 acceptedAt;
        uint256 acceptedOfferId;
        FinancingStatus status;
    }

    struct OfferView {
        uint256 id;
        uint256 financingId;
        address funder;
        uint16 rateBps;
        OfferStatus status;
    }

    function getFinancing(uint256 financingId) external view returns (FinancingView memory);
    function getOffer(uint256 offerId) external view returns (OfferView memory);
    function markFunded(uint256 financingId) external;
    function markSettled(uint256 financingId) external;
}
