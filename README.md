# SME Receivables Financing

A mobile first course project demonstrating invoice financing on the Sepolia testnet. The shortest implemented flow is:

1. wallets request participant roles and the administrator approves them;
2. a supplier submits an invoice and the buyer confirms it;
3. the supplier opens financing, a funder submits an offer, and the supplier accepts it;
4. the funder supplies Sepolia test ETH and the buyer repays the invoice;
5. the contract distributes principal, interest, fee, and supplier proceeds.

The demo settles with native Sepolia ETH, so MockUSD is not required.

## Project structure

- `frontend/`: React, TypeScript, Vite, Mantine, and Ethers.js.
- `backend/`: Flask API, SQLite metadata, wallet signature sessions, and transaction verification.
- `contracts/`: Solidity contracts and interfaces for Remix deployment.
- `doc/`: design, UI, API, assignment mapping, and user guide documents.

## Run the backend

```powershell
conda env create -f backend/environment.yml
conda activate sme-receivables
Copy-Item backend/.env.example backend/.env
python backend/run.py
```

Set `SEPOLIA_RPC_URL` and the four deployed contract addresses in `backend/.env`.

## Run the frontend

```powershell
Set-Location frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Put the same four contract addresses in `frontend/.env`. Vite proxies `/api` to `http://127.0.0.1:5000` during development.

## Deploy contracts

See `contracts/README.md` for the Remix deployment order and the two required post-deployment configuration calls.
