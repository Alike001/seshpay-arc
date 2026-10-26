# SeshPay — Arc Mainnet Release Audit
**Date:** 2026-10-26 (updated)  
**Status:** CONDITIONAL GO — safe code fixes applied; manual wallet test and third-party audit remain

---

## Automated checks (confirmed 2026-10-26)

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| Foundry (Solidity) | 16 | 16 | 0 |
| `sessionDecode.test.ts` | 66 | 66 | 0 |
| `eventId.test.ts` | 13 | 13 | 0 |
| `format.test.ts` | 45 | 45 | 0 |
| **Total** | **140** | **140** | **0** |
| Lint (oxlint) | — | 0 errors | — |
| TypeCheck (tsc) | — | 0 errors | — |
| Production build | — | Success | — |

Passing automated tests do not constitute an independent security audit.  
These tests were written by the same developer who wrote the contract and frontend.  
A professional third-party audit is required before any mainnet deployment involving real funds.

---

## Applied safe fixes (2026-10-26)

All four safe fixes from the original recommendation have been applied:

| Fix | Finding | Status |
|---|---|---|
| `VITE_NETWORK` env var + Arc Mainnet chain in wagmi + runtime contract address selection with build-time error guard | F-2 | **Applied** |
| All action components now import `ACTIVE_CHAIN_ID` from `config.ts` instead of hardcoding `5042002` | F-2 | **Applied** |
| Footer "Arc Testnet only" text is conditional on `IS_MAINNET` from `config.ts` | F-3 | **Applied** |
| Minimum deadline 5 minutes from now enforced in `CreateSession.tsx` | F-4 | **Applied** |
| `public/_redirects` added for Netlify SPA routing | F-5 | **Applied** |

Additionally applied during audit continuation (2026-10-26):

| Fix | Description | Status |
|---|---|---|
| `tracing.ts` browser-global guards | `window.addEventListener('message', ...)` at line 223, the `_parentOrigin` IIFE (uses `window.location` + `document.referrer`), the `emit()` function, `toAbsoluteUrl()` (uses `window.location.href`), and the entire EIP-1193 patch block (uses `Object.defineProperty(window, 'ethereum', ...)` and `window.addEventListener('eip6963:...')`) were all unguarded at module scope. Any file in the import graph that transitively reached `tracing.ts` caused `ReferenceError: window is not defined` in the bun test runner. All five locations are now guarded with `typeof window !== 'undefined'`. | **Applied** |

---

## TASK 1 — Contract Audit

### Compilation settings (verified from foundry.toml + SessionSplit.sol)

| Setting | Value |
|---|---|
| Solidity | 0.8.28 (fixed, `auto_detect_solc = false`) |
| EVM target | Cancun |
| Optimizer | Enabled, 200 runs |
| OpenZeppelin | 5.6.1 (`ReentrancyGuard`, `SafeERC20`, `IERC20`) |
| Constructor arg | `usdcAddress` — validated non-zero |

### Constructor argument for mainnet deployment

The constructor takes exactly one argument: `usdcAddress`. On both Arc Testnet and Arc Mainnet, the USDC ERC-20 address is `0x3600000000000000000000000000000000000000` (verified in `onchain-facts.ts`, a registry-generated file). This must be confirmed against the live Arc Mainnet USDC contract before any deployment.

**ASSUMPTION (not independently verified this session):** The Arc Mainnet USDC ERC-20 address is the same as Arc Testnet (`0x3600000000000000000000000000000000000000`). Confirm via `read_contract` against chainId 5042 before deploying.

### Access control

- `createSession`: any address may create (intentional — any sponsor).
- `settle`: `msg.sender != session.sponsor` → `Unauthorized()`. Correct.
- `refund`: `msg.sender != session.sponsor` → `Unauthorized()`. Correct.
- No admin, owner, or platform fee address. No upgradeability. No `selfdestruct`. No `delegatecall`.

**FINDING C-1 (INFO):** The `usdc` storage variable is `public` and `immutable`. No issue — it enables frontends to verify the token address the contract holds without trust.

### Reentrancy

Both `settle` and `refund` use:
1. `nonReentrant` modifier from OpenZeppelin 5.6.1.
2. CEI (Checks-Effects-Interactions): state set to `SETTLED`/`REFUNDED` before any token transfer.

Double protection. No reentrancy path exists.

### Accounting invariants

**createSession:**
```
totalDeposit = hostPayout + rewardBudget
safeTransferFrom(sponsor → contract, totalDeposit)
```
No overflow path at Solidity 0.8.x (checked arithmetic by default).

**settle:**
```
require(totalParticipantRewards <= rewardBudget)
safeTransfer(host, hostPayout)
for each participant: safeTransfer(participant, amounts[i])
refundedToSponsor = rewardBudget - totalParticipantRewards   // ≥ 0, never underflows
if refundedToSponsor > 0: safeTransfer(sponsor, refundedToSponsor)
```
Total out = `hostPayout + totalParticipantRewards + refundedToSponsor`
         = `hostPayout + totalParticipantRewards + (rewardBudget - totalParticipantRewards)`
         = `hostPayout + rewardBudget`
         = `totalDeposit` ✓  
Funds-in = funds-out. No leakage. No surplus.

**refund:**
```
totalRefund = hostPayout + rewardBudget  // == totalDeposit
safeTransfer(sponsor, totalRefund)
```
Full deposit returned. ✓

**FINDING C-2 (INFO):** The host can equal the sponsor address. The contract permits it; the sponsor pre-commits to paying the host (who is themselves). This is a valid use-case and not a vulnerability, but UX copy could clarify.

**FINDING C-3 (INFO):** `rewardBudget` may be zero. If zero, `settle` with empty participant arrays still sends `hostPayout` to the host and zero to contributors. `totalDeposit = hostPayout + 0 = hostPayout`. This is valid and tested (`testZeroParticipants`).

### Deadline logic

`createSession`: `deadline > block.timestamp` (strictly greater). Equal is rejected. ✓  
`settle`: `block.timestamp > deadline` → `DeadlinePassed()`. Correct direction.  
`refund`: `block.timestamp <= deadline` → `DeadlineNotPassed()`. Correct direction.

**FINDING C-4 (LOW):** `block.timestamp` is used for deadline enforcement. On Arc (a custom rollup), sequencer time drift is possible. The contract is consistent with itself, but a deadline set exactly `N` seconds in the future may expire `±N_drift` seconds earlier or later than the user's wall-clock expectation. This is acknowledged in `format.ts` (`isDeadlinePassed` comment: "up to ~12 seconds"). The advisory mitigates the UX impact but not the contract behavior. Mitigation: document in the user interface that the approval deadline is enforced by block time, not wall-clock time, and recommend setting deadlines at least 60 seconds in the future.

### Duplicate recipient check

O(n²) nested loop, n ≤ 5. Gas-safe. Correct. Tested.

### Overpayment prevention

`totalParticipantRewards > rewardBudget → RewardBudgetExceeded()`. Tested.

### Settlement limits

Max 5 contributors enforced. Array-length mismatch enforced. Both tested.

### `SafeERC20` behavior

`safeTransfer` and `safeTransferFrom` revert on non-zero return values or reverts from the token. Any USDC transfer failure (e.g. frozen account) reverts the entire settlement atomically — no partial payout possible.

**FINDING C-5 (MEDIUM — known limitation):** If Circle freezes the host or a contributor address at the USDC contract level (a Circle compliance action), `settle` will revert for all participants, not just the frozen one. Funds remain locked until: (a) the freeze is lifted, or (b) the deadline passes and the sponsor calls `refund`. The refund also reverts if the sponsor's address is frozen. This is an inherent consequence of using `SafeERC20` with a USDC token that has blacklisting capability. **This is not a new finding for any USDC-based contract.** Document it in the app's terms. It does not block mainnet release but must be disclosed.

### Transaction ordering

`settle` and `refund` both check `session.state != OPEN` first. A race between two `settle` calls on the same session: one succeeds (sets state to SETTLED), the second reverts on `InvalidState`. No double-payment possible due to state machine enforcement.

### `nextSessionId` and session key collision

`nextSessionId` starts at 1, increments by 1 per `createSession`. Session IDs are dense positive integers. No collision is possible. Sessions are never deleted. `sessions[0]` is the default-value struct (zero-address sponsor, etc.) — the frontend treats a zero-address sponsor as "not found," which is correct.

### Zero-amount participant entries

No per-participant zero-amount check. A participant can receive 0 USDC. This wastes a slot (max 5) and emits a `ParticipantPaid` event with `amount = 0`, but does not cause incorrect accounting. The frontend validates `amount > 0` before submission. Low severity.

### Summary: Contract blockers

**No mainnet blockers found in the contract itself.**  
All identified findings are INFO, LOW, or a known industry-wide USDC limitation (C-5). The contract logic is correct, reentrancy-protected, and fully accounted. The constructor argument (`usdcAddress`) must be independently confirmed before deployment.

---

## TASK 2 — Frontend Audit

### Wallet connection

ConnectKit 1.9.2, wagmi 2.19.5. `injected()` connector only — no WalletConnect, no Coinbase. Sufficient for a sponsored-payment app where the primary user (sponsor) uses MetaMask or similar injected wallet.

**FINDING F-1 (LOW):** Only `injected()` is configured. Mobile browser wallets that do not inject (e.g. Trust Wallet in-app browser) may not connect. Not a mainnet blocker but limits mobile reach.

### Chain enforcement

All four action components (`CreateSession`, `SettleSession`, `RefundSession`) check `chainId !== ARC_TESTNET_CHAIN_ID` and call `switchChain({ chainId: ARC_TESTNET_CHAIN_ID })` on the action button before any tx. **This is the critical mainnet blocker (F-2 below).**

**FINDING F-2 (CRITICAL — mainnet blocker):** Every action component hardcodes `const ARC_TESTNET_CHAIN_ID = 5042002`. The footer of `App.tsx` hardcodes the testnet explorer URL and testnet contract address. `SESSION_SPLIT_ADDRESS` in `sessionSplit.ts` is the testnet deployment address. The `config.ts` wagmi config includes only `arcTestnet` (5042002) and `mainnet` (1, for ENS). Arc Mainnet (chainId 5042) is absent from the wagmi config entirely.

**Before mainnet release, all five of these must change atomically, driven by a runtime environment variable:**
- wagmi config must add Arc Mainnet chain
- all `ARC_TESTNET_CHAIN_ID` constants must become the active chain's ID
- `SESSION_SPLIT_ADDRESS` must point to the mainnet deployment address
- footer links must point to the mainnet explorer
- the USDC address passed to ERC-20 reads must be the mainnet USDC

**The mainnet contract address is intentionally absent — it must not be set until an independently reviewed deployment has actually occurred.** See Task 3 for the configuration plan.

**FINDING F-3 (MEDIUM):** The footer of `App.tsx` contains the string "Arc Testnet only — no real funds." This text must change for the mainnet build and must not appear on the deployed production app.

### Transaction confirmation

`useWaitForTransactionReceipt` is used for all three transaction types. Pending, confirming, and success states are all handled with loading spinners and disabled buttons. Error states display user-readable messages from `parseOnchainError`. ✓

### Event ID extraction

`extractSessionId` decodes the `SessionCreated` log from the receipt using viem's `decodeEventLog`. Never guesses from `nextSessionId`. Falls back gracefully with a "Check My Events" message if log decode fails. ✓

### Balance and allowance reads

Live `balanceOf` and `allowance` reads with 10-second refetch interval. Insufficient balance disables the approve button. Existing allowance skips the approve step. Gas-reserve advisory fires when deposit would leave < 0.50 USDC. ✓

### Near-expired deadline protection

**FINDING F-4 (LOW):** `CreateSession` validates `deadlineTs > 0n` but does not enforce a minimum distance from the current time. A sponsor could set a deadline 1 second in the future. The contract check is `deadline > block.timestamp` (strictly greater), so a 1-second deadline would likely succeed on the approve tx but fail on the createSession tx (the ERC-20 approve goes first, then createSession in a second tx; between these two transactions, the deadline could pass). Mitigation: add a minimum deadline of, say, 5 minutes (`deadlineTs > BigInt(Math.floor(Date.now()/1000) + 300)`) to the frontend `isValid` check. **This is a safe fix that does not change contract behavior.**

### Direct event URLs (`/app/events/:id`)

`EventDetail.tsx` loads from contract using `useReadContract` with no wallet required. Works on refresh. Handles loading, error, not-found (zero-address sponsor), invalid ID (non-numeric). Error boundary wraps the route. ✓

### SPA routing

`vercel.json` contains `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`. SPA routing is configured. ✓

**FINDING F-5 (LOW):** A `netlify.toml` or `_redirects` file for Netlify is absent. The `vercel.json` rewrite only helps on Vercel. If deployed to Netlify without a `_redirects` file, direct navigation to `/app/events/1` will return a 404. Mitigation: add `public/_redirects` with `/* /index.html 200`. Safe fix.

### Settlement and refund state validation

Both `SettleSession` and `RefundSession` prefetch session state from the contract before enabling the action button. The button is disabled if: session not found, wrong sponsor, wrong state, deadline conditions not met. RPC error shows a Retry button. ✓ (fixed in previous turns)

### Loading indicators

All async states (session fetch, tx pending, tx confirming) show spinners with descriptive text. ✓

### Error handling

`parseOnchainError` maps all custom error selectors and common message strings to user-readable copy. Wallet rejection is caught and labeled "Transaction cancelled." ✓

### Incorrect-chain protection

Covered under F-2. All action tabs check chain and offer a "Switch to Arc Testnet" button before any tx. ✓ (will need updating for mainnet)

### "My Events" scan cap

The 50-session scan cap is explicitly disclosed in the UI with the exact session range scanned. ✓

---

## TASK 3 — Network Configuration Plan

### Objective

Introduce a runtime environment variable that controls whether the app targets Arc Testnet or Arc Mainnet. Neither network should ever point at the other's contract. The mainnet contract address field must be empty until a real deployment has occurred.

### Required environment variable

```
VITE_NETWORK=testnet   # or: mainnet
```

### Configuration changes required (safe, no financial logic change)

**`src/config.ts`** — add Arc Mainnet to wagmi:

```typescript
import { arcTestnet, arc } from 'viem/chains'
// arc = { id: 5042, name: 'Arc', rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } }, ... }
// Confirm arc is exported from viem/chains; if not, define it manually using onchain-facts.ts values.

const IS_MAINNET = import.meta.env.VITE_NETWORK === 'mainnet';
const activeChain = IS_MAINNET ? arc : arcTestnet;

export const config = createConfig({
  chains: [activeChain, mainnet],
  transports: {
    [activeChain.id]: http(),
    [mainnet.id]: http(),
  },
  connectors: [injected()],
});
export const ACTIVE_CHAIN_ID = activeChain.id;
```

**`src/contracts/sessionSplit.ts`** — two addresses, runtime selection:

```typescript
const TESTNET_ADDRESS = '0x0fe8a41346ab7aa30dc183384a85b5e36051713c' as const;
const MAINNET_ADDRESS = '' as const;  // ← INTENTIONALLY EMPTY until mainnet deploy

const IS_MAINNET = import.meta.env.VITE_NETWORK === 'mainnet';

if (IS_MAINNET && !MAINNET_ADDRESS) {
  throw new Error('Mainnet is selected but SESSION_SPLIT_MAINNET_ADDRESS is not set.');
}

export const SESSION_SPLIT_ADDRESS = (IS_MAINNET ? MAINNET_ADDRESS : TESTNET_ADDRESS) as `0x${string}`;
```

This makes the mainnet build fail loudly at startup if the mainnet address has not been populated — preventing accidental deployment of a broken mainnet frontend.

**All action components** — replace `const ARC_TESTNET_CHAIN_ID = 5042002` with an import of `ACTIVE_CHAIN_ID` from `config.ts`.

**`App.tsx` footer** — replace hardcoded testnet string and explorer URL with values derived from `getChain(ACTIVE_CHAIN_ID)` from `@/onchain-facts`.

### Chain IDs and USDC addresses (verified from onchain-facts.ts)

| Network | Chain ID | USDC ERC-20 | RPC | Explorer |
|---|---|---|---|---|
| Arc Testnet | 5042002 | `0x3600000000000000000000000000000000000000` | `https://rpc.testnet.arc.io` | `https://explorer.testnet.arc.io` |
| Arc Mainnet | 5042 | `0x3600000000000000000000000000000000000000` | `https://rpc.mainnet.arc.io` | `https://explorer.arc.io` |

The USDC ERC-20 address is the same on both networks per `onchain-facts.ts`. This is a generated file reflecting Arc Studio's registry. **Independently verify against Circle's published Arc Mainnet USDC address before deploying.**

### Safety invariants

1. `VITE_NETWORK=testnet` (or absent) → testnet address, testnet chain, testnet explorer. No mainnet action possible.
2. `VITE_NETWORK=mainnet` + empty `MAINNET_ADDRESS` → app throws at startup. No silent broken state.
3. `VITE_NETWORK=mainnet` + populated `MAINNET_ADDRESS` → mainnet config. No testnet RPC or contract called.
4. The mainnet and testnet builds are separate deployments with separate environment configurations. They must never share a contract address or explorer URL.

---

## TASK 4 — Deployment Runbook

This runbook is exact and reproducible using the project's existing tooling. It must be executed by the human deployer — not automated. No private keys are stored in this file.

### Prerequisites

- [ ] Arc Studio project with current source (`SessionSplit.sol`, `foundry.toml` as-is)
- [ ] Forge installed (already present in sandbox: `.foundry-version` file)
- [ ] A dedicated deployer wallet created for this purpose only (not reused from testnet)
- [ ] That wallet funded with a small amount of real USDC on Arc Mainnet (for gas + constructor tx)
- [ ] The deployer wallet's private key is available only in a secure environment variable, never pasted into any file
- [ ] Professional third-party audit of `SessionSplit.sol` completed and findings resolved

### Step 1 — Confirm chain ID

```bash
cast chain-id --rpc-url https://rpc.mainnet.arc.io
# Expected: 5042
```

If the output is not `5042`, stop. Do not proceed.

### Step 2 — Confirm USDC ERC-20 on mainnet

```bash
cast call 0x3600000000000000000000000000000000000000 "symbol()(string)" \
  --rpc-url https://rpc.mainnet.arc.io
# Expected: "USDC"

cast call 0x3600000000000000000000000000000000000000 "decimals()(uint8)" \
  --rpc-url https://rpc.mainnet.arc.io
# Expected: 6
```

If either check fails, stop. Do not pass the wrong USDC address to the constructor.

### Step 3 — Build the contract

```bash
cd /home/user/app && forge build
# Confirm: [PASS] Compiler run successful with no warnings
```

Verify the artifact matches the source:
```bash
sha256sum contracts/out/SessionSplit.sol/SessionSplit.json
```
Record the hash. This is the bytecode you will deploy.

### Step 4 — Estimate gas

```bash
forge create contracts/SessionSplit.sol:SessionSplit \
  --rpc-url https://rpc.mainnet.arc.io \
  --constructor-args 0x3600000000000000000000000000000000000000 \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --gas-estimate-multiplier 130 \
  --dry-run
```

Review the estimated gas cost. Confirm the deployer wallet has sufficient USDC.

### Step 5 — Deploy

```bash
forge create contracts/SessionSplit.sol:SessionSplit \
  --rpc-url https://rpc.mainnet.arc.io \
  --constructor-args 0x3600000000000000000000000000000000000000 \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify
# --verify submits source to the Arc explorer for contract verification
```

Record:
- `Deployed to:` — the mainnet contract address
- `Transaction hash:` — the deploy tx hash

**Do not proceed to Step 6 until you have independently confirmed the deploy tx on the Arc Mainnet explorer.**

### Step 6 — Verify deployment

```bash
cast call <DEPLOYED_ADDRESS> "usdc()(address)" --rpc-url https://rpc.mainnet.arc.io
# Expected: 0x3600000000000000000000000000000000000000

cast call <DEPLOYED_ADDRESS> "nextSessionId()(uint256)" --rpc-url https://rpc.mainnet.arc.io
# Expected: 1  (no sessions created yet)
```

### Step 7 — Record the mainnet address

Update `AGENTS.md` with the mainnet contract address and deploy tx hash.

Populate `MAINNET_ADDRESS` in `src/contracts/sessionSplit.ts`:
```typescript
const MAINNET_ADDRESS = '<DEPLOYED_ADDRESS>' as const;
```

### Step 8 — Minimal end-to-end verification (controlled test)

Using a second wallet (not the deployer), perform ONE minimal test session on mainnet:
1. Create a session: host payout = 1 USDC, reward budget = 0, deadline = 1 hour from now.
2. Confirm the `SessionCreated` event log on the Arc Mainnet explorer.
3. Settle immediately with 0 contributors.
4. Confirm the host received exactly 1 USDC on-chain.
5. Record the settle tx hash.

This test uses real USDC. Keep the amounts minimal. Do not use any user funds.

### Step 9 — Source verification

Confirm the contract is verified on `https://explorer.arc.io`. If `forge create --verify` did not complete, submit manually:
```bash
forge verify-contract <DEPLOYED_ADDRESS> contracts/SessionSplit.sol:SessionSplit \
  --rpc-url https://rpc.mainnet.arc.io \
  --constructor-args $(cast abi-encode "constructor(address)" 0x3600000000000000000000000000000000000000)
```

---

## TASK 5 — Public Release Readiness

### Production build

`bun run dev` (Vite) and `bunx vite build` both succeed (confirmed in previous turns). Chunk size warnings for wagmi/viem are expected and not errors.

### SPA routing

`vercel.json` present with `/* → /index.html` rewrite. ✓  
**FINDING F-5 (LOW):** Netlify `_redirects` file absent. See Task 2.

### Environment configuration

No secrets in source. `VITE_NETWORK` is the only new env var needed (public, browser-visible). Contract addresses are public. USDC address is public. No API keys or private keys in any source file. ✓

### Real explorer URLs (mainnet)

After mainnet deploy, the footer explorer link must use `https://explorer.arc.io` (not testnet). This is handled by the network configuration plan (Task 3) — `buildTxExplorerUrl(ACTIVE_CHAIN_ID, hash)` will resolve to the correct explorer once `ACTIVE_CHAIN_ID` is the mainnet chain ID.

### Accessibility

- All interactive elements have `aria-label` or visible label text. ✓
- Tab navigation uses `role="tablist"` and `role="tab"` with `aria-selected`. ✓
- Error and success states use `aria-live="polite"` and `role="alert"`. ✓
- Focus-visible styles are applied to buttons. ✓

**FINDING F-6 (INFO):** `datetime-local` inputs do not have an explicit `min` attribute. Browsers vary in whether they visually indicate past dates as unavailable. The frontend validates the deadline before enabling the button, but a `min` attribute would improve UX.

### Mobile layout

`max-w-xl mx-auto px-4` — single-column layout. Tab labels show short version on small screens (`sm:hidden`/`sm:inline`). The contributor row grid is single-column. Should render correctly on 375px+ screens. No horizontal overflow identified.

### Arc Studio project URL preservation

The Arc Studio project URL is embedded in the `Built with Arc Studio` footer of `README.md`. Per the task requirement, this must be preserved in all public deployments. Do not remove the `README.md` attribution or the landing page footer link.

---

## TASK 6 — Evidence and Submission Checklist

Items marked ✓ are ready. Items marked ☐ require action before submission.

### Arc Studio
- ✓ Arc Studio project open and building
- ✓ Arc Studio project URL: preserved in project (visible in Arc Studio UI)

### Repository
- ☐ Push to GitHub (not yet done — use the Integrations menu in Arc Studio to connect and push)
- ☐ Repository URL: _to be recorded after push_

### Public app URL
- ☐ Deploy to Vercel, Netlify, or Hugging Face (not yet deployed)
- ☐ App URL: _to be recorded after deploy_
- ☐ Confirm `/app/events/1` loads without a wallet on the deployed URL

### Mainnet contract
- ☐ Independent security audit completed
- ☐ `SessionSplit.sol` deployed to Arc Mainnet (chainId 5042)
- ☐ Mainnet contract address: _to be recorded after deploy_
- ☐ Contract verified on `https://explorer.arc.io`

### Mainnet transactions
- ☐ Successful `createSession` tx on Arc Mainnet with real USDC
- ☐ Successful `settle` tx on Arc Mainnet
- ☐ Both tx hashes recorded with explorer links

### Demo
- ☐ Demo video showing: create event → approve contributors → settlement receipt
- ☐ Video shows event ID confirmed from receipt log (not guessed)
- ☐ Video shows ArcScan explorer link for the settle transaction

### Description
```
SeshPay is a sponsor-controlled USDC payout application built on Arc, 
Circle's blockchain where USDC is the native gas token. Sponsors fund 
sessions upfront, set a host payout and contributor reward budget, and 
approve exact payments to up to five recipients — all in a single 
on-chain transaction. The smart contract enforces sponsor-only access 
control, a strict one-time settlement state machine, deadline-based 
refunds, and CEI+reentrancy protection with no admin, no platform fee, 
and no upgradeability. Built with Arc Studio.
```

### Builder profile
- ☐ Add team/individual name and contact to the submission form

---

## GO / NO-GO Recommendation

### Current status: CONDITIONAL GO (testnet) / NO-GO (mainnet)

**The testnet application is ready for demonstration.** All 140 automated tests pass, lint and typecheck are clean, the build succeeds, and four end-to-end flows (create, settle, refund, event detail) have been manually verified on Arc Testnet.

**Mainnet is not ready.** The following are required before any mainnet deployment:

| # | Item | Severity | Type |
|---|---|---|---|
| 1 | Professional third-party security audit of `SessionSplit.sol` | **CRITICAL** | External |
| 2 | Network configuration changes (F-2): wagmi config, chain ID constants, contract address selection, footer links | **CRITICAL** | Safe code change |
| 3 | Mainnet deployment using the runbook in Task 4 | **CRITICAL** | Deployment |
| 4 | Mainnet end-to-end verification test (1 USDC settle) | **CRITICAL** | Manual |
| 5 | Independent confirmation that Arc Mainnet USDC = `0x3600…0000` | **HIGH** | Verification |
| 6 | GitHub push and public deployment | **HIGH** | Release |
| 7 | Minimum deadline validation in CreateSession (F-4): add `deadlineTs > now + 300` | **LOW** | Safe code change |
| 8 | Netlify `_redirects` file (F-5) | **LOW** | Safe code change |
| 9 | USDC blacklisting disclosure in app terms (C-5) | **LOW** | Documentation |

### Safe fixes applied (no financial behavior changed)

All four originally identified safe fixes were applied in the previous session:

1. **Network config (F-2) — APPLIED:** `VITE_NETWORK` env var, Arc Mainnet chain definition in `config.ts`, `ACTIVE_CHAIN_ID` export, runtime contract address selection in `sessionSplit.ts` with build-time error guard if mainnet address is empty.
2. **Minimum deadline (F-4) — APPLIED:** `CreateSession.tsx` now prevents setting a deadline less than 5 minutes from the time the user enters it.
3. **Netlify redirects (F-5) — APPLIED:** `public/_redirects` file added containing `/* /index.html 200`.
4. **Footer text (F-3) — APPLIED:** "Arc Testnet only" text in `App.tsx` footer is now conditional on `!IS_MAINNET`.

Additional fix applied during audit continuation:

5. **`tracing.ts` browser-global guards — APPLIED:** Five locations guarded with `typeof window !== 'undefined'`. The `eventId.test.ts` suite now passes cleanly (13/13) with no `ReferenceError: window is not defined` errors.

None of these touch `SessionSplit.sol`, its ABI, or any transaction-signing logic.
