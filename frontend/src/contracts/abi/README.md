# Compiled contract ABIs

The checked-in JSON files in this directory are historical compiler outputs. The current frontend uses the focused ABI definitions in `../abis.ts`, including the fifth `DisputeResolution` contract, so stale artifacts cannot silently override the deployed interface.

After the five contracts are recompiled and deployed, replace the JSON files here for delivery evidence using these exact names:

- `RoleRegistry.json`
- `InvoiceRegistry.json`
- `FinancingMarket.json`
- `FinancingPool.json`
- `DisputeResolution.json`

Each file may contain either the ABI array itself or a compiler artifact with an `abi` property.
