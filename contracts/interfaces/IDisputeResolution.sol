// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDisputeResolution {
    function operationsFrozen(uint256 invoiceId) external view returns (bool);
}
