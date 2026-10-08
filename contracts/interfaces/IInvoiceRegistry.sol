// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IInvoiceRegistry {
    enum InvoiceStatus {
        None,
        PendingConfirmation,
        Rejected,
        Confirmed,
        FinancingOpen,
        Funded,
        Repaid
    }

    struct InvoiceView {
        uint256 id;
        address supplier;
        address buyer;
        bytes32 invoiceNumberHash;
        uint256 faceValue;
        uint64 issuedAt;
        uint64 dueAt;
        bytes32 documentHash;
        InvoiceStatus status;
    }

    function getInvoice(uint256 invoiceId) external view returns (InvoiceView memory);
    function markFinancingOpen(uint256 invoiceId) external;
    function restoreConfirmed(uint256 invoiceId) external;
    function markFunded(uint256 invoiceId) external;
    function markRepaid(uint256 invoiceId) external;
}
