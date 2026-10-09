# Contract deployment order

Compile with Solidity `0.8.20` or a compatible `0.8.x` compiler in Remix. Enable the optimizer and record the chosen settings.

1. Deploy `RoleRegistry` from the Admin wallet.
2. Deploy `InvoiceRegistry(roleRegistry)`.
3. Deploy `FinancingMarket(roleRegistry, invoiceRegistry)`.
4. Deploy `FinancingPool(roleRegistry, invoiceRegistry, financingMarket, treasury, platformFeeBps)`.
5. Deploy `DisputeResolution(roleRegistry, invoiceRegistry, financingMarket, financingPool)`.
6. Call `InvoiceRegistry.configureOperators(financingMarket, financingPool, disputeResolution)` from Admin.
7. Call `FinancingMarket.configurePool(financingPool)` from Admin.
8. Call `FinancingMarket.configureDisputeResolution(disputeResolution)` from Admin.
9. Call `FinancingPool.configureDisputeResolution(disputeResolution)` from Admin.
10. Copy the five addresses into the frontend and backend environment files.

The shortest business chain uses native Sepolia test ETH. `fundFinancing` and `repayInvoice` are payable and reject any value other than the exact principal or invoice face value.

The default grace period is three days. During an open dispute, financing operations are frozen, but the Buyer may deposit repayment into `FinancingPool`; a `RESUME` ruling then completes the locked settlement automatically.
