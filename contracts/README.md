# Contract deployment order

Compile with Solidity `0.8.20` or a compatible `0.8.x` compiler in Remix. Enable the optimizer and record the chosen settings.

1. Deploy `RoleRegistry` from the Admin wallet.
2. Deploy `InvoiceRegistry(roleRegistry)`.
3. Deploy `FinancingMarket(roleRegistry, invoiceRegistry)`.
4. Deploy `FinancingPool(roleRegistry, invoiceRegistry, financingMarket, treasury, platformFeeBps)`.
5. Call `InvoiceRegistry.configureOperators(financingMarket, financingPool)` from Admin.
6. Call `FinancingMarket.configurePool(financingPool)` from Admin.
7. Copy the four addresses into the frontend and backend environment files.

The shortest business chain uses native Sepolia test ETH. `fundFinancing` and `repayInvoice` are payable and reject any value other than the exact principal or invoice face value.

`DisputeResolution` is intentionally deferred. The frontend includes a visible placeholder for it.
