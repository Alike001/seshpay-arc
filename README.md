# SeshPay

**Fund a session. Pay your people.**

SeshPay is a sponsor-controlled USDC payout application built on [Arc](https://arc.io), Circle's blockchain where USDC is the native gas token. Sponsors deposit funds on-chain before a session starts, then approve exactly who gets paid and how much after it ends — nothing is released automatically. If the approval deadline passes without a settlement, the sponsor can recover their full deposit.

Built with [Arc Studio](https://studio.arc.io) &middot; **Unaudited mainnet pilot** on Arc Mainnet — real USDC

---

## Links

| | |
|---|---|
| **Live app** | [seshpay.vercel.app](https://seshpay.vercel.app/) |
| **Application** | [seshpay.vercel.app/app](https://seshpay.vercel.app/app) |
| **GitHub** | [github.com/Alike001/seshpay-arc](https://github.com/Alike001/seshpay-arc) |
| **Arc Studio project** | [studio.arc.io/app/d819f5b0-04cf-4a1b-a6fa-cb01b4270952](https://studio.arc.io/app/d819f5b0-04cf-4a1b-a6fa-cb01b4270952) |
| **Mainnet contract** | [explorer.arc.io/address/0xd02bc...1c4c](https://explorer.arc.io/address/0xd02bc329d5cfe93e841ea2c925520ef864621c4c) |
| **Testnet contract** | [explorer.testnet.arc.io/address/0x0fe8a...1713c](https://explorer.testnet.arc.io/address/0x0fe8a41346ab7aa30dc183384a85b5e36051713c) |

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

> **Unaudited mainnet pilot.** This contract has not been reviewed by an independent security firm. Real USDC may be lost. Do not deposit funds you cannot afford to lose.

### Arc Mainnet (active)

| Property | Value |
|---|---|
| **Contract name** | `SessionSplit` |
| **Network** | Arc Mainnet |
| **Chain ID** | `5042` |
| **Address** | [`0xd02bc329d5cfe93e841ea2c925520ef864621c4c`](https://explorer.arc.io/address/0xd02bc329d5cfe93e841ea2c925520ef864621c4c) |
| **Deploy tx** | [`0x78fcb1fa...36b`](https://explorer.arc.io/tx/0x78fcb1fadb4d888c3f979a3ecee9dc093d2346c615cc1429b226d9b18e3b136b) |
| **Deploy block** | `28,629,917` |
| **Runtime SHA-256** | `e2ba445a...6d` (matches hardened artifact) |
| **USDC (ERC-20)** | [`0x3600000000000000000000000000000000000000`](https://explorer.arc.io/address/0x3600000000000000000000000000000000000000) |
| **Solidity** | `0.8.28` (fixed, auto-detect off) |
| **License** | MIT |
| **Upgradeable** | No |
| **Admin / owner** | None |
| **Platform fee** | None |
| **Independent audit** | Not completed — unaudited pilot only |

### Arc Testnet (preserved)

| Property | Value |
|---|---|
| **Address** | [`0x0fe8a41346ab7aa30dc183384a85b5e36051713c`](https://explorer.testnet.arc.io/address/0x0fe8a41346ab7aa30dc183384a85b5e36051713c) |
| **Chain ID** | `5042002` |
| **Notes** | Original deployment, preserved for backwards compatibility |

---

## Verified Arc Mainnet transactions — Event #1 (October 30, 2026)

SeshPay's unaudited, owner-funded Arc Mainnet pilot completed a real-USDC create-and-settle flow through the public application. Receipts and `SessionCreated`, `ParticipantPaid`, and `SessionSettled` logs were checked using read-only Arc Mainnet RPC calls; the amounts below use the 6-decimal ERC-20 USDC representation.

| Step | Transaction | Block | Evidence |
|---|---|---:|---|
| Contract deployment | [`0x78fcb1fa...136b`](https://explorer.arc.io/tx/0x78fcb1fadb4d888c3f979a3ecee9dc093d2346c615cc1429b226d9b18e3b136b) | 28,629,917 | [Verified contract source](https://explorer.arc.io/address/0xd02bc329d5cfe93e841ea2c925520ef864621c4c?tab=contract) |
| Event #1 created and funded (0.020 USDC) | [`0xa7208b29...67f8`](https://explorer.arc.io/tx/0xa7208b293d0024e902fe8bdd6a7cf26f6cf4f1d5208bc6bd4a1ec12e36cb67f8) | 28,637,987 | Successful receipt and `SessionCreated` log |
| Event #1 settled | [`0xcd743489...718d`](https://explorer.arc.io/tx/0xcd74348927ddb49bfb35e220d9b65e57be2838a0a115f1ad5dd253ce2a89718d) | 28,638,706 | Successful receipt, `ParticipantPaid` and `SessionSettled` logs |

**Verified settlement breakdown:** 0.010 USDC to the host, 0.006 USDC to one contributor, and 0.004 USDC of unused reward budget returned to the sponsor. The sum equals the original **0.020 USDC deposit**. [View Event #1 in the live app](https://seshpay.vercel.app/app/events/1) (read-only; no wallet required).

**Security status:** Mainnet pilot is **unaudited**. Exact source-code verification on Arc Explorer and successful transactions do not constitute a professional security audit. The pilot is not an endorsement for unrestricted public deposits; see [SECURITY.md](SECURITY.md).

---

## Verified testnet transactions

Two complete Arc Testnet flows have been independently verified by raw `eth_getLogs` RPC scan and receipt decoding. All transactions use test USDC only.

### Event #1 — funded and settled

| Step | Transaction | Block | Explorer |
|---|---|---|---|
| Fund (create + deposit) | `0x929e...880b` | 69,014,824 | [View on ArcScan](https://explorer.testnet.arc.io/tx/0x929eba7096940d3ee07226e9a786bb334a7dfa3a047667588fb5eef5093e880b) |
| Settle (atomic payout) | `0xa56b...df59` | 69,019,044 | [View on ArcScan](https://explorer.testnet.arc.io/tx/0xa56bcc89a998850fb0a7693a804795d48ca50b71aeb177a1657c56f223a6df59) |

The settlement transaction emits `ParticipantPaid` for each recipient plus `SessionSettled` confirming the host payout, total contributor rewards, and any unused budget returned to the sponsor — all in one atomic on-chain transaction.

### Event #2 — funded and refunded

| Step | Transaction | Block | Explorer |
|---|---|---|---|
| Fund (create + deposit) | `0x04bb...7b6b` | 69,049,068 | [View on ArcScan](https://explorer.testnet.arc.io/tx/0x04bbb2445580c81f913b4aad186b116d019c3f396c883753770f7b9f8e077b6b) |
| Refund (full deposit returned) | `0xc94a...3f1b` | 69,053,518 | [View on ArcScan](https://explorer.testnet.arc.io/tx/0xc94ae51b104078ff547a7d8284692741887a0efb7eaf3ac8013bf97609c83f1b) |

Event #2 deposit: 400,000 USDC atomic units (0.40 USDC, 6 decimals). The `SessionRefunded` log confirms `amount = 400,000` — an exact match with the original deposit, with no deduction. Arc Testnet USDC emits two ERC-20 `Transfer` logs per transaction (native 18-decimal view and ERC-20 6-decimal view of the same asset); only the 6-decimal value of 0.40 USDC represents the actual amount transferred.

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
bun test                 # 193 JS/TS unit tests across 5 test files
bun run contracts:test   # 29 Foundry unit + hardening tests for SessionSplit.sol
```

---

## Testing and security

### Automated tests (verified 2026-10-30)

| Suite | File | Tests | Result |
|---|---|---|---|
| Solidity contract + hardening | `contracts/test/SessionSplit.t.sol` | 29 | Pass |
| USDC formatting | `src/utils/format.test.ts` | 45 | Pass |
| Event ID extraction | `src/utils/eventId.test.ts` | 13 | Pass |
| Session decode | `src/utils/sessionDecode.test.ts` | 66 | Pass |
| UX regression | `src/utils/uxCleanup.test.ts` | 22 | Pass |
| Contract guard | `src/utils/contractGuard.test.ts` | 47 | Pass |
| **Total** | | **222** | **Pass** |

The Foundry suite (29 tests, including 256-run fuzz) covers all contract failure modes: unauthorized access, duplicate recipients, reward budget overflow, deadline enforcement (both directions), reentrancy via state machine, partial-participant payouts, zero-address and contract-address inputs, mid-settlement atomicity, and repeated settlement and refund attempts. Coverage on `SessionSplit.sol` is 100% lines, statements, branches, and functions.

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

The production Vercel application currently targets **Arc Mainnet** (`VITE_NETWORK=mainnet`). For local/testnet builds, the default is Arc Testnet if `VITE_NETWORK` is unset. The verified mainnet contract address is recorded in `src/contracts/sessionSplit.ts`.

The mainnet build is an **unaudited pilot**. A risk banner is displayed on mainnet pages, and the Create Event funding form requires a risk acknowledgement before interaction. See [SECURITY.md](SECURITY.md).

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
- **Arc Mainnet production launch** — pending an independent professional security audit (current deployment is an unaudited pilot only)
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
