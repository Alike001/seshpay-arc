# SeshPay

**Fund a session. Pay your people.**

SeshPay is a sponsor-controlled USDC payout application built on [Arc](https://arc.io), Circle's blockchain where USDC is the native gas token. Sponsors deposit funds on-chain before a session starts, then approve exactly who gets paid and how much after it ends — nothing is released automatically. If the approval deadline passes without a settlement, the sponsor can recover their full deposit.

Built with [Arc Studio](https://studio.arc.io) &middot; Currently running on **Arc Testnet** (test USDC only)

---

## Links

| | |
|---|---|
| **Live app** | [seshpay.vercel.app](https://seshpay.vercel.app/) |
| **Application** | [seshpay.vercel.app/app](https://seshpay.vercel.app/app) |
| **GitHub** | [github.com/Alike001/seshpay-arc](https://github.com/Alike001/seshpay-arc) |
| **Arc Studio project** | [studio.arc.io/app/d819f5b0-04cf-4a1b-a6fa-cb01b4270952](https://studio.arc.io/app/d819f5b0-04cf-4a1b-a6fa-cb01b4270952) |
| **Contract on ArcScan** | [explorer.testnet.arc.io/address/0x0fe8a...1713c](https://explorer.testnet.arc.io/address/0x0fe8a41346ab7aa30dc183384a85b5e36051713c) |

---

## Features

- **Sponsor-controlled funding** — only the wallet that creates an event can approve payouts or recover funds
- **Atomic settlement** — host payout and up to five contributor rewards are distributed in one on-chain transaction
- **Automatic unused-budget return** — any unallocated contributor budget is returned to the sponsor at settlement time
- **Deadline-based refunds** — if the approval deadline passes with no settlement, the sponsor can reclaim their full deposit
- **No admin, no platform fee, no upgradeability** — the contract is immutable and has no privileged accounts
- **Verifiable receipts** — every create, settle, and refund emits indexed on-chain events with explorer links
- **Read-only event pages** — shareable `/app/events/:id` URLs show live contract state without requiring a wallet
- **Event history** — My Events tab scans up to 50 recent events created by the connected wallet

---

## How SeshPay works

```
Sponsor                          Contract                         Recipients
   │                                │                                  │
   │── createSession ──────────────>│  USDC deposited on-chain         │
   │   (2 wallet confirmations:     │  Event state: OPEN               │
   │    approve spend + create)     │                                  │
   │                                │                                  │
   │      [before deadline]         │                                  │
   │── settle(host, contributors) ->│  State: SETTLED                  │
   │   (1 wallet confirmation)      │── hostPayout ─────────────────> host
   │                                │── amounts[0..4] ──────────────> contributors
   │                                │── unused budget ──────────────> sponsor
   │                                │                                  │
   │      [after deadline, if       │                                  │
   │       no settlement occurred]  │                                  │
   │── refund() ──────────────────->│  State: REFUNDED                 │
   │                                │── fullDeposit ─────────────────> sponsor
```

1. **Create an event** — set a host address, host payout amount, optional contributor reward budget, and an approval deadline. Two wallet confirmations are required: first to approve the USDC spend, then to create the event and deposit funds.
2. **Approve payouts** — before the deadline, the sponsor calls `settle` with a list of contributor addresses and amounts. The host payout, all contributor rewards, and any remaining budget are distributed atomically in one transaction.
3. **Recover funds** — if the deadline passes without a settlement, the sponsor calls `refund` to recover the full deposit.

Only the sponsor wallet (the one that called `createSession`) can approve payouts or trigger a refund. No third party can access the funds.

---

## Contract

| Property | Value |
|---|---|
| **Contract name** | `SessionSplit` |
| **Network** | Arc Testnet |
| **Chain ID** | `5042002` |
| **Address** | [`0x0fe8a41346ab7aa30dc183384a85b5e36051713c`](https://explorer.testnet.arc.io/address/0x0fe8a41346ab7aa30dc183384a85b5e36051713c) |
| **USDC (ERC-20)** | [`0x3600000000000000000000000000000000000000`](https://explorer.testnet.arc.io/address/0x3600000000000000000000000000000000000000) |
| **Solidity** | `0.8.28` (fixed, auto-detect off) |
| **License** | MIT (SPDX identifier in contract source) |
| **Upgradeable** | No |
| **Admin / owner** | None |
| **Platform fee** | None |
| **Arc Mainnet** | Not yet deployed |

---

## Verified testnet transactions

The following transactions were executed on Arc Testnet using test USDC and are permanently recorded on-chain.

| Event | Transaction | Explorer |
|---|---|---|
| Event #1 — funded | `0x929e...80b` | [View on ArcScan](https://explorer.testnet.arc.io/tx/0x929eba7096940d3ee07226e9a786bb334a7dfa3a047667588fb5eef5093e880b) |
| Event #1 — settled | `0xa56b...f59` | [View on ArcScan](https://explorer.testnet.arc.io/tx/0xa56bcc89a998850fb0a7693a804795d48ca50b71aeb177a1657c56f223a6df59) |

---

## Tech stack

| Layer | Technology |
|---|---|
| Smart contract | Solidity 0.8.28, OpenZeppelin 5.6.1 (`SafeERC20`, `ReentrancyGuard`) |
| Contract testing | Foundry (`forge test`) |
| Frontend | React 18, TypeScript, Vite 6, Tailwind CSS 3 |
| Wallet / onchain | wagmi v2, viem 2, ConnectKit 1.9 |
| Routing | react-router-dom v7 |
| Runtime / package manager | Bun |
| Frontend testing | Bun test |
| Linting / typechecking | oxlint, TypeScript |
| Deployment | Vercel (SPA, `vercel.json` rewrite included) |

---

## Installation and development

### Prerequisites

- [Bun](https://bun.sh) 1.x
- [Foundry](https://book.getfoundry.sh) (for contract compilation and tests)
- An EVM-compatible wallet (MetaMask, Rabby) configured for Arc Testnet

Arc Testnet RPC: `https://rpc.testnet.arc.io` &middot; Chain ID: `5042002`

### Install

```bash
git clone https://github.com/Alike001/seshpay-arc.git
cd seshpay-arc
bun install
```

### Environment variables

The app reads only public onchain state and has no required secrets for development.

| Variable | Purpose | Required |
|---|---|---|
| `VITE_NETWORK` | `testnet` (default) or `mainnet` | No |
| `RPC_PROXY_BASE_URL` | Arc Studio RPC proxy (auto-set in Arc Studio) | No |
| `RPC_PROXY_TOKEN` | Arc Studio RPC proxy token | No |
| `RPC_PROXY_CHAINS` | Chains covered by the proxy | No |

### Run locally

```bash
bun run dev       # starts Vite dev server at http://localhost:5173
```

### Build for production

```bash
bun run build     # outputs to dist/
```

### Lint and typecheck

```bash
bun run check     # runs oxlint + tsc --noEmit
```

### Run all tests

```bash
bun test                 # 146 JS/TS unit tests across 4 test files
bun run contracts:test   # 16 Foundry unit tests for SessionSplit.sol
```

---

## Testing and security

### Automated tests (verified 2026-10-27)

| Suite | File | Tests | Result |
|---|---|---|---|
| Solidity contract | `contracts/test/SessionSplit.t.sol` | 16 | Pass |
| USDC formatting | `src/utils/format.test.ts` | 45 | Pass |
| Event ID extraction | `src/utils/eventId.test.ts` | 13 | Pass |
| Session decode | `src/utils/sessionDecode.test.ts` | 66 | Pass |
| UX regression | `src/utils/uxCleanup.test.ts` | 26 | Pass |
| **Total** | | **162** | **Pass** |

The Foundry tests cover all contract failure modes: unauthorized access, duplicate recipients, reward budget overflow, deadline enforcement (both directions), reentrancy via state machine, partial-participant payouts, zero-address inputs, and repeated settlement attempts.

### What the contract guarantees

- **Sponsor-only access** — `settle` and `refund` revert with `Unauthorized()` for any caller other than the original sponsor
- **One-time settlement** — state transitions from `OPEN` to `SETTLED` or `REFUNDED` are irreversible; the contract rejects a second call with `InvalidState()`
- **No fund leakage** — funds-in always equals funds-out: `hostPayout + totalParticipantRewards + refundedToSponsor = totalDeposit`
- **CEI + reentrancy guard** — state is written before any token transfer; `nonReentrant` provides double protection
- **SafeERC20** — all USDC transfers use OpenZeppelin `SafeERC20`; a failed transfer reverts the entire settlement atomically

### Known limitations

- **No independent security audit** — the contract has not been reviewed by an external security firm. Do not use with real funds without obtaining one.
- **USDC blacklisting** — if Circle freezes any recipient address at the USDC contract level, the settlement transaction will revert for all recipients until the freeze is lifted or the deadline passes and the sponsor calls `refund`.
- **Block timestamp** — deadline enforcement uses `block.timestamp`, which may differ from wall-clock time by a small margin on Arc.
- **Maximum 5 contributors per event** — enforced at the contract level.

---

## Deployment

The application is deployed to Vercel at [seshpay.vercel.app](https://seshpay.vercel.app/).

`vercel.json` includes an SPA fallback rewrite (`/* → /index.html`) so that direct navigation to `/app`, `/app/events/:id`, and other client-side routes works correctly after deploy.

For Netlify: `public/_redirects` contains `/* /index.html 200`.

**Arc Mainnet has not been deployed.** The `MAINNET_ADDRESS` field in `src/contracts/sessionSplit.ts` is intentionally empty. Setting `VITE_NETWORK=mainnet` in a build without populating that field will cause the app to throw a descriptive error at startup rather than silently connecting to the wrong contract.

---

## Project structure

```
seshpay-arc/
├── contracts/
│   ├── SessionSplit.sol          # Main contract (immutable, no admin)
│   ├── test/
│   │   └── SessionSplit.t.sol    # 16 Foundry unit tests
│   └── contract-metadata/        # Deployment metadata
├── src/
│   ├── components/               # React components (CreateSession, SettleSession,
│   │                             #   RefundSession, SessionStatus, Header, ...)
│   ├── contracts/
│   │   └── sessionSplit.ts       # ABI wrapper and address constants
│   ├── pages/
│   │   ├── LandingPage.tsx       # Public landing page (/)
│   │   └── EventDetail.tsx       # Read-only event detail (/app/events/:id)
│   ├── utils/
│   │   ├── format.ts             # USDC parsing and formatting
│   │   ├── eventId.ts            # Session ID extraction from receipt logs
│   │   ├── sessionDecode.ts      # wagmi result normaliser (tuple vs object)
│   │   └── *.test.ts             # Unit tests
│   ├── App.tsx                   # Dashboard (/app) — tab routing
│   ├── config.ts                 # wagmi config, network selection
│   └── onchain-facts.ts          # Chain registry (RPC, explorer, USDC address)
├── docs/
│   ├── mainnet-release-audit.md  # Pre-mainnet readiness audit
│   └── seshpay-v2-design.md      # V2 evidence and dispute design spec
├── foundry.toml                  # Foundry config (Solidity 0.8.28, Cancun EVM)
├── vercel.json                   # SPA rewrite for Vercel
└── package.json                  # Scripts: dev, build, check, contracts:test
```

---

## Roadmap

The following are design proposals and are **not implemented in V1**. See [`docs/seshpay-v2-design.md`](docs/seshpay-v2-design.md) for the V2 research document.

- **Host-submitted evidence** — structured IPFS-pinned completion evidence with on-chain hash commitments
- **Dispute protection** — pre-agreed reviewer workflow with bonded arbitration and timeout rules
- **Batch payouts** — settle multiple events in a single transaction
- **Arc Mainnet deployment** — pending an independent security audit
- **WalletConnect / mobile wallets** — currently only injected wallets are supported
- **Backend event indexer** — replace the 50-session scan cap with a full log-based history

---

## Contributing

Contributions are welcome. The project uses Bun as its package manager and Foundry for Solidity work.

1. Fork the repository and create a feature branch.
2. Run `bun install` and `bun run check` before making changes.
3. Add or update tests for any change to `contracts/` or `src/utils/`.
4. Run `bun test && bun run contracts:test` and confirm all tests pass.
5. Open a pull request with a clear description of the change and why it is needed.

Please do not submit pull requests that modify `SessionSplit.sol`, the ABI, or the deployed contract address without first opening an issue to discuss the change.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contribution guide and [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy.

---

## License

This project is released under the [MIT License](LICENSE).

The `contracts/SessionSplit.sol` source file carries an MIT SPDX identifier consistent with the root `LICENSE` file.
Copyright (c) 2026 Alike001.

---

Built with [Arc Studio](https://studio.arc.io) &middot; [Arc Studio project](https://studio.arc.io/app/d819f5b0-04cf-4a1b-a6fa-cb01b4270952)
