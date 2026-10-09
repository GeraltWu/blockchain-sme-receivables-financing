// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFinancingPool {
    function finalizeSettlement(uint256 invoiceId) external;
    function confirmDefaultByDispute(uint256 invoiceId) external;
}
