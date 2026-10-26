# SeshPay

Sponsor-controlled USDC payouts for creators, workshop hosts, contributors and community events on Arc.
Built with [Arc Studio](https://studio.arc.io)

## Routes

| Path | Description |
|---|---|
| `/` | Public landing page |
| `/app` | Functional wallet app (Create Event, Pay Contributors, Recover Funds, My Events) |

## Tech stack

- React 18, TypeScript, Vite, Tailwind CSS v3
- wagmi v2, viem, ConnectKit — EVM wallet connection
- react-router-dom v7 — client-side routing
- Solidity 0.8.28 + OpenZeppelin 5 — `SessionSplit` contract on Arc Testnet
- Foundry — Solidity unit tests (16 tests)
- Bun test — JS unit tests (30 tests, `src/utils/format.test.ts`)

## Development

### Prerequisites

- Bun >= 1.3
- Foundry (for contract work)
- An EVM wallet (MetaMask or Rabby) with Arc Testnet configured

### Environment variables

None required for development — the app reads only public onchain state.

### Install and run

```bash
bun install
bun run dev        # starts Vite at http://localhost:5173
```

### Checks

```bash
bun run check      # lint + typecheck
bun test           # JS unit tests
bun run contracts:test  # Foundry tests
bunx vite build    # production build
```

## Deployment (Vercel / Netlify / Hugging Face)

`vercel.json` contains the SPA fallback rewrite so direct navigation to `/app` works after deploy. For Netlify, add a `public/_redirects` file with `/* /index.html 200`.

## Contract

- **Address:** `0x0fe8a41346ab7aa30dc183384a85b5e36051713c` (Arc Testnet)
- **ABI:** `src/contracts/sessionSplit.ts`
- Non-upgradeable, no admin, no platform fee.
- Arc Testnet only — no real funds.

SeshPay is a sponsor-controlled USDC payout application for creators, workshops, and communities on Arc. A sponsor deposits funds on-chain, then approves exactly who gets paid and how much — nothing is released automatically. If the approval deadline passes without a settlement, the sponsor can recover their full deposit.

Built with [Arc Studio](https://studio.arc.io)

---

## Tech stack

- **Smart contract**: Solidity 0.8.28, OpenZeppelin 5.6.1 (SafeERC20, ReentrancyGuard), Arc Testnet
- **Frontend**: React 18, TypeScript, Vite, wagmi v2, viem, ConnectKit, Tailwind CSS, Framer Motion
- **Testing**: Foundry (forge) — 16 unit tests

## Smart contract

Deployed at `0x0fe8a41346ab7aa30dc183384a85b5e36051713c` on Arc Testnet.
USDC (Arc Testnet): `0x3600000000000000000000000000000000000000`

The contract is non-upgradeable, has no admin or platform fee, and enforces an explicit OPEN → SETTLED / REFUNDED state machine. All USDC movement uses SafeERC20. Settlement follows CEI ordering with reentrancy protection.

## Development

### Prerequisites

- [Bun](https://bun.sh) 1.x
- [Foundry](https://book.getfoundry.sh) (for contract work)

### Install

```bash
bun install
```

### Environment variables

| Variable | Purpose | Required outside Arc Studio |
|---|---|---|
| `VITE_NETWORK` | Set to `mainnet` for Arc Mainnet build; omit or set to `testnet` for Arc Testnet (default) | No |
| `RPC_PROXY_BASE_URL` | Arc Studio RPC proxy base URL | No (optional, falls back to public RPC) |
| `RPC_PROXY_TOKEN` | Arc Studio RPC proxy token | No |
| `RPC_PROXY_CHAINS` | Chains the proxy covers | No |

### Run

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Build

```bash
bun run build
```

### Lint and typecheck

```bash
bun run check
```

### Contract tests

```bash
forge test
```

## Tabs

| Tab | What it does |
|---|---|
| Create Event | Approve USDC spend, then create and fund an event on-chain |
| Pay Contributors | Approve payouts to the host and up to 5 contributors atomically |
| Recover Funds | Reclaim full deposit after the approval deadline if no payouts were made |
| My Events | Look up any event by ID to see live status, amounts, and deadline |

## Arc Testnet

Arc is Circle's blockchain where USDC is the native gas token. Use the **Get test USDC** button in the Arc Studio sidebar to fund your wallet.
