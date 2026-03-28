# Fantasy500

Fantasy stock-market league platform — draft Fortune 500 companies, score weekly percentage price changes, compete in leagues with snake drafts, waivers, and on-chain buy-ins.

## Architecture

```
frontend/          React 19 + Vite + TypeScript + Tailwind CSS 4
                   Solana Wallet Adapter · React Router · WebSocket client

crates/
  shared/          Domain types shared by server, worker, and (via JSON) the frontend
  server/          Axum HTTP/WS API — auth, leagues, drafts, rosters, waivers, scoring, chain-ix endpoints
  worker/          Background market-data ingestion + weekly scoring calculator

programs/
  fantasy_league/  Anchor smart contract — league escrow, draft-pick commitments,
                   roster roots, payout distribution
```

### Hybrid on-chain / off-chain model

| Concern | Where |
|---|---|
| League buy-ins (SOL escrow) | On-chain (Anchor PDA) |
| Draft pick commitments (SHA-256 hashes) | On-chain events |
| Roster ownership roots per week | On-chain events |
| Payout distribution | On-chain (PDA → winner transfer) |
| Game logic (snake draft, waiver wire) | Off-chain (Axum + MongoDB) |
| Weekly scoring (% price changes) | Off-chain (worker + MongoDB) |
| Real-time updates | Off-chain (WebSocket broadcast) |

## Prerequisites

- **Rust** ≥ 1.78 (workspace uses resolver 2)
- **Node.js** ≥ 20 + **pnpm** ≥ 9
- **MongoDB** ≥ 7 running locally (or Atlas URI)
- **Solana CLI** + **Anchor CLI** ≥ 0.30 (for program builds/deploys)

## Quick start

```bash
# 1. Clone & install
cp .env.example .env            # edit as needed
cd frontend && pnpm install && cd ..

# 2. Start MongoDB (e.g. brew services start mongodb-community)

# 3. Run the API server
cargo run --bin server

# 4. Run the frontend dev server (proxies /api + /ws to :8080)
cd frontend && pnpm dev

# 5. (Optional) Run the scoring worker
cargo run --bin worker

# 6. (Optional) Build & deploy Anchor program
cd programs/fantasy_league
anchor build
anchor deploy --provider.cluster devnet
```

## API routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/challenge` | — | Request a sign-in challenge message |
| POST | `/api/auth/verify` | — | Verify wallet signature → JWT |
| GET | `/api/me` | JWT | Current user |
| GET | `/api/universe` | — | Available Fortune 500 symbols |
| GET | `/api/leagues` | — | List leagues |
| POST | `/api/leagues` | JWT | Create league |
| GET | `/api/leagues/:id` | — | Get league |
| DELETE | `/api/leagues/:id` | JWT | Delete league (commissioner) |
| POST | `/api/leagues/:id/join` | JWT | Join league |
| POST | `/api/leagues/:id/start-draft` | JWT | Start snake draft (commissioner) |
| GET | `/api/leagues/:id/draft` | — | Get draft state |
| POST | `/api/leagues/:id/draft/pick` | JWT | Submit draft pick |
| POST | `/api/leagues/:id/waivers` | JWT | Submit waiver claim |
| GET | `/api/leagues/:id/scores` | — | Latest weekly scoreboard |
| GET | `/api/chain/ix/init-league` | — | Anchor ix data: initialize league |
| GET | `/api/chain/ix/record-pick` | — | Anchor ix data: record draft pick |
| GET | `/api/chain/ix/deposit-buy-in` | — | Anchor ix data: deposit buy-in |
| WS | `/ws` | — | Real-time draft + scoreboard events |

## License

MIT
