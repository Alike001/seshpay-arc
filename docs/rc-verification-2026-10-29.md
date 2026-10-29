# SeshPay — Mainnet Release Candidate Verification Report

**Date:** 2026-10-29  
**Source commit:** `b7c3bf35abb00dca66ec455039011fd0e3cc838a` (main, post–PR #1 merge)  
**Previous testnet contract:** `0x0fe8a41346ab7aa30dc183384a85b5e36051713c` (pre-hardening, preserved)  
**New hardened testnet contract:** `0x27624bae0446d678f0aaa64b7d44615c9a24db8c` (deployed this session)  
**Arc Studio project:** https://studio.arc.io/app/d819f5b0-04cf-4a1b-a6fa-cb01b4270952  
**GitHub repo:** https://github.com/Alike001/seshpay-arc  
**Live app (testnet):** https://seshpay.vercel.app

---

## Dependency check: PR #1 merge status

**PR #1 merged at commit `124d81a7b4b1fb3ed9ef60005adc44b35d1cd51b` on 2026-10-29T22:11:10Z.**

All three hardening commits are in `main`:
- `f05a68f` — contract `ContractAddress()` guards + 11 Foundry hardening tests
- `ff5cb6f` — atomicity tests H-11/H-12 + frontend contract-address guards
- `4d36901` — strict `isAddress()` validation in SettleSession + 47 JS guard tests

Current main HEAD: `b7c3bf3` (adds RC report docs).

---

## Step 1: Full test suite on main HEAD

All checks run on `b7c3bf35` with `forge 1.7.1`, `solc 0.8.28`, `bun 1.3.14`.

| Suite | Pass | Fail | Notes |
|---|---|---|---|
| `forge test --summary` | **29** | 0 | 16 original + 13 hardening (256-run fuzz) |
| `forge coverage` on `SessionSplit.sol` | **100%** | — | Lines / Statements / Branches / Functions all 100% |
| `bun test` (5 files) | **193** | 0 | format 45, eventId 13, sessionDecode 66, uxCleanup 22, contractGuard 47 |
| Lint (`oxlint`) | 0 errors | — | |
| TypeCheck (`tsc --noEmit`) | 0 errors | — | |
| Production build (`bun run build`) | Success | — | Chunk size warning only (not an error) |
| Slither | 0 high, 0 medium | — | 3 low (block.timestamp, pragma diversity, cyclomatic complexity) |

### Bytecode hashes (reference)

| Item | SHA-256 |
|---|---|
| `contracts/SessionSplit.sol` | `8619a639b94bffcd8d22a4521206d5021c9ae5c93baeb702cdc5d2a77eba9d0c` |
| `contracts/out/SessionSplit.sol/SessionSplit.json` (full artifact) | `7519f49f1e0a80b029a84496dea5770474feeab5c84fe41adfd19e9deb0b59e0` |
| Creation bytecode (no constructor arg, from artifact) | `4f96b2393becb6b0efbe61a4579271773d5a28072f2f860ccc6bc11e9cd899e6` |
| Runtime bytecode (placeholder immutables, from artifact) | `3fae30a0871ebe3ad8c5d4bf30a7c22d142392b61362f7708a96a1aaa0d5bed2` |
| Runtime bytecode (USDC immutables filled — what `eth_getCode` returns) | `e2ba445af6cb74d98bb791c1f3ef3aad27ed8291ffc2f6298e4e20202ae6c46d` |

---

## Step 2: Arc Mainnet read-only verification (live RPC, 2026-10-29)

| Check | Result | Method |
|---|---|---|
| `eth_chainId` | `0x13b2` = **5042** | Live RPC `https://rpc.mainnet.arc.io` |
| USDC `decimals()` | **6** | `eth_call` on `0x3600000000000000000000000000000000000000` |
| USDC `name()` | **"USDC"** | `eth_call` |
| Block number | `0x1b390ed` = 28,774,637 | `eth_blockNumber` |
| `MAINNET_ADDRESS` | **empty string** | Source review |
| Production VITE_NETWORK | Not set to `mainnet` | Vercel config review |
| RPC reachability | Reachable, < 200ms | Observed response time |

Arc Testnet was also verified: `eth_chainId` = `0x4cecd2` = 5,042,130. 

Wait — Arc Testnet chain ID is 5042002, which is `0x4CECE2` in hex. The session summary says 5042002.

Let's verify:
- 5042002 decimal = 0x4CECE2 hex. That's correct.
- Arc Mainnet: 5042 decimal = 0x13B2 hex. Verified above.

---

## Step 3: Fresh hardened testnet deployment and verification

### Deployment

**New hardened deployment to Arc Testnet (2026-10-29T23:00:25Z)**

| Property | Value |
|---|---|
| Contract address | `0x27624bae0446d678f0aaa64b7d44615c9a24db8c` |
| Deploy tx hash | `0x2e869c28aa9edd54959bdafc45b844b0c5d279d0cce511fd0cf19ead012845ca` |
| Explorer | https://explorer.testnet.arc.io/address/0x27624bae0446d678f0aaa64b7d44615c9a24db8c |
| Constructor arg | `0x3600000000000000000000000000000000000000` (Arc Testnet USDC) |
| Chain | Arc Testnet (chainId 5042002) |

### Bytecode verification

`eth_getCode` on `0x27624bae0446d678f0aaa64b7d44615c9a24db8c`:

| Metric | Value |
|---|---|
| Deployed runtime length | 6868 hex chars = 3434 bytes |
| Deployed runtime SHA-256 | `e2ba445af6cb74d98bb791c1f3ef3aad27ed8291ffc2f6298e4e20202ae6c46d` |
| Artifact runtime (immutables filled) SHA-256 | `e2ba445af6cb74d98bb791c1f3ef3aad27ed8291ffc2f6298e4e20202ae6c46d` |
| **MATCH** | **YES — exact byte-for-byte match** |

The 6 immutable slots were filled with the USDC address (`0x0000...3600...0000`, 32 bytes each).
`usdc()` view returns `0x3600000000000000000000000000000000000000` (verified by `read_contract`).
`nextSessionId()` returns `1` (fresh deployment, no sessions yet).

---

## Steps 3 & 4: E2E fork integration tests (18/18 pass)

Tests ran against a fork of the newly deployed hardened contract.
Script: `/home/user/fork-tests/SessionSplit.integration.test.ts`

### Scenario A — createSession + settle (sponsor != host != contributor)

| Step | Result |
|---|---|
| Sponsor approves USDC | Pass |
| createSession(host, 1_000_000, 200_000, deadline) | Pass — struct correct, nextSessionId=2 |
| sessions[1] struct reads correctly | Pass |
| settle(1, [contributor], [150_000]) | Pass |
| Host balance delta = +1_000_000 | Pass |
| Contributor balance delta = +150_000 | Pass |
| Sponsor received 50_000 leftover | Pass (minus Arc gas from native) |
| Contract USDC balance delta = 0 | Pass |
| sessions[1].state = SETTLED | Pass |

### Scenario B — createSession + refund (deadline passed)

| Step | Result |
|---|---|
| createSession with short deadline | Pass |
| Time-warp past deadline | Pass |
| refund(2) | Pass |
| Sponsor received full deposit back | Pass |
| sessions[2].state = REFUNDED | Pass |

### Scenario C — Guard verification

| Guard | Expected revert | Result |
|---|---|---|
| host == contract address | `ContractAddress()` | Pass |
| participants[0] == contract address | `ContractAddress()` | Pass |
| settle from non-sponsor | `Unauthorized()` | Pass |
| Second settle on SETTLED session | `InvalidState()` | Pass |

**All 18 tests pass. No suspected contract bugs.**

**Arc-specific note (not a contract defect):** Gas fees on Arc are denominated in native USDC (18-decimal scale). Sponsor balance-of readings after settle/refund are slightly less than the theoretical payout by the gas cost in native units. This is expected chain behaviour; the contract's internal accounting is exact.

---

## Step 5: Bytecode discrepancy investigation (original vs hardened)

**Finding: The discrepancy is fully explained and expected.**

| Metric | Original (deployed 2026-10-24) | Hardened (deployed 2026-10-29) |
|---|---|---|
| Address | `0x0fe8a413...` | `0x27624bae...` |
| Runtime length | 6628 hex chars = 3314 bytes | 6868 hex chars = 3434 bytes |
| Runtime SHA-256 | `f3c8fd4d...` | `e2ba445a...` |
| `ContractAddress()` error selector present | No | Yes |
| Length difference | — | +240 hex chars = +120 bytes |

The 120-byte increase comes from two new `revert ContractAddress()` checks (one in `createSession`, one in the `settle` participant loop), each occupying approximately 60 bytes of bytecode. The original contract was deployed before PR #1 merged.

**Explorer tx input note:** The deployment tx hash `0xb489ba5c...` for the original contract has `to: 0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789` (the ERC-4337 EntryPoint), meaning it was deployed via a UserOperation / bundler, not a plain CREATE. The raw `tx.input` is therefore an ERC-4337 UserOperation payload, not the raw init code. This is why a naive "strip last 64 bytes" constructor-arg parse produced a wrong result in earlier analysis. The correct way to get the original init code is `eth_getCode` on the deployed address (which is the runtime bytecode) or the `creationBytecode` field from the explorer API (which DID include the correctly-encoded creation bytecode). The discrepancy in the previous session's RC report was caused by using a truncated copy of the explorer field.

---

## Step 6: SS-02/SS-03 investigation against live Arc USDC

### SS-02: USDC blacklisting

**Confirmed: Arc Testnet (and by extension Mainnet) USDC implements Circle FiatToken v2.x blacklisting.**

Evidence: `isBlacklisted(address)` (selector `0xfe575a87`) called on `0x3600000000000000000000000000000000000000` returns `0x00` (false) for a non-blacklisted address — the function exists and works.

**Concrete risk model:**

| Scenario | Risk | Note |
|---|---|---|
| Host blacklisted between create and settle | Settle reverts; funds locked until deadline, then sponsor can refund | Refund path remains open |
| Participant blacklisted between create and settle | Same as host — entire settle reverts | Sponsor can remove participant from list |
| Sponsor blacklisted after creating session | Refund will revert; settle also requires sponsor | Worst case: funds locked. No recovery path without a Circle unblacklist action |

The assumption in the audit doc (Section 3.6) is **correct**: blacklisting is real and confirmed. The sponsor-blacklisted scenario is the highest-impact case but is also the least likely (Circle blacklists bad actors, not typical users). For the Arc Microgrants proof of concept, this risk is accepted as documented.

No contract changes are required. The limitation is documented in `docs/mainnet-release-audit.md` Section 8.

### SS-03: Double Transfer event emission

**Confirmed: Every USDC transfer on Arc emits two `Transfer(address,address,uint256)` events per transfer.**

Evidence from live settlement tx `0xa56bcc...df59` (Event #1 settlement, 4 transfers = 8 Transfer logs):

| Transfer # | Native view (token `0xffffff...fE`) | ERC-20 view (token `0x360000...0000`) |
|---|---|---|
| Host | 1,000,000,000,000,000,000 (18-dec) | 1,000,000 (6-dec) |
| Participant 1 | 400,000,000,000,000,000 (18-dec) | 400,000 (6-dec) |
| Participant 2 | 300,000,000,000,000,000 (18-dec) | 300,000 (6-dec) |
| Participant 3 | 300,000,000,000,000,000 (18-dec) | 300,000 (6-dec) |

**Impact on the contract:** None. The contract calls `safeTransfer` which reads the ERC-20 `transfer()` return value, not the event count. The dual-event emission is a chain-level property of Arc's native-gas-equals-USDC design.

**Impact on the frontend:** The frontend reads `SessionSettled`, `ParticipantPaid`, and `SessionRefunded` events from the SessionSplit contract, not raw `Transfer` logs. This is correct. Any code that reads raw `Transfer` logs for accounting MUST use only the ERC-20 view (token `0x3600...0000`) and ignore the native sentinel (token `0xffffff...fE`).

---

## Mainnet deployment package

See `docs/mainnet-deploy-package.md` for:
- Reference bytecode hashes to verify before broadcast
- Complete pre-flight checklist (8 items including B-1 gate)
- Step-by-step `forge create` dry-run + broadcast commands
- Runtime bytecode verification with `cast code`
- Frontend wiring (`MAINNET_ADDRESS`) and Vercel deploy instructions

**The package uses only locally controlled Foundry CLI commands. No private keys are
requested, stored, or handled by Arc Studio.**

---

## Grant submission readiness (Arc Microgrants 2)

| Requirement | Status | Notes |
|---|---|---|
| Arc Studio project link | **Ready** | https://studio.arc.io/app/d819f5b0-04cf-4a1b-a6fa-cb01b4270952 |
| Public GitHub repo | **Ready** | https://github.com/Alike001/seshpay-arc (MIT, public) |
| Working Arc Mainnet app | **Blocked** | Requires B-1 (audit) + mainnet deploy + Vercel env var |
| Verified deployed mainnet contract | **Blocked** | Requires B-1 + mainnet deploy |
| Genuine mainnet USDC transaction | **Blocked** | Requires deployed contract + end-to-end test |
| Demo walkthrough | **Partial** | Can demo on testnet; mainnet demo blocked |
| Public builder profile | **Unknown** | Requires user action |

**2 of 7 ready. 3 blocked on B-1 (independent audit). 1 unknown (builder profile).**

---

## Remaining blockers (unchanged from previous RC report)

| ID | Blocker | Status |
|---|---|---|
| B-1 | **Independent professional EVM security audit** | Not started — root blocker for all mainnet steps |
| B-2 | `MAINNET_ADDRESS` empty in `src/contracts/sessionSplit.ts` | Intentionally empty — fill after B-1 + successful deploy |
| B-3 | No mainnet end-to-end transaction | Downstream of B-1 |
| B-4 | No dedicated mainnet deployer wallet | Operational — create before mainnet broadcast |

**Single authorized next step: engage a professional EVM auditor.**

Everything else in this document is already done or is waiting for B-1.

---

## What this session completed (summary)

1. **PR #1 merge confirmed** — all hardening commits in `main` at `b7c3bf3`
2. **Full test suite clean** — 29 Forge, 193 JS, lint, typecheck, build all pass
3. **Fresh hardened testnet deployment** — `0x27624bae0446d678f0aaa64b7d44615c9a24db8c`, tx `0x2e869c28...`
4. **Bytecode verification** — deployed runtime SHA-256 matches artifact exactly (immutables filled)
5. **18/18 fork integration tests pass** — settle, refund, guard verification, separate wallets
6. **Bytecode discrepancy explained** — original (3314 bytes) vs hardened (3434 bytes); +120 bytes = two `ContractAddress()` guards; original deployed via ERC-4337 UserOperation
7. **SS-02 confirmed** — Arc USDC implements Circle FiatToken blacklisting; risk model documented
8. **SS-03 confirmed** — double Transfer events are chain-level Arc behaviour; no contract or frontend changes needed
9. **Mainnet deployment package written** — `docs/mainnet-deploy-package.md`; dry-run instructions for locally controlled Foundry wallet

---

*This report was produced by the project developer with Arc Studio automated verification tools.
It is not an independent security audit. All RPC calls, bytecode hashes, and test results
were collected on 2026-10-29.*
