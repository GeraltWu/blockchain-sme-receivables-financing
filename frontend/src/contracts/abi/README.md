# Compiled contract ABIs

Place the four compiled ABI files in this directory using these exact names:

- `RoleRegistry.json`
- `InvoiceRegistry.json`
- `FinancingMarket.json`
- `FinancingPool.json`

Each file may contain either the ABI array itself or a compiler artifact with an `abi` property. The frontend automatically prefers these files and falls back to the minimal ABIs in `../abis.ts` when a file is absent.

Restart the Vite development server after adding or renaming an ABI file.
