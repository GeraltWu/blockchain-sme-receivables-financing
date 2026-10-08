// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRoleRegistry} from "./interfaces/IRoleRegistry.sol";

contract RoleRegistry is IRoleRegistry {
    address public immutable override admin;

    mapping(address account => mapping(Role role => bool enabled)) private _roles;
    mapping(address account => mapping(Role role => bool requested)) public roleRequested;

    error AdminOnly();
    error InvalidAccount();
    error RequestAlreadyExists();
    error RoleAlreadyGranted();
    error RoleNotGranted();

    event RoleRequested(address indexed account, Role indexed role);
    event RoleApproved(address indexed account, Role indexed role, address indexed approvedBy);
    event RoleRevoked(address indexed account, Role indexed role, address indexed revokedBy);

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert AdminOnly();
        _;
    }

    function requestRole(Role role) external {
        if (_roles[msg.sender][role]) revert RoleAlreadyGranted();
        if (roleRequested[msg.sender][role]) revert RequestAlreadyExists();
        roleRequested[msg.sender][role] = true;
        emit RoleRequested(msg.sender, role);
    }

    function approveRole(address account, Role role) external onlyAdmin {
        if (account == address(0)) revert InvalidAccount();
        if (_roles[account][role]) revert RoleAlreadyGranted();
        _roles[account][role] = true;
        roleRequested[account][role] = false;
        emit RoleApproved(account, role, msg.sender);
    }

    function revokeRole(address account, Role role) external onlyAdmin {
        if (!_roles[account][role]) revert RoleNotGranted();
        _roles[account][role] = false;
        emit RoleRevoked(account, role, msg.sender);
    }

    function hasRole(address account, Role role) external view override returns (bool) {
        return _roles[account][role];
    }
}
