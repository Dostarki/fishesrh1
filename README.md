# Frostfish

Frostfish is a React game with a FastAPI backend. On a fresh checkout, the local demo runs without MongoDB: game sessions are kept in memory and reset when the backend stops.

## Quick start on Windows

Install Node.js (including npm) and Python 3.10 or newer. From PowerShell, run `cd C:\Users\Adem\Desktop\fishesrh` and then `.\start.ps1`. The script installs the EVM signature verifier and frontend packages when needed, then starts the local API. It uses Yarn 1 when available and falls back to npm. Open http://localhost:3000. Use Ctrl+C in the PowerShell window to stop the app.

First launch needs an internet connection to download packages. The frontend dependencies are locked by `frontend/yarn.lock`.

## Start manually

In PowerShell window 1, from the project folder, run `python -m pip install "eth-account>=0.13.7,<0.14"` once, then `python backend\local_server.py`.

In PowerShell window 2, run `cd frontend`, `yarn install --frozen-lockfile` (or `npm install`), and `npm start`.

The API health endpoint is http://localhost:8000/api/health. The frontend defaults to this API URL; `frontend/.env.example` shows optional overrides. Wallet sign-in uses a one-time message signature that the server verifies before issuing a wallet session. It does not submit a transaction.

## MongoDB sessions

The local demo store is in-memory, so sessions reset when the API stops. To use persistent MongoDB sessions instead, install `backend/requirements.txt`, create `backend/.env` from `backend/.env.example`, and run the FastAPI app with Uvicorn: `python -m uvicorn server:app --app-dir backend --reload --host 127.0.0.1 --port 8000`.

## Early Access campaign

The landing page's Early Access button collects an X username and EVM address, then shows Follow, Repost, Like and Quote tasks. Points are awarded once per task (10 each, 30 for Quote) after the participant returns and marks it complete. X actions are self-confirmed because no X API credentials are configured. To persist participants and scores, set `MONGO_URL` and `DB_NAME` in `backend/.env`; the local launcher detects that URI, installs the MongoDB driver if needed, and stores campaign records in the `early_access_participants` collection. Without `MONGO_URL`, the local preview uses memory and those records reset when the server stops.

Set `REACT_APP_X_TASK_POST_URL` in `frontend/.env` to the X post URL used for Repost, Like and Quote. The Follow task always opens `https://x.com/fishesrh`. Quote opens an X compose draft with the Early Access message and configured post URL; the participant confirms publishing in X.

## Wallet network

Wallet configuration defaults to Robinhood Chain Testnet. The public RPC may be rate-limited; change it with `REACT_APP_ROBINHOOD_RPC_URL` if needed. For mobile WalletConnect in a regular browser, set `REACT_APP_WALLETCONNECT_PROJECT_ID` in `frontend/.env` using a project ID from WalletConnect Cloud. Without it, users can connect through an injected desktop wallet or a wallet's in-app browser. Configure `APP_URL` and `ROBINHOOD_CHAIN_ID` in `backend/.env` to match the frontend in a deployed environment.
