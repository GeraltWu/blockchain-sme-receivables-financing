# SME Flow Receivables Financing Platform User Manual

## 1. About This Manual

SME Flow is a receivables financing platform running on the Ethereum Sepolia test network. Suppliers can register buyer-confirmed receivables and request early financing. Funders can submit financing offers and provide funds. Buyers confirm invoices and repay their face value. Arbitrators resolve disputes, while Auditors can inspect on-chain status, cash flows, and event records.

This manual is intended for actual platform users. It explains how to connect a wallet, obtain role permissions, and complete the business activities available to each role. Button labels and status names are shown exactly as they appear in the English-language interface.

The platform currently uses Sepolia test ETH. Test ETH has no real monetary value. Do not send mainnet ETH or any other real asset to the platform contracts.

### 1.1 Business Process Overview

A typical receivables financing transaction follows these steps:

1. Participants connect their wallets and obtain the required role permissions.
2. The Supplier creates an invoice and identifies the Buyer responsible for confirmation and payment.
3. The Buyer reviews the invoice and either confirms or rejects it.
4. After confirmation, the Supplier specifies the funding principal, maximum interest rate, holdback, and offer deadline.
5. Funders submit rate offers, and the Supplier accepts one valid offer.
6. The selected Funder pays the principal. The Supplier immediately receives the principal minus the holdback.
7. The Buyer pays the full invoice face value. The contracts automatically allocate the payment among the Funder, Supplier, and Treasury.
8. The Auditor can verify the final status, cash flows, and on-chain events through read-only views.

Exceptional situations may follow different paths:

- If the invoice remains unpaid after its due date, it can be marked `Overdue`. After the three-day grace period, it can be declared `Defaulted`.
- The Supplier, Buyer, or a Funder involved in the financing can open a dispute. Financing operations are frozen while the dispute is open, but the Buyer can still repay. The payment is held in the contract until the Arbitrator issues a ruling.

The available actions at each step depend on the connected wallet, selected role, business status, and applicable time conditions. Users do not manually edit a status. The smart contracts update the relevant records after a transaction is confirmed.

## 2. Before You Begin

Before using the platform, make sure that:

1. MetaMask is installed in your browser.
2. Ethereum Sepolia has been added to MetaMask and is selected. Its Chain ID is `11155111`.
3. The wallet has enough Sepolia ETH. Every state-changing blockchain transaction requires Gas. A Funder also needs enough ETH to provide the principal, and a Buyer needs enough ETH to pay the invoice face value.
4. You access the platform through its official address and do not connect your wallet through an untrusted link.
5. You never enter a seed phrase, private key, or MetaMask password into the website. The platform only requests wallet connection, a login-message signature, or approval of a blockchain transaction.

Sepolia ETH can be obtained from a trusted Sepolia faucet. Before requesting funds, check the selected network and receiving wallet address. Begin business operations only after the test ETH appears in the wallet.

### 2.1 Recommended First-use Sequence

1. Open the platform and connect MetaMask.
2. Switch to Sepolia, then check the wallet address shown at the top of the page and the balance shown in `Profile`.
3. Complete `Sign in` once so that the platform can load business invoice numbers and verified transaction records.
4. Open `Profile → Manage` and check the role status. Request any required role that is not yet active.
5. After the role is approved, select it at the top of the page. Open `Home` to review pending tasks or begin an operation from `Activity`.

If you switch accounts in MetaMask, repeat the checks from Step 2 for the new wallet, including its network, login status, roles, and balance.

## 3. Wallet Connection, Sign-in, and Roles

### 3.1 Connecting a Wallet

When visiting the platform for the first time, click `Connect` or `Connect MetaMask`, then select and authorize a wallet account in MetaMask.

If MetaMask is already connected to Sepolia, the platform may immediately request a login-message signature. This signature is not a blockchain transaction and does not consume Gas. If you cancel it, you can sign in later from the sidebar or `Profile`.

After the wallet is connected, the platform can:

- Read the wallet's roles, invoices, financing records, and disputes from Sepolia;
- Ask the wallet to sign transactions;
- Display the wallet's Sepolia ETH balance.

If the selected network is not Sepolia, the page displays `Switch network` or `Switch to Sepolia`. Click it and approve the network change in MetaMask.

### 3.2 What Sign-in Does

`Sign in` verifies identity with a wallet signature. It does not submit a blockchain transaction and does not consume Gas. After sign-in, the platform can load controlled business metadata and verified transaction records associated with the wallet, including business invoice numbers.

Without signing in, users can still read public on-chain data and perform most blockchain operations. However, a page may show only an on-chain `Invoice #`, amount, or wallet address instead of the business invoice number. A Supplier should sign in before creating an invoice; otherwise, the business invoice number cannot be saved in backend metadata.

Switching the MetaMask account clears the previous wallet's login session. Use `Sign in` again for the new wallet when required.

### 3.3 Role Status

One wallet can hold multiple roles. The role selector at the top of the page changes the current workspace; it does not grant a role automatically.

- Green dot: the role is active and can initiate new operations for that role.
- Red dot: the role is not active.
- `Pending`: the role request has been submitted and is waiting for Admin approval.
- `Active`: the role has been approved by the Admin.
- `Not active`: the role has not been activated or has been revoked.

After a role is revoked, the wallet cannot initiate new operations that require that role. Existing participant relationships recorded in invoices or financing records remain valid. Their records remain visible, and the wallet may complete follow-up actions where the system permits it.

## 4. Roles and Responsibilities

| Role | Main responsibilities |
|---|---|
| Supplier | Create invoices, request financing, compare and accept offers, and review payments received |
| Buyer | Confirm or reject invoices, repay financed invoices, and participate in disputes |
| Funder | Browse financing opportunities, submit or withdraw offers, and fund an accepted offer |
| Arbitrator | Review disputes and evidence hashes and select a predefined ruling |
| Auditor | Read protocol summaries, cash flows, and on-chain events |
| Admin | Approve or revoke participant roles |

`Admin` is the wallet that deployed the `RoleRegistry` contract. It is not obtained through the normal role-request process.

## 5. Page Navigation

The platform has four main navigation destinations:

- `Home`: Displays the current role, pending tasks, related invoices, and recent transactions.
- `Activity`: Provides invoice, financing, dispute, or audit operations. The available sections change with the selected role.
- `Transactions`: Shows transactions initiated by the current wallet, their confirmation status, and Etherscan links.
- `Profile`: Shows the wallet, network, login session, balance, and role status, and provides access to role management.

The desktop layout uses a left sidebar. The mobile layout uses four navigation items at the bottom of the page. The role selector remains available in both layouts.

### 5.1 Why Action Buttons Change

The platform only displays actions that are valid for the selected role and current business stage. For example, a financing request is not available before an invoice is confirmed, funding is not available before an offer is accepted, and overdue actions are not available before the invoice due date.

If an expected button is missing, check the following in order:

1. The correct MetaMask account is selected.
2. MetaMask is connected to Sepolia.
3. The correct role is selected at the top of the page.
4. The role is `Active`, or the wallet is already a recorded participant in the relevant business record.
5. The invoice, financing request, offer, or dispute is in a status that permits the action.
6. The offer deadline, 24-hour funding window, invoice due date, or three-day grace period has been reached where required.
7. No `Open` dispute is freezing the relevant financing operation.

Page data may take a few seconds to refresh after an on-chain transaction is confirmed. Do not send the same transaction again merely because a button has not changed immediately.

## 6. Requesting and Managing Roles

### 6.1 Requesting a Participant Role

1. Connect the wallet that needs the role and switch to Sepolia.
2. Open `Profile` and click `Manage` in the `Participant roles` section.
3. Find the required role and click `Request role`.
4. Review the target contract and estimated Gas in the platform's transaction confirmation window.
5. Click `Continue to MetaMask`, then approve the transaction in MetaMask.
6. After on-chain confirmation, the role status becomes `Pending`.
7. Wait for Admin approval. Once approved, the role becomes `Active` and its selector displays a green dot.

The contract rejects a duplicate request for the same role. Do not request a role that the wallet already holds.

### 6.2 Admin Approval

1. Connect the Admin wallet and select `Admin` at the top of the page.
2. Open `Profile → Manage`.
3. In `Pending requests`, verify the applicant wallet and requested role.
4. Click `Approve`, then confirm the operation in both the platform window and MetaMask.
5. Wait for on-chain confirmation. The applicant's role then becomes `Active`.

### 6.3 Admin Revocation

In `Active participant roles`, find the relevant wallet and role, click `Revoke`, and approve the transaction. Revocation prevents the wallet from initiating new actions that require the role, but it does not remove existing on-chain records.

## 7. Supplier Operations

### 7.1 Creating an Invoice

Before creating an invoice, make sure that:

- The Supplier role is `Active`.
- The specified Buyer wallet has an `Active Buyer` role.
- The Buyer address differs from the Supplier address.
- The due date is later than the issue date and later than the current time.
- The wallet is signed in so that the business invoice number can be saved and displayed.

Steps:

1. Select `Supplier` at the top of the page.
2. Open `Activity → Invoices`.
3. Complete the `Create invoice` form:
   - `Buyer wallet`: the Buyer's complete wallet address;
   - `Invoice number`: the business invoice number used by the organization;
   - `Face value (ETH)`: the total invoice amount payable by the Buyer;
   - `Issue date`: the invoice issue date;
   - `Due date`: the payment due date;
   - `Document hash (optional)`: an optional `bytes32` document hash.
4. If no document hash is available, leave the field empty. The interface generates a hash from the invoice number, but it does not upload or store the original invoice file.
5. Click `Submit invoice`.
6. In the confirmation window, check the target contract, amount sent, and estimated Gas. Invoice creation does not transfer business funds, so `Amount sent` should be `0 ETH`.
7. Click `Continue to MetaMask` and approve the transaction.
8. After confirmation, the invoice status becomes `Awaiting buyer`.

The business invoice number is stored in backend metadata. The blockchain stores its hash together with the participants, amount, dates, and document hash. The same participants and key invoice fields cannot be registered twice.

### 7.2 Requesting Financing

Only an invoice with the `Confirmed` status can be financed.

1. Open `Activity → Financing`.
2. Find the invoice under `Ready for financing`.
3. Enter:
   - `Funding amount (ETH)`: the principal requested in advance. It must be greater than zero and cannot exceed the invoice face value;
   - `Max rate (bps)`: the highest acceptable annual interest rate;
   - `Holdback (bps)`: the proportion of the principal temporarily retained in the contract;
   - `Offer deadline`: the deadline for Funder offers. It must be later than the current time and earlier than the invoice due date.
4. Click `Request financing` and approve the transaction.
5. After confirmation, the invoice becomes `Financing open`, and the financing request becomes `Open`.

`bps` means basis points: `100 bps = 1%`, `600 bps = 6%`, and `1000 bps = 10%`. The current contracts limit the maximum rate to `10000 bps` and the holdback to `5000 bps`.

### 7.3 Reviewing and Accepting Offers

1. Open the financing record under `Activity → Financing → Needs action`.
2. Compare the offered rates and Funder addresses.
3. Click `Accept` beside the selected offer and approve the transaction.
4. After confirmation, the financing status becomes `Offer accepted`.

Accepting an offer does not transfer funds immediately. The selected Funder must provide the principal within 24 hours after acceptance.

### 7.4 Cancelling or Closing a Financing Request

- Before an offer is accepted, the Supplier can click `Cancel request` to cancel the financing request.
- After the offer deadline, click `Close expired request` to close an expired request.
- If an accepted offer is not funded within 24 hours, click `Release expired offer`. If the original offer deadline is still valid, the request returns to `Open`. Otherwise, the request closes and the invoice returns to `Confirmed`.

These financing actions are frozen while a dispute is `Open`.

## 8. Buyer Operations

### 8.1 Confirming or Rejecting an Invoice

1. Connect the Buyer wallet specified in the invoice.
2. `Sign in` so that the business invoice number is visible.
3. Select `Buyer`, then open `Activity → Invoices`.
4. Under `Invoices for your review`, verify the Supplier, invoice number, amount, and due date.
5. Click `Confirm` if the information is correct, or `Reject` if it is not accepted.
6. Approve the transaction in the platform confirmation window and MetaMask.

After confirmation, the status becomes `Confirmed`, allowing the Supplier to request financing. After rejection, the status becomes `Rejected`, and the invoice cannot proceed to financing. Review all information carefully before confirming or rejecting it.

### 8.2 Repaying an Invoice

A funded invoice appears under `Activity → Financing → Repayments due`.

1. Verify the invoice, face value, and current status.
2. Click `Repay`. The button displays the full invoice face value that must be sent.
3. Check `Amount sent` in the platform confirmation window, then approve the transaction in MetaMask.
4. Wait for confirmation. Do not submit the payment again while the transaction is pending.

If there is no unresolved dispute, the contract settles immediately. It pays principal and interest to the Funder, the platform fee to the Treasury, and the remaining amount together with the holdback to the Supplier. The invoice becomes `Repaid`, and the financing record becomes `Settled`.

If a dispute is open, the Buyer can still repay, but the funds are not allocated immediately. The invoice becomes `Repayment deposited`, and the payment remains in `FinancingPool` until the Arbitrator issues a ruling. The Buyer cannot repay the same invoice again in this state.

## 9. Funder Operations

### 9.1 Submitting an Offer

1. Connect a wallet with an `Active Funder` role.
2. Select `Funder`, then open `Activity → Financing`.
3. Under `Open opportunities`, review the requested principal, invoice face value, maximum rate, and offer deadline.
4. Enter the annual rate in `Your annual rate (bps)`. It must be greater than zero and cannot exceed the Supplier's maximum rate.
5. Click `Submit offer` and approve the transaction.

A Supplier cannot use the same wallet to offer funding for its own financing request. One financing request can receive no more than 20 on-chain offers.

### 9.2 Withdrawing an Offer

If the financing request is still `Open` and the offer remains `Active` and has not been accepted, open `Your active projects` and click `Withdraw offer`. The offer becomes `Expired` and can no longer be accepted.

### 9.3 Providing the Principal

After the Supplier accepts an offer:

1. Find the `Offer accepted` record under `Your active projects`.
2. Review the estimated `Supplier upfront`, `Held back`, `Interest`, `Platform fee`, `Funder repayment`, and `Supplier final` values.
3. Click `Fund`. The button displays the exact principal that must be sent.
4. Verify `Amount sent`, the wallet balance, and estimated Gas in the confirmation window.
5. Approve the transaction in MetaMask.

Only the selected Funder can provide the principal. The amount sent must equal the requested principal exactly, and funding must be completed within 24 hours after offer acceptance.

The contract handles the funds as follows:

- `Holdback = principal × holdback rate`;
- `Supplier upfront = principal − holdback`;
- The holdback remains temporarily in `FinancingPool`;
- Interest is calculated from the principal, offered annual rate, and the number of days from funding to maturity. It is locked when funding is confirmed.

For example, if the invoice face value is `0.1 ETH`, the principal is `0.08 ETH`, and the holdback is `10%`, then `0.008 ETH` remains temporarily in the contract and `0.072 ETH` is paid immediately to the Supplier.

## 10. Maturity, Overdue Status, and Default

### 10.1 Marking an Invoice Overdue

If an invoice remains unpaid on or after its due date, the Supplier, Buyer, or Funder involved in that financing can click `Mark overdue` on the financing card. After confirmation:

- The invoice becomes `Overdue`;
- The financing record becomes `Overdue`;
- The Buyer can still repay.

### 10.2 Declaring Default

The current grace period is three days after the invoice due date. If the financing remains unsettled after the due date and grace period, a business participant can click `Declare default`.

After default is confirmed:

- The invoice and financing record become `Defaulted`;
- The holdback retained by the contract is returned to the Funder;
- The interface records the Funder's `Principal loss` and `Unpaid interest`;
- The financing process ends, and the Buyer can no longer repay through the original workflow.

If a dispute remains unresolved, normal overdue and default actions are frozen. The Arbitrator may select `Confirm default` when it is compatible with the current stage.

## 11. Disputes and Evidence

### 11.1 Who Can Open a Dispute

The following wallets can open a dispute for a related invoice:

- The invoice Supplier;
- The Buyer specified in the invoice;
- A Funder that submitted an offer for a financing request associated with the invoice.

A dispute can be opened while the invoice is `Confirmed`, `Financing open`, `Funded`, `Overdue`, or `Repayment deposited`. Only one unresolved dispute can exist for an invoice at a time.

### 11.2 Opening a Dispute

1. Select the relevant participant role and open `Activity → Disputes`.
2. Find the invoice under `Open a dispute`.
3. Enter a short reason in `Reason or reason hash`, or enter a valid `bytes32` hash directly.
4. Click `Open dispute` and approve the transaction.
5. After confirmation, the case becomes `Open`, and financing operations related to the invoice are frozen.

If ordinary text is entered, the interface calculates its Keccak-256 hash and submits the hash to the blockchain. The original reason text is not stored on chain.

### 11.3 Submitting an Evidence Hash

1. Find the `Open` case under `Your cases`.
2. Enter an evidence description in `Evidence note or hash`, or enter an existing `bytes32` hash.
3. Click `Add evidence` and approve the transaction.

The system stores only the evidence hash, submitting wallet, and submission time on chain. It does not store a file or the original text. Original materials that the Arbitrator needs to inspect must be exchanged through an agreed off-chain channel. Their hashes can then be compared with the on-chain records to detect modification.

### 11.4 Repayment During a Dispute

A dispute does not remove the Buyer's payment obligation. The Buyer can click `Repay` and send the full invoice face value. The funds enter contract escrow, and the invoice shows `Repayment deposited`. The contract processes the payment only after the dispute is resolved.

## 12. Arbitrator Operations

1. Connect a wallet with an `Active Arbitrator` role.
2. Select `Arbitrator`, then open `Activity → Disputes`.
3. Under `Cases`, review the case status, invoice stage, opening wallet, reason hash, evidence hashes, and evidence submitters.
4. Select one of the ruling buttons available for the current business stage.
5. Approve the ruling transaction in the platform confirmation window and MetaMask.

The system supports three predefined rulings:

- `Resume workflow`: Removes the freeze and continues the previous business process. If the Buyer's repayment is already held in escrow, the contracts immediately complete the normal allocation.
- `Cancel financing`: Available only when financing has opened but has not been funded. The financing request is cancelled, and the invoice returns to `Confirmed`.
- `Confirm default`: Available for an unsettled financing record in the `Funded` or `Overdue` stage. The contracts execute default settlement and return the holdback to the Funder.

The Arbitrator cannot enter arbitrary receiving addresses or ruling amounts and cannot rule on an invoice in which that wallet participated. If the Arbitrator wallet is also the Supplier, Buyer, or an offering Funder for the invoice, the contract rejects the ruling because of the conflict of interest.

## 13. Auditor Operations

The Auditor workspace is read-only and contains no buttons that modify business state.

1. Connect a wallet with an `Active Auditor` role.
2. `Sign in` so that business invoice numbers and other permitted metadata can be loaded.
3. Select `Auditor`, then open `Activity → Audit`.

The Audit workspace contains three views.

### 13.1 Overview

The Overview displays:

- Total invoices and repaid invoices;
- Total financing principal;
- Buyer repayments already settled;
- Platform fees and Supplier receipts;
- Invoice and financing status distributions;
- The latest Sepolia block height read by the interface.

Click `Refresh` to read the latest data again.

### 13.2 Cash Flow

The Cash Flow view displays financing and settlement data for each record, including:

- Funder invested;
- Supplier upfront;
- Holdback;
- Interest;
- Funder repayment;
- Platform fee;
- Buyer payment;
- Supplier final.

A default record also displays `Holdback returned`, `Principal loss`, and `Unpaid interest`.

### 13.3 Events

Events are displayed in reverse chronological order from the five business contracts. Users can:

- Filter by `Invoices`, `Financing and offers`, `Cash flows`, `Disputes`, or `Roles`;
- Search by event name, transaction hash, or wallet address;
- Click `View transaction on Etherscan` to verify a transaction independently.

Audit data is read live by the browser through Sepolia RPC. It does not depend on a backend mirror of on-chain business state. On first load, or when RPC is slow, wait for the event scan to complete.

## 14. Transaction Confirmation and Tracking

Every state-changing blockchain operation has two confirmation stages:

1. The platform first displays `Review transaction`, including the target contract, amount sent, estimated Gas, estimated maximum network fee, and wallet balance.
2. After the user clicks `Continue to MetaMask`, MetaMask displays the final transaction information and requests approval.

If the platform detects an insufficient balance, it disables the continue button. Gas prices can change after estimation, so the final values shown by MetaMask take precedence.

The `Transactions` page uses the following statuses:

| Status | Meaning |
|---|---|
| `Awaiting signature` | Waiting for confirmation in the platform or MetaMask |
| `Confirming` | Submitted and waiting for Sepolia confirmation |
| `Confirmed` | Successfully confirmed on chain |
| `Failed` | Submission failed or the contract reverted the transaction |
| `Cancelled` | Cancelled by the user in the platform window or MetaMask |

When the wallet is signed in, the backend verifies and stores transactions after on-chain confirmation. `Confirmed on-chain · Sync incomplete` means that the blockchain transaction succeeded but the backend transaction record was not synchronized. Verify the transaction through Etherscan and do not submit the financial operation again.

## 15. Business Status Reference

### 15.1 Invoice Status

| Status | Meaning |
|---|---|
| `Awaiting buyer` | Waiting for the specified Buyer to confirm or reject the invoice |
| `Rejected` | Rejected by the Buyer; the process has ended |
| `Confirmed` | Confirmed by the Buyer and eligible for a financing request |
| `Financing open` | A financing request is open |
| `Funded` | The Funder has provided the principal; waiting for Buyer repayment |
| `Repaid` | Buyer repayment and settlement are complete |
| `Overdue` | The due date has passed and the invoice has been marked overdue |
| `Repayment deposited` | Repayment made during a dispute is held in contract escrow |
| `Defaulted` | Default has been confirmed; the process has ended |

### 15.2 Financing Status

| Status | Meaning |
|---|---|
| `Open` | Accepting Funder offers |
| `Offer accepted` | The Supplier selected an offer; waiting for the selected Funder to fund |
| `Funded` | Principal provided; waiting for Buyer repayment |
| `Settled` | Repayment and automatic allocation are complete |
| `Cancelled` | Cancelled by the Supplier or a dispute ruling |
| `Expired` | Closed after the offer or funding window expired |
| `Overdue` | The invoice due date has passed |
| `Defaulted` | Default settlement has been executed |

### 15.3 Offer and Dispute Status

| Type | Status | Meaning |
|---|---|---|
| Offer | `Active` | Available for Supplier acceptance and Funder withdrawal |
| Offer | `Accepted` | Selected by the Supplier and waiting for funding |
| Offer | `Expired` | Withdrawn, superseded by another funded offer, or closed after expiry |
| Dispute | `Open` | Under review; relevant financing operations are frozen |
| Dispute | `Resolved` | The Arbitrator has issued a ruling |

## 16. Mobile Use

The platform uses a responsive layout and can be used from a mobile browser:

- The main navigation appears at the bottom of the page;
- Business cards change to a single-column layout;
- The role selector, wallet address, and network status remain available at the top;
- MetaMask Mobile users should open the platform in MetaMask's built-in browser or another browser environment that supports wallet connection.

After submitting a transaction, wait for its status to update. Do not repeatedly tap the same button because of mobile network delay. Use `Transactions` or the relevant business card to open the transaction in Etherscan when verification is needed.

## 17. Troubleshooting

| Problem | Resolution |
|---|---|
| The page reports that MetaMask is not installed | Install and enable MetaMask, then reopen the page |
| The page asks for a network change | Click `Switch network` and approve the change to Sepolia in MetaMask |
| The business invoice number is not visible | Use `Sign in` with the current wallet; only the Supplier, specified Buyer, and Active Auditor can read the relevant metadata |
| The account becomes Signed out after switching wallets | This is expected security behaviour; sign in again with the new wallet |
| A role shows a red dot or Not active | Open `Profile → Manage`, request the role, and wait for Admin approval |
| A role remains Pending | Ask the Admin to review and approve the on-chain request |
| A transaction button is unavailable | Check the wallet connection, Sepolia network, role status, business status, and contract configuration |
| MetaMask reports an insufficient balance | Obtain enough Sepolia ETH for both the transaction amount and Gas |
| A transaction remains Confirming for a long time | Look up the transaction hash in Etherscan and check Sepolia or RPC status |
| The page does not update immediately | Wait a few seconds and refresh the data; check Etherscan before paying or funding again |
| Confirmed on-chain · Sync incomplete | The blockchain transaction succeeded, but backend synchronization failed; do not submit it again |
| The invoice number appears as Invoice # | The current wallet is signed out or is not permitted to read that invoice's off-chain metadata |
| Evidence is shown only as a hash | The system stores only the on-chain hash, submitter, and time, not the original text or file |
| Financing operations are frozen | Check for an `Open` dispute and wait for the Arbitrator's ruling |
| A dispute cannot be resolved | Confirm that the Arbitrator role is active and the wallet is not an invoice or financing participant |
| Audit loads slowly | Wait for the live event scan, or check the Sepolia RPC connection and click `Refresh` |

## 18. Safe-use Recommendations

- For every transaction, verify the action name, target contract, amount sent, and wallet account.
- A Buyer repayment or Funder funding transaction must clearly succeed or fail before another attempt is made.
- For higher-value operations, verify the contract address and current state through Etherscan first.
- Do not treat an ordinary evidence description as a recoverable on-chain file. Retain the original material independently before submitting its hash.
- Do not transfer funds directly to a contract address. Business funds must be sent through the `Fund` or `Repay` action provided by the interface.
- If the interface and Etherscan appear inconsistent, rely on confirmed blockchain transactions and contract state. Contact the platform administrator before submitting another transaction.
