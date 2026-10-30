# SeshPay Arc Mainnet Readiness Audit

**Version:** 2 (updated 2026-10-28)  
**Contract reviewed:** `SessionSplit.sol` (current source in this repository)  
**Deployed testnet address:** `0x0fe8a41346ab7aa30dc183384a85b5e36051713c` (Arc Testnet, chain ID 5042002)  
**Mainnet address:** not yet deployed  
**Verdict:** **NO-GO** — four prerequisites must be resolved before any mainnet deployment

---

## Status update — October 30, 2026 (after the historical predeployment assessment)

**An unaudited, owner-funded Arc Mainnet pilot was deployed**, despite the original October 28 **NO-GO** recommendation. The original assessment below is retained as a historical record, not rewritten as if independent audit blocker B-1 had been cleared.

- Arc Mainnet contract: [`0xd02bc329d5cfe93e841ea2c925520ef864621c4c`](https://explorer.arc.io/address/0xd02bc329d5cfe93e841ea2c925520ef864621c4c?tab=contract), deployed in block **28,629,917** ([transaction](https://explorer.arc.io/tx/0x78fcb1fadb4d888c3f979a3ecee9dc093d2346c615cc1429b226d9b18e3b136b)); Solidity source published with an **exact compiler-bytecode match** on Arc Explorer.
- Runtime SHA-256 was independently checked against the hardened release artifact: `e2ba445af6cb74d98bb791c1f3ef3aad27ed8291ffc2f6298e4e20202ae6c46d`.
- Event #1 creation and 0.020 USDC funding: block **28,637,987**, [transaction](https://explorer.arc.io/tx/0xa7208b293d0024e902fe8bdd6a7cf26f6cf4f1d5208bc6bd4a1ec12e36cb67f8).
- Event #1 settlement: block **28,638,706**, [transaction](https://explorer.arc.io/tx/0xcd74348927ddb49bfb35e220d9b65e57be2838a0a115f1ad5dd253ce2a89718d). Onchain logs record 0.010 USDC host payout, 0.006 USDC contributor payout, and 0.004 USDC returned to sponsor.
- B-2 (deployed address), B-3 (controlled mainnet end-to-end flow), and B-4 (dedicated deployer) have subsequently been addressed. **B-1 remains outstanding:** no independent professional security audit has been performed.
- The current limited-pilot policy is in [`SECURITY.md`](../SECURITY.md). It does **not** mean the contract is production-audited or free of fund-lock risks.

---

## 1. Scope

This audit covers:

1. `contracts/SessionSplit.sol` — full source and compiled artifact review
2. `contracts/test/SessionSplit.t.sol` — 16 Foundry tests
3. `src/contracts/sessionSplit.ts` — address selection and ABI wiring
4. `src/config.ts` — chain and network configuration
5. Arc Mainnet RPC and USDC ERC-20 address verification (live RPC calls, 2026-10-28)
6. Frontend configuration for mainnet readiness
7. Deployment scripts and runbook

This audit was written by the same developer who wrote the contract. **It is not a substitute for an independent professional security review.** The automated tests described here were authored by the same party who wrote the production code — they confirm expected behaviour and regression coverage, not adversarial correctness.

---

## 2. Chain and USDC verification (live RPC, 2026-10-28)

Both values were verified against the live Arc Mainnet RPC endpoint this session. No memory or assumption was used.

| Property | Value | Source |
|---|---|---|
| Arc Mainnet RPC | `https://rpc.mainnet.arc.io` | Arc docs |
| `eth_chainId` response | `0x13b2` = **5042** | Live RPC call |
| USDC ERC-20 address | `0x3600000000000000000000000000000000000000` | Arc docs |
| `decimals()` on USDC | **6** (returned `0x…06`) | Live `eth_call` |
| Native USDC decimals | **18** (same asset, different decimal scale for gas accounting) | Arc protocol docs |

The contract uses `IERC20.safeTransfer` with 6-decimal amounts throughout. This is correct for ERC-20 USDC on Arc. No native-token path exists in the contract — it handles no `msg.value` and makes no ETH transfers.

**Important:** Arc Testnet USDC emits two `Transfer` events per ERC-20 transfer (one native 18-decimal view, one ERC-20 6-decimal view). This is a chain-level property, not a contract bug. When reading receipts or logs for accounting, use only the 6-decimal `amount` field from the `SessionRefunded` or `SessionSettled` event, not the raw `Transfer` log data.

---

## 3. Contract review: `SessionSplit.sol`

### 3.1 Accounting invariants

**Verified by source inspection and Foundry tests.**

The contract maintains a strict deposit-equals-withdrawal invariant:

```
totalDeposit = hostPayout + rewardBudget                    (createSession line 89)
settle pays: hostPayout + sum(amounts[i]) + refundedToSponsor
           = hostPayout + totalParticipantRewards + (rewardBudget - totalParticipantRewards)
           = hostPayout + rewardBudget
           = totalDeposit                                   (settle lines 123–133)
refund pays: hostPayout + rewardBudget = totalDeposit       (refund line 153)
```

No edge case allows partial withdrawal or double-withdrawal. Overflow is impossible under Solidity 0.8.28 checked arithmetic.

### 3.2 Authorization

```solidity
if (msg.sender != session.sponsor) revert Unauthorized();   // settle line 102, refund line 147
```

Only `session.sponsor` (the wallet that called `createSession`) can settle or refund. Checked before any state read or write. No admin bypass, no delegated authority.

**Trust assumption (documented):** The sponsor can call `refund` after the deadline regardless of whether the session actually took place. The host and contributors have no recourse inside the contract if the sponsor does not settle before the deadline. This is a known design choice documented in the README — it places full trust in the sponsor's integrity. V2 adds evidence and dispute mechanisms.

### 3.3 State machine

```
OPEN ──settle──> SETTLED   (only before deadline)
OPEN ──refund──> REFUNDED  (only after deadline)
SETTLED, REFUNDED: terminal — any further settle/refund reverts with InvalidState()
```

- `settle` requires `state == OPEN && block.timestamp <= deadline`
- `refund` requires `state == OPEN && block.timestamp > deadline`
- Both checks occur before state mutation (CEI pattern, line 121 and 151)

**Edge case — exact deadline boundary:** `settle` uses `block.timestamp > session.deadline` to revert (line 104: `if (block.timestamp > session.deadline) revert DeadlinePassed()`). `refund` uses `block.timestamp <= session.deadline` to revert (line 149). At `block.timestamp == session.deadline` exactly: settle succeeds, refund reverts. This is a documented, unambiguous boundary with no exploitable window.

**Edge case — zero rewardBudget:** `createSession` does not revert on `rewardBudget == 0`. This is valid — a sponsor can create a host-only event with no contributor budget. Settlement with zero `rewardBudget` and empty participant arrays succeeds correctly; `refundedToSponsor` will be zero and the `if (refundedToSponsor > 0)` guard prevents a zero-value transfer.

### 3.4 Reentrancy

- `nonReentrant` modifier on both `settle` (line 99) and `refund` (line 144)
- State mutation (`session.state = SessionState.SETTLED/REFUNDED`) occurs before all token transfers (CEI: lines 121 and 151 precede transfer calls)
- Double protection: `nonReentrant` would catch a reentrant call even if CEI ordering were accidentally broken in a future edit

### 3.5 Participant validation

```solidity
if (participants[i] == address(0)) revert ZeroAddress();               // line 109
if (participants[i] == participants[j]) revert DuplicateRecipient();   // line 111
if (totalParticipantRewards > session.rewardBudget) revert RewardBudgetExceeded(); // line 119
if (participants.length > 5) revert TooManyParticipants();             // line 106
if (participants.length != amounts.length) revert LengthMismatch();    // line 105
```

All five participant-array guards are present and checked before state mutation.

**Note on zero amounts:** `amounts[i] == 0` is not rejected. A zero-value `safeTransfer` will succeed (ERC-20 permits zero transfers). This allows a sponsor to include a participant in the event record with a zero payout — unusual but not a vulnerability. The budget check still holds; it simply doesn't constrain a zero-amount entry.

### 3.6 SafeERC20 and transfer failure

All transfers use `usdc.safeTransfer` / `usdc.safeTransferFrom` (OpenZeppelin 5.6.1). A failed transfer — including USDC blacklisting of any recipient — reverts the entire transaction. This means:

- **Settlement:** if Circle blacklists any participant or the host between event creation and settlement, the settlement transaction will revert until the blacklist is lifted or the deadline passes.
- **Refund:** if Circle blacklists the sponsor, the refund will revert. Funds would remain locked in the contract with no recovery path.

The USDC blacklisting scenario is a known limitation documented in the README. It is not a contract defect — it is a property of Circle's USDC implementation. The probability is low for normal use but non-zero.

### 3.7 Constructor

```solidity
constructor(address usdcAddress) {
    if (usdcAddress == address(0)) revert ZeroAddress();
    usdc = IERC20(usdcAddress);
    nextSessionId = 1;
}
```

The only constructor argument is the USDC ERC-20 address. No owner, no fee recipient, no initializer. A deployment to the wrong address (e.g. testnet USDC on mainnet) would silently succeed at deployment but all `safeTransferFrom` calls would fail at runtime (wrong token). **The deployment runbook must include explicit chain ID confirmation and USDC address verification before broadcast.**

### 3.8 Security findings and hardening applied (2026-10-29)

#### Finding S-1 — Contract self-transfer (MEDIUM, fixed)

`createSession` accepted `host == address(this)` and `settle` accepted `participants[i] == address(this)`. In both cases `safeTransfer` would move USDC to the contract itself, where it has no withdrawal path, permanently locking those funds.

**Fix:** Added `error ContractAddress()` and checks:
- `createSession`: `if (host == address(this)) revert ContractAddress();`
- `settle` participant loop: `if (participants[i] == address(this)) revert ContractAddress();`

New Foundry tests `testContractAsHost` and `testContractAsParticipant` verify rejection.

#### Remaining categories — no defects found

| Category | Finding |
|---|---|
| Integer overflow/underflow | None — Solidity 0.8.28 checked arithmetic throughout |
| Unchecked external calls | None — all transfers via SafeERC20 |
| Access control bypass | None — `msg.sender == session.sponsor` is the only auth path |
| Storage collision | N/A — no proxy, no delegatecall |
| Front-running | Sponsor-only settlement; front-running by a third party cannot succeed |
| Griefing via participant count | `TooManyParticipants()` caps at 5, checked first |
| Event ID collision | `nextSessionId` increments monotonically starting at 1; no collision path |
| Uninitialized session reads | A read of `sessions[N]` for a non-existent ID returns zero values (sponsor = address(0)); `Unauthorized()` fires on any settle/refund attempt |

---

## 4. Foundry test coverage

**Original suite: 16 tests** in `SessionSplitTest`.  
**Hardening suite: 13 test functions** in `SessionSplitHardeningTest` (added 2026-10-29).  
**Total: 29 Foundry test functions** — confirmed by `forge test --summary` (13 + 16 = 29).

> Counting note: H-7a (`testExactDeadlineBoundarySettle`) and H-7b (`testExactDeadlineBoundaryRefund`) are two separate test functions. H-9 (`testTransferFailureRollback`) was previously documented as "H-9. testFailedTransferRollback" — the function was renamed to `testTransferFailureRollback` before the initial commit because Forge v1.7 removed the `testFail*` prefix convention. H-11 (`testMidSettlementAtomicity`) and H-12 (`testRefundTransferFailureRollback`) were added in the follow-up pass, raising the hardening count from 11 to 13.

#### Original 16 (`SessionSplitTest`)

| # | Test name | What it verifies |
|---|---|---|
| 1 | `testSuccessfulMultiRecipientPayout` | 5 participants, partial budget, leftover returned to sponsor |
| 2 | `testUnauthorizedSettlement` | Non-sponsor `settle` reverts `Unauthorized()` |
| 3 | `testOverpaymentRevert` | Amounts > rewardBudget reverts `RewardBudgetExceeded()` |
| 4 | `testDuplicateRecipients` | Duplicate address reverts `DuplicateRecipient()` |
| 5 | `testRepeatedSettlement` | Second `settle` reverts `InvalidState()` |
| 6 | `testPrematureRefund` | `refund` before deadline reverts `DeadlineNotPassed()` |
| 7 | `testRefundAfterSettlement` | `refund` after `settle` reverts `InvalidState()` |
| 8 | `testRefundAfterDeadline` | Full deposit returned; accounting exact |
| 9 | `testUnauthorizedRefund` | Non-sponsor `refund` reverts `Unauthorized()` |
| 10 | `testDeadlinePassedSettlement` | `settle` after deadline reverts `DeadlinePassed()` |
| 11 | `testZeroParticipants` | Settle with no contributors: host paid, full budget returned |
| 12 | `testLengthMismatch` | Mismatched arrays reverts `LengthMismatch()` |
| 13 | `testTooManyParticipants` | 6 participants reverts `TooManyParticipants()` |
| 14 | `testZeroHostAddress` | `ZeroAddress()` on null host |
| 15 | `testZeroHostPayout` | `InvalidAmount()` on zero hostPayout |
| 16 | `testPastDeadline` | `InvalidDeadline()` when deadline == block.timestamp |

#### Hardening 13 (`SessionSplitHardeningTest`) — added 2026-10-29

| # | Test name | What it verifies |
|---|---|---|
| H-1 | `testZeroAddressConstructor` | `ZeroAddress()` on null USDC constructor argument |
| H-2 | `testContractAsHost` | `ContractAddress()` when host == address(this) |
| H-3 | `testContractAsParticipant` | `ContractAddress()` when participant == address(this) |
| H-4 | `testZeroAddressParticipant` | `ZeroAddress()` on null participant in settle |
| H-5 | `testRepeatedRefund` | Second `refund` reverts `InvalidState()` |
| H-6 | `testSettleAfterRefund` | `settle` after `refund` reverts `InvalidState()` |
| H-7a | `testExactDeadlineBoundarySettle` | `settle` at `block.timestamp == deadline` succeeds |
| H-7b | `testExactDeadlineBoundaryRefund` | `refund` at `block.timestamp == deadline` reverts `DeadlineNotPassed()` |
| H-8 | `testZeroRewardBudget` | Zero budget session: host paid, no sponsor refund, no revert |
| H-9 | `testTransferFailureRollback` | Host transfer fails (first transfer) → whole tx reverts, state OPEN |
| H-10 | `testAccountingInvariantFuzz` | Fuzz (256 runs): funds-in == funds-out for any valid (hp, budget, count, amounts) |
| H-11 | `testMidSettlementAtomicity` | Host + first contributor paid; second contributor transfer fails → full revert; host, p1, and contract balances all unchanged; state OPEN |
| H-12 | `testRefundTransferFailureRollback` | Refund transfer to sponsor returns false → refund reverts, balances unchanged, state OPEN |

**Coverage notes:**
- H-9 simulates failure of the **first** (host) transfer via `vm.mockCall`. State is unchanged before any funds move.
- H-11 strengthens atomicity by simulating failure **after** two transfers have been made (host and first contributor). The EVM rolls back all state changes in the transaction, so all three balance assertions confirm Solidity's atomicity guarantee — not a custom try/catch mechanism.
- Both tests use `vm.mockCall` to return `false` from `MockERC20.transfer()`, which `SafeERC20.safeTransfer` detects and reverts.
- The `MockERC20` does not implement Circle's USDC blacklisting. A fork test against live Arc Testnet USDC would close that specific gap and is recommended before mainnet deployment.

---

## 5. Verified testnet evidence

Two complete flows verified by raw `eth_getLogs` RPC scan and full receipt decoding (2026-10-28):

| Flow | Transaction | Block | Amount |
|---|---|---|---|
| Event #1 funded | `0x929eba...880b` | 69,014,824 | 2.00 USDC (test) |
| Event #1 settled | `0xa56bcc...df59` | 69,019,044 | Atomic: host + contributors |
| Event #2 funded | `0x04bbb2...7b6b` | 69,049,068 | 0.40 USDC (test) |
| Event #2 refunded | `0xc94ae5...3f1b` | 69,053,518 | 0.40 USDC returned (exact match) |

The `SessionRefunded` log for Event #2 shows `amount = 400,000` (6-decimal). The same transaction also emits an ERC-20 `Transfer` with a native 18-decimal value of `400,000,000,000,000,000` — this is the same asset in a different decimal representation, not a separate transfer. Counting both would double-count.

---

## 6. Frontend configuration review

### Network selection

`src/config.ts` reads `VITE_NETWORK` at build time:

```typescript
export const IS_MAINNET = import.meta.env.VITE_NETWORK === "mainnet";
export const ACTIVE_CHAIN_ID = IS_MAINNET ? ARC_MAINNET_CHAIN_ID : ARC_TESTNET_CHAIN_ID;
// ARC_TESTNET_CHAIN_ID = 5042002
// ARC_MAINNET_CHAIN_ID = 5042
```

### Mainnet address guard

`src/contracts/sessionSplit.ts` throws at module load time if `VITE_NETWORK=mainnet` and `MAINNET_ADDRESS` is empty:

```typescript
if (IS_MAINNET && !MAINNET_ADDRESS) {
  throw new Error("[SeshPay] VITE_NETWORK=mainnet is set but mainnet address not recorded...");
}
```

This is a **runtime guard, not a build-time guard.** `MAINNET_ADDRESS` is an empty string constant evaluated at module load time in the browser. `vite build` with `VITE_NETWORK=mainnet` will succeed without error — Vite cannot evaluate module-level `throw` statements at build time. The throw fires only when the browser executes the JavaScript module, causing the app to crash on load with a descriptive error message. Setting `VITE_NETWORK=mainnet` in Vercel environment variables without populating `MAINNET_ADDRESS` will therefore produce a working build artifact that crashes immediately when any user opens the app — it will not silently fall back to the testnet contract.

### Chain switching

The app uses `useSwitchChain` from wagmi and checks `chainId === ACTIVE_CHAIN_ID` before enabling financial actions. If a user connects on the wrong chain, the UI prompts them to switch before any transaction is submitted.

### All financial actions require connected wallet

Read-only pages (`/app/events/:id`) work without a wallet. All write actions (`settle`, `refund`, `createSession`) require a connected wallet matching the expected chain.

---

## 7. Deployment runbook (Arc Mainnet)

**Do not execute until prerequisite 1 (independent audit) is satisfied.**

### Prerequisites (in order)

1. **Independent security audit** — engage a professional EVM security firm; share `contracts/SessionSplit.sol`, `contracts/test/SessionSplit.t.sol`, `foundry.toml`, and `remappings.txt`; review all findings before deployment
2. **Dedicated deployer wallet** — use a fresh wallet funded with only enough Arc Mainnet USDC for gas; never the sponsor or contributor wallet used in testing
3. **Arc Mainnet USDC address confirmed** — verified live this session: `0x3600000000000000000000000000000000000000`, 6 decimals, chain ID 5042
4. **Source and artifact integrity check:**
   ```bash
   forge build
   # Confirm contracts/out/SessionSplit.sol/SessionSplit.json matches the source
   shasum contracts/SessionSplit.sol
   shasum contracts/out/SessionSplit.sol/SessionSplit.json
   ```

### Deployment steps

**Step 1 — Confirm chain before broadcast**
```bash
cast chain-id --rpc-url https://rpc.mainnet.arc.io
# Must return 5042. Stop if it returns anything else.
```

**Step 2 — Simulate deployment (dry run)**

`forge create` defaults to **dry-run mode** — no transaction is submitted without the `--broadcast` flag. Run the command below as-is (without `--broadcast`) to check that it compiles, resolves, and estimates gas without sending anything onchain.

```bash
forge create contracts/SessionSplit.sol:SessionSplit \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $DEPLOYER_KEY \
  --constructor-args 0x3600000000000000000000000000000000000000
# No --broadcast → dry run only. Nothing is sent onchain.
# Review the estimated gas. Stop if any error appears.
```

Note: `contracts/script/DeployCreate2.s.sol` is a CREATE2 helper for deterministic addresses. It defines `run()` with no arguments (constructor args come from env vars). It is not used here — Step 3 deploys directly with `forge create`.

**Step 3 — Deploy (live broadcast, authorized personnel only)**

**Do not run this step until Prerequisites 1–4 are satisfied and you have independently confirmed the dry run in Step 2 is error-free.**

```bash
forge create contracts/SessionSplit.sol:SessionSplit \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $DEPLOYER_KEY \
  --constructor-args 0x3600000000000000000000000000000000000000 \
  --broadcast
# --broadcast submits the transaction to the network with real funds.
# This action is irreversible.
```

**Step 4 — Verify constructor argument**
```bash
cast call <DEPLOYED_ADDRESS> "usdc()(address)" --rpc-url https://rpc.mainnet.arc.io
# Must return 0x3600000000000000000000000000000000000000
cast call <DEPLOYED_ADDRESS> "nextSessionId()(uint256)" --rpc-url https://rpc.mainnet.arc.io
# Must return 1
```

**Step 5 — Record the address**

Edit `src/contracts/sessionSplit.ts`:
```typescript
const MAINNET_ADDRESS = "0x<VERIFIED_DEPLOYED_ADDRESS>" as const;
```

Also record in `AGENTS.md` and `contracts/contract-metadata/`.

**Step 6 — Build and verify mainnet bundle**
```bash
VITE_NETWORK=mainnet bun run build
# Confirm no errors. Confirm MAINNET_ADDRESS appears in dist/ with correct value.
```

**Step 7 — Controlled end-to-end test**

With a separate sponsor wallet and host wallet on Arc Mainnet with real USDC:
1. Create one event with the minimum viable deposit (e.g. 1 USDC host payout + 0 reward budget)
2. Immediately settle it (same-block or next-block)
3. Verify the settlement transaction on [explorer.arc.io](https://explorer.arc.io)
4. Record the transaction hash as mainnet evidence

**Step 8 — Deploy to Vercel with `VITE_NETWORK=mainnet`**

Set `VITE_NETWORK=mainnet` in Vercel project environment variables. Trigger a production deployment. Verify the live app connects to Arc Mainnet.

---

## 8. Known limitations and trust assumptions

| Limitation | Impact | Mitigation |
|---|---|---|
| No independent audit | Critical — unknown vulnerabilities may exist | Prerequisite before mainnet; cannot be bypassed |
| Sponsor can refund unsettled events | Host/contributors have no recourse if sponsor misses deadline | Documented UX warning; V2 adds evidence/dispute layer |
| USDC blacklisting blocks settlement | Funds temporarily locked if any recipient is blacklisted | Documented; refund path available after deadline |
| `block.timestamp` drift | Deadline enforcement may differ slightly from wall clock | Typical drift < 15s; use deadlines well above minimum |
| Mock ERC-20 in tests | BlacklistingTransfer-failure not tested | Accept as known gap; fork test recommended |
| Max 5 contributors | Hard limit enforced by contract | Documented; V2 proposal covers batch payouts |

---

## 9. GO / NO-GO verdict

### Verdict: NO-GO

Four blockers must be resolved before mainnet deployment, in this order:

| # | Blocker | Type | Resolution |
|---|---|---|---|
| **B-1** | No independent professional security audit of `SessionSplit.sol` | Critical | Engage a third-party EVM auditor; address all findings |
| **B-2** | `MAINNET_ADDRESS` is empty; frontend will throw on mainnet build | Required | Populate after B-1 + successful deployment |
| **B-3** | No controlled mainnet end-to-end transaction | Required | Perform Step 7 of the runbook after B-1 |
| **B-4** | Deployer wallet not yet provisioned | Operational | Create a dedicated mainnet deployer wallet; fund with USDC for gas only |

### What is ready

- Contract source is internally consistent, well-structured, and passes all 16 Foundry tests
- Accounting invariants are exact and verified by source review
- Authorization is sponsor-only with no bypass paths found
- CEI + nonReentrant provides solid reentrancy protection
- Frontend chain guard, mainnet-address throw guard, and chain-switch prompt are all in place
- Arc Mainnet chain ID (5042) and USDC decimals (6) verified live this session
- Two complete testnet flows (settle + refund) independently verified with raw RPC evidence
- Production build is clean: no tracing/console-capture in bundle, all 162 automated tests passing

### Remaining manual wallet tests (not yet performed on mainnet)

1. Create event with mainnet USDC — confirm two wallet transactions required
2. Settle event with multiple contributors — confirm atomic distribution
3. Refund after deadline — confirm exact deposit returned
4. Wrong-chain connection — confirm UI blocks action and prompts switch
5. Sponsor-mismatch — confirm Unauthorized error surfaced in UI

---

*This document was written by the project developer and represents a self-review, not an independent audit. All technical claims reference the exact source files in this repository. Arc Mainnet RPC and USDC address values were verified by live `eth_chainId` and `decimals()` calls on 2026-10-28.*
