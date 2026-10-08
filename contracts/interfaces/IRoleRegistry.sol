// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRoleRegistry {
    enum Role {
        Supplier,
        Buyer,
        Funder,
        Auditor,
        Arbitrator
    }

    function admin() external view returns (address);
    function hasRole(address account, Role role) external view returns (bool);
}
