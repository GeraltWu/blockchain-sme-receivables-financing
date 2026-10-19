# SME Receivables Financing

A mobile first course project demonstrating invoice financing on the Sepolia testnet. The shortest implemented flow is:

1. wallets request participant roles and the administrator approves them;
2. a supplier submits an invoice and the buyer confirms it;
3. the supplier opens financing, a funder submits an offer, and the supplier accepts it;
4. the funder supplies Sepolia test ETH;
5. a participant opens a dispute and submits an evidence hash;
6. the buyer repays into escrow while the dispute is open;
7. the arbitrator resolves the dispute and the contract settles the funds;
8. the auditor reviews live on-chain events and cash-flow data.

The demo settles with native Sepolia ETH, so MockUSD is not required.

## Project structure

- `frontend/`: React, TypeScript, Vite, Mantine, and Ethers.js.
- `backend/`: Flask API, SQLite invoice metadata, wallet signature sessions, and transaction verification records.
- `contracts/`: Solidity contracts and interfaces for Remix deployment.
- `doc/`: design, implemented UI/API documentation, user guide, and the six-minute demo procedure.

The smart contracts are the source of truth for business state. The frontend reads contract records and events directly through the Sepolia RPC; there is currently no backend business-state or event mirror. SQLite only stores login nonces/sessions, invoice metadata, and verified transaction records. This is sufficient for the short demo, but the Audit page should be opened once before recording so its live event scan is warmed up.

## Local setup

The project runs locally as two services: the Flask backend on `http://127.0.0.1:61133` and the Vite frontend on `http://localhost:5173`.

### 1. Start the backend

From the project root, create the Conda environment once:

```powershell
conda env create -f backend/environment.yml
conda activate sme-receivables
Copy-Item backend/.env.example backend/.env
```

Set `SEPOLIA_RPC_URL`, `FRONTEND_ORIGIN`, and the five deployed contract addresses in `backend/.env`, then start the backend:

```powershell
python backend/run.py
```

For later runs, only activate the existing environment before starting:

```powershell
conda activate sme-receivables
python backend/run.py
```

### 2. Start the frontend

Open another PowerShell window and run:

```powershell
Set-Location frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Put the same five contract addresses in `frontend/.env`. Vite proxies `/api` to `http://127.0.0.1:61133` during local development. Open the URL printed by Vite, normally `http://localhost:5173`.

## Deploy contracts

See `contracts/README.md` for the Remix deployment order and required post-deployment configuration calls.

## Documentation

- [`doc/设计文档.md`](doc/设计文档.md): product and business design baseline.
- [`doc/API设计文档.md`](doc/API设计文档.md): API and data storage as currently implemented.
- [`doc/UI设计文档.md`](doc/UI设计文档.md): UI behavior as currently implemented.
- [`doc/用户操作手册.md`](doc/用户操作手册.md): Chinese end-user manual.
- [`doc/测试操作流程.md`](doc/测试操作流程.md): six-minute single-invoice demo procedure.
