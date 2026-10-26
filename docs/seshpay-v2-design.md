# SeshPay V2: Host-Evidence and Dispute-Protection System
## Design Document — Research Phase Only

**Status:** Pre-implementation design. No contract, code, or deployment changes are authorized.
**Date:** October 25, 2026
**Scope:** Extends the existing `SessionSplit` V1 contract (deployed, immutable) with a new
independent contract and an offchain evidence layer. V1 is never modified.

---

## 1. Problem Statement

V1 `SessionSplit` gives a sponsor unilateral power to refund after the deadline expires.
A host who delivers genuine work has no protection if the sponsor simply waits out the clock.
V2 adds a commit-reveal acceptance workflow, cryptographically anchored completion evidence,
a structured dispute window, and an optional pre-agreed reviewer — without changing V1 and
without introducing a platform fee or centralized admin.

---

## 2. Research Basis and Verified Sources

### 2.1 Standards examined

| Standard | Source verified | Status |
|---|---|---|
| ERC-792 (Arbitration) | docs.kleros.io — Kleros V1 on Ethereum Mainnet / Gnosis; V2 on Arbitrum | Production since 2018 |
| ERC-1497 (Evidence) | docs.kleros.io — IPFS + event log pattern | Active, widely adopted |
| UMA Optimistic Oracle V3 | docs.uma.xyz — bond + liveness + DVM escalation | Production, 99.8% non-escalation rate |
| Kleros Escrow V2 | kleros.mintlify.app — settlement negotiation, dispute timeout | Production |
| IPFS/Filecoin Pin | docs.filecoin.cloud — daily cryptographic Proof of Data Possession | Live on Filecoin Mainnet |
| Arweave permanent storage | Multiple sources — permaweb, economic incentives, no pinning needed | Production |

### 2.2 Key verified findings

**IPFS integrity vs. persistence are separate concerns.** IPFS content addressing (CID = SHA-256 hash
of content) gives tamper-evidence for free: a modified file has a different CID. Persistence is
a separate property that requires active pinning. Unpinned content on IPFS can disappear.
Filecoin Pin adds daily on-chain Proof of Data Possession backed by economic incentives.
Arweave provides economic permanence (one-time prepayment, permaweb model) but at higher cost.

**UMA's optimistic approach resolves 99.8% of cases without escalation.** Bond + liveness window
is cheaper and faster than upfront arbitration (Kleros juror selection). The cost is a mandatory
challenge delay (minimum 2 hours; 24–72 hours recommended for larger sums).

**ERC-1497 standardizes evidence submission.** The interface: `MetaEvidence` (agreement context at
creation), `Evidence` (proof submitted during dispute), `Dispute` (links evidence group to dispute).
Evidence JSON contains `fileURI` (IPFS CID path) and `fileHash` (SHA-256 of the file). Both fields
together give integrity: the CID proves bytes are unaltered; the hash in the JSON gives a
second verification path even if IPFS is accessed through a gateway.

**Kleros V2 lives on Arbitrum.** V1 lives on Ethereum Mainnet / Gnosis. Neither is deployed on Arc.
Any V2 integration with Arc would require: (a) bridging arbitration fees via CCTP to Arbitrum or
Gnosis, (b) a cross-chain messenger for the ruling callback, or (c) a self-contained reviewer model
on Arc. [ASSUMPTION: Arc supports ERC-20 USDC as the only gas token; a cross-chain arbitration
fee in a different token would require a swap step. This is an unverified operational risk for
small SeshPay payments where arbitration fees could exceed the disputed amount.]

**For SeshPay's payment sizes (testnet: 2.00 USDC), external arbitration fees make no economic
sense.** Kleros arbitration on Arbitrum costs roughly 10–50 USD in PNK staking and gas at time
of writing. A bond-based model (UMA style) or a pre-agreed named reviewer is more proportionate.

### 2.3 Assumptions explicitly marked

- [ASSUMPTION] Arc's sub-second finality means a dispute window of 48 hours is meaningfully
  enforceable by the contract without relying on a keeper network.
- [ASSUMPTION] IPFS pinning via Filecoin Pin or Pinata provides sufficient evidence availability
  for SeshPay's use case. This has not been tested on Arc Testnet with a live dispute.
- [ASSUMPTION] A named reviewer address can be trusted to be neutral if agreed pre-funding.
  Sybil risk (reviewer colluding with one party) is real and addressed only by social means in
  this design. A staked reviewer would reduce this risk but adds complexity.
- [ASSUMPTION] ERC-1497's `MetaEvidence` and `Evidence` events are indexable on Arc Testnet.
  This requires verifying that Arc Testnet's RPC supports `eth_getLogs` for custom event
  signatures. [Not verified this session.]

---

## 3. Design Goals

| Goal | Constraint |
|---|---|
| Sponsor cannot silently refund a delivered session | MUST be enforced onchain |
| Host cannot claim payment without committed evidence | MUST be enforced onchain (hash) |
| Evidence content is tamper-evident | IPFS CID + onchain hash commitment |
| Evidence is accessible to both parties and reviewer | IPFS with at least 2 pinning services |
| Reviewer is neutral and pre-agreed | Address committed before funding |
| No third-party platform fee | No fee recipient in the new contract |
| Small payments (1–50 USDC) remain viable | Reviewer bond kept proportionate |
| V1 sessions continue to work | New contract is independent; V1 is not modified |

---

## 4. State Machine

### 4.1 Session lifecycle (V2)

```
                        ┌─────────────────────────────────────────────────────────┐
                        │                     CREATED                             │
                        │  Sponsor commits: deliverables hash, reviewer address,  │
                        │  acceptance deadline, dispute window duration           │
                        └───────────────────┬─────────────────────────────────────┘
                                            │ host.acceptTerms(termsHash)
                                            ▼
                        ┌─────────────────────────────────────────────────────────┐
                        │                   TERMS_ACCEPTED                        │
                        │  Host has signed the deliverables hash onchain.         │
                        │  Sponsor may now fund (USDC transferFrom).              │
                        └───────────────────┬─────────────────────────────────────┘
                                            │ sponsor.fund(amount)
                                            ▼
                        ┌─────────────────────────────────────────────────────────┐
                        │                     FUNDED                              │
                        │  USDC locked in contract. Host must submit evidence     │
                        │  before the submission deadline.                        │
                        └─────────┬─────────────────────────┬─────────────────────┘
                                  │                         │ deadline passes,
                                  │ host.submitEvidence(    │ no evidence submitted
                                  │   evidenceCID,          │
                                  │   evidenceHash,         ▼
                                  │   timestamp)   ┌──────────────────┐
                                  │                │ TIMED_OUT_HOST   │
                                  │                │ sponsor may refund│
                                  │                └──────────────────┘
                                  ▼
                        ┌─────────────────────────────────────────────────────────┐
                        │                EVIDENCE_SUBMITTED                       │
                        │  evidenceCID + evidenceHash committed onchain.          │
                        │  Sponsor has reviewWindow to approve or dispute.        │
                        └─────────┬─────────────────────────┬─────────────────────┘
                                  │                         │
                          sponsor.approve()        sponsor.dispute(reason)
                                  │                         │
                                  ▼                         ▼
                        ┌──────────────────┐     ┌──────────────────────────────────┐
                        │    APPROVED      │     │           DISPUTED               │
                        │  Funds released  │     │  Both parties may submit         │
                        │  to host +       │     │  additional evidence via ERC-1497 │
                        │  contributors    │     │  event logs.                     │
                        └──────────────────┘     │  Reviewer has reviewerDeadline   │
                                                 │  to call resolve(ruling).        │
                                                 └────────────┬─────────────────────┘
                                                              │
                               ┌──────────────────────────────┼──────────────────────────┐
                               │                              │                          │
                    reviewer.resolve(PAY)         reviewer.resolve(REFUND)   reviewerDeadline
                               │                              │               passes,
                               ▼                              ▼               no ruling
                    ┌──────────────────┐         ┌──────────────────┐         │
                    │ REVIEWER_PAID    │         │ REVIEWER_REFUNDED│         ▼
                    │ Host + contribs  │         │ Sponsor receives │ ┌────────────────────┐
                    │ receive USDC     │         │ full deposit back │ │  REVIEWER_ABSENT   │
                    └──────────────────┘         └──────────────────┘ │  Either party may  │
                                                                       │  claim default     │
                                                                       │  ruling (see §5.5) │
                                                                       └────────────────────┘
```

### 4.2 Reviewer-absent default ruling

If the reviewer does not act within `reviewerDeadline` from when the dispute was raised:

- **If the host submitted evidence before the submission deadline:** funds release to the host.
  Rationale: the host met their obligation; the sponsor raised a dispute but the reviewer
  failed — the host should not bear the cost of reviewer absence.
- **If the host submitted evidence after the submission deadline (late):** funds return to sponsor.
  Rationale: late evidence was a courtesy; the host's own deadline miss creates ambiguity that
  defaults in the sponsor's favor.

This rule is enforced by the contract, not by any third party.

---

## 5. Security Invariants

### 5.1 Invariants enforced by the new contract

| # | Invariant | Enforcement |
|---|---|---|
| SI-1 | Funds cannot leave the contract before state ≥ EVIDENCE_SUBMITTED | Modifier on all transfer paths |
| SI-2 | Settlement requires either sponsor approval or reviewer ruling | No spontaneous release |
| SI-3 | Reviewer address is immutable after funding | Set once in `fund()`, never updated |
| SI-4 | termsHash must match the hash the host accepted | Checked in `fund()` — termsHash committed before acceptance |
| SI-5 | evidenceCID and evidenceHash are immutable once submitted | Single-submission enforcement; no update function |
| SI-6 | Sponsor cannot refund while a dispute is open | Checked against state; DISPUTED blocks `refund()` |
| SI-7 | Reviewer cannot be sponsor or host | Checked at creation |
| SI-8 | Reviewer bond forfeited if reviewer fails to act by reviewerDeadline | Bond held in contract; released to the claiming party |
| SI-9 | All state transitions emit an event with timestamp | Auditability |
| SI-10 | ERC-20 transfers use SafeERC20; CEI pattern throughout | No reentrancy on USDC paths |

### 5.2 Invariants enforced offchain (with onchain commitments)

| # | Invariant | Mechanism |
|---|---|---|
| OI-1 | Evidence content matches evidenceHash | Client verifies SHA-256(file) == evidenceHash before submission |
| OI-2 | Evidence remains accessible for the full dispute window | ≥2 independent IPFS pinning services (Filecoin Pin + Pinata) |
| OI-3 | Deliverables document matches termsHash | Client verifies SHA-256(termsJSON) == termsHash before host acceptance |
| OI-4 | Reviewer has read access to evidence before deadline | IPFS CID is public; reviewer fetches and verifies hash independently |

### 5.3 Threat model

| Threat | Impact | Mitigation |
|---|---|---|
| Fake evidence | Host submits fabricated deliverables | evidenceHash committed onchain; reviewer verifies hash and content |
| Evidence planted after dispute | Host backdates evidence | onchain `submittedAt` timestamp is block.timestamp at submission; CID is immutable |
| Dishonest sponsor never approves | Host's valid work goes unpaid | Dispute window forces sponsor to act or lose; reviewer rules in host's favor |
| Absent reviewer | Funds locked indefinitely | Reviewer bond + timeout default rule releases funds after reviewerDeadline |
| Reviewer-sponsor collusion | Reviewer rules for sponsor despite good evidence | Host can submit additional Evidence events (ERC-1497) which are publicly verifiable; reputation risk for the reviewer |
| IPFS evidence disappears | Reviewer cannot verify content | ≥2 pinning services required; contract stores hash so past existence is provable even if content is unavailable |
| Sybil reviewer | Sponsor controls the reviewer address | Reviewer address agreed before sponsor funds; host must accept terms including reviewer choice — host's acceptance is the consent gate |
| Arbitration cost > dispute value | Reviewer refuses to act | Reviewer bonds a proportionate amount (e.g., 2× the contested reward budget) at creation; forfeit incentivizes action |
| Duplicate-session replay | Attacker reuses an old evidenceHash | Each session has a unique `sessionId`; evidenceHash is tagged with sessionId in the offchain JSON |
| Storage failure at submission | Evidence upload fails silently | Client must confirm ≥2 pin confirmations before calling `submitEvidence` onchain |
| Privacy: sensitive evidence | Evidence is public on IPFS | Evidence is encrypted with a shared key known to both parties and reviewer before funding; only the ciphertext CID is committed onchain; key shared offchain or via an encrypted channel |

### 5.4 What this design does NOT guarantee

- It does not prevent a corrupt reviewer from ruling dishonestly — it only makes dishonesty
  public (the evidence and ruling are onchain) and costly (reviewer bond forfeited for absence,
  not for wrong ruling — correct ruling is subjective).
- It does not guarantee legal enforceability in any jurisdiction — the system is practical
  enforcement, not a legal arbitration process.
- It does not protect against a compromised IPFS gateway — always verify the hash locally.

---

## 6. Contract vs. Offchain Boundary

### 6.1 Must be enforced by the new smart contract

| Concern | Reason |
|---|---|
| State machine transitions and guards | Cannot be rewritten post-deployment; fund custody requires code-enforced rules |
| termsHash commitment and match check | Sponsor and host need a non-repudiable record of the agreed terms |
| evidenceCID + evidenceHash commitment | Immutable submission timestamp and content fingerprint |
| Fund custody and release paths | USDC must not be movable except through authorized paths |
| Reviewer address, bond, and deadline | Economic incentive to act; timeout default rule |
| Dispute flag (blocks unilateral refund) | Prevents sponsor from racing ahead of the reviewer |
| ERC-1497 event emission | On-chain record of all evidence submissions, readable by any third party |

### 6.2 Offchain software responsibilities

| Concern | Why offchain is appropriate |
|---|---|
| Evidence content (files, screenshots, signed messages) | Files are too large and private for onchain storage; IPFS CID gives the bridge |
| Terms document (deliverables, acceptance criteria) | Same — large, human-readable, possibly confidential |
| Evidence encryption and key exchange | Cryptographic key material must not be onchain |
| Pin health monitoring | Periodic liveness check; not a consensus operation |
| Reviewer notification | Email/webhook; not part of the trust model |
| UI for evidence preview and hash verification | Client-side, not consensus-critical |

---

## 7. Comparison with Established Standards

| Dimension | V2 Design | Kleros Escrow V2 | UMA OOV3 |
|---|---|---|---|
| Dispute initiation | Sponsor's explicit call within review window | Either party calls `reclaimFunds` | Asserter posts bond; liveness window opens |
| Evidence standard | ERC-1497 (IPFS CID + hash) | ERC-1497 | Custom ancillaryData bytes |
| Arbitrator model | Pre-agreed single named reviewer | Kleros decentralized jury (staked PNK) | UMA token holder vote (DVM) |
| Arbitrator cost | Reviewer bond (proportionate, USDC) | ~10–50 USD in gas + PNK | ~1,500 USD final fee equivalent |
| Timeout default | Contract enforces; bond forfeited | Fee-payer wins if other party doesn't pay | Proposal passes if not disputed |
| Suitable for | 1–100 USDC sessions, pre-known parties | 100+ USD, anonymous parties | Automated oracle assertions |
| On-chain footprint | Arc-native, USDC-only | Ethereum/Gnosis/Arbitrum, ETH gas | Any EVM, UMA token gas |
| Reviewer neutrality | Social agreement; Sybil risk | Cryptoeconomic via staking | Cryptoeconomic via token voting |
| Privacy | Encrypted evidence, public CID | Public evidence on IPFS | Ancillary data is public |

**Design choice rationale:** For SeshPay's use case (known sponsor and host, 1–100 USDC, Arc USDC-only
chain), a pre-agreed named reviewer with a proportionate USDC bond is more appropriate than external
arbitration. The bond is the economic lever, not token staking. If the contract grows to handle
larger sums or anonymous parties, the reviewer slot could be replaced with a Kleros V2 arbitrator
on Arbitrum via a cross-chain messenger — this upgrade is architecturally planned (reviewer is an
interface, not a hardcoded role).

---

## 8. New Contract Specification

> This is a specification only. No Solidity has been written.

### 8.1 Storage

```
struct Session {
    address sponsor;
    address host;
    address reviewer;          // pre-agreed neutral; address(0) = none (simpler mode)
    bytes32 termsHash;         // SHA-256 of the terms JSON committed by sponsor
    bytes32 evidenceHash;      // SHA-256 of the evidence file committed by host
    string  evidenceCID;       // IPFS CID of the encrypted evidence
    uint256 totalAmount;       // USDC locked (6 decimals)
    uint256 reviewerBond;      // USDC bond reviewer must post (0 if no reviewer)
    uint64  submissionDeadline;// host must submit evidence before this
    uint64  reviewWindow;      // seconds sponsor has to approve/dispute after submission
    uint64  reviewerDeadline;  // absolute timestamp; reviewer must rule by this
    uint64  submittedAt;       // block.timestamp when evidence was committed
    uint64  disputedAt;        // block.timestamp when dispute was raised
    SessionState state;
}

enum SessionState {
    CREATED,            // 0
    TERMS_ACCEPTED,     // 1
    FUNDED,             // 2
    EVIDENCE_SUBMITTED, // 3
    APPROVED,           // 4
    DISPUTED,           // 5
    REVIEWER_PAID,      // 6
    REVIEWER_REFUNDED,  // 7
    TIMED_OUT_HOST,     // 8
    REVIEWER_ABSENT     // 9
}
```

### 8.2 Key entry points

| Function | Caller | State pre | State post | Notes |
|---|---|---|---|---|
| `createSession(host, reviewer, termsHash, submissionDeadline, reviewWindow, reviewerDeadline)` | sponsor | — | CREATED | reviewer can be address(0) for no-reviewer mode |
| `acceptTerms(sessionId, termsHash)` | host | CREATED | TERMS_ACCEPTED | must match committed termsHash |
| `fund(sessionId, amount, recipients[], amounts[])` | sponsor | TERMS_ACCEPTED | FUNDED | USDC transferFrom; payout schedule committed |
| `submitEvidence(sessionId, evidenceCID, evidenceHash)` | host | FUNDED | EVIDENCE_SUBMITTED | before submissionDeadline |
| `approve(sessionId)` | sponsor | EVIDENCE_SUBMITTED | APPROVED | releases to host + contributors |
| `dispute(sessionId, reasonHash)` | sponsor | EVIDENCE_SUBMITTED | DISPUTED | within reviewWindow |
| `resolve(sessionId, ruling)` | reviewer | DISPUTED | REVIEWER_PAID or REVIEWER_REFUNDED | before reviewerDeadline |
| `claimTimeout(sessionId)` | anyone | FUNDED (after submissionDeadline) | TIMED_OUT_HOST | if host never submitted |
| `claimReviewerAbsent(sessionId)` | anyone | DISPUTED (after reviewerDeadline) | REVIEWER_ABSENT | triggers default ruling |
| `refund(sessionId)` | sponsor | TIMED_OUT_HOST or REVIEWER_ABSENT (sponsor-favored) | terminal | returns USDC to sponsor |
| `submitAdditionalEvidence(sessionId, evidenceCID, evidenceHash)` | host or sponsor | DISPUTED | DISPUTED | ERC-1497 Evidence event only; no state change |

### 8.3 Events (ERC-1497 aligned)

```solidity
event SessionCreated(uint256 indexed sessionId, address indexed sponsor, address indexed host,
    bytes32 termsHash, uint64 submissionDeadline);
event TermsAccepted(uint256 indexed sessionId, address indexed host);
event SessionFunded(uint256 indexed sessionId, uint256 amount);
event EvidenceSubmitted(uint256 indexed sessionId, string evidenceCID, bytes32 evidenceHash,
    uint64 submittedAt);
event SessionApproved(uint256 indexed sessionId);
event SessionDisputed(uint256 indexed sessionId, bytes32 reasonHash, uint64 disputedAt);
event ReviewerRuled(uint256 indexed sessionId, uint8 ruling);
event ReviewerAbsent(uint256 indexed sessionId, uint8 defaultRuling);

// ERC-1497:
event MetaEvidence(uint256 indexed _metaEvidenceID, string _evidence);
event Evidence(address indexed _arbitrator, uint256 indexed _evidenceGroupID,
    address indexed _party, string _evidence);
event Dispute(address indexed _arbitrator, uint256 indexed _disputeID,
    uint256 _metaEvidenceID, uint256 _evidenceGroupID);
```

---

## 9. Test Plan

### 9.1 State machine coverage

| Test | Expected outcome |
|---|---|
| createSession with reviewer = address(0) (no-reviewer mode) | CREATED; no reviewer bond required |
| acceptTerms with wrong hash | Revert |
| fund before TERMS_ACCEPTED | Revert |
| submitEvidence after submissionDeadline | Revert |
| approve by non-sponsor | Revert |
| dispute by non-sponsor | Revert |
| dispute after reviewWindow closed | Revert |
| claimTimeout before submissionDeadline | Revert |
| claimTimeout after deadline, no evidence | TIMED_OUT_HOST → refund succeeds |
| host submits evidence, sponsor approves | APPROVED, USDC released to host + contributors |
| host submits evidence, sponsor disputes, reviewer pays | REVIEWER_PAID, USDC to host |
| host submits evidence, sponsor disputes, reviewer refunds | REVIEWER_REFUNDED, USDC to sponsor |
| host submits evidence, sponsor disputes, reviewer absent | REVIEWER_ABSENT, default ruling applied |
| reviewer absent, evidence submitted on time | Default: funds to host |
| reviewer absent, evidence submitted late | Default: funds to sponsor |
| reviewer calls resolve twice | Revert on second call |
| reviewer bond: reviewer pays → bond returned | Reviewer receives bond back |
| reviewer bond: reviewer absent → bond forfeited | Bond goes to non-defaulting party |
| submitAdditionalEvidence in APPROVED state | Revert |
| submitAdditionalEvidence in DISPUTED state | Succeeds; emits ERC-1497 Evidence event |
| full reentrancy attempt on approve | Blocked by ReentrancyGuard and CEI pattern |
| reviewer is same address as sponsor | Revert at createSession |
| reviewer is same address as host | Revert at createSession |

### 9.2 Evidence integrity tests (offchain client)

| Test | Expected outcome |
|---|---|
| SHA-256(evidenceFile) matches committed evidenceHash | Pass |
| evidenceFile modified after CID committed | CID mismatch detected |
| evidenceCID fetched from IPFS, hash verified | SHA-256 of fetched bytes == evidenceHash |
| Pin health check: CID available on ≥2 pinning services | Pass |
| CID available on only 1 service after one service goes down | Warning triggered; operator repins |

### 9.3 Deadline and timeout boundary tests

| Test | Description |
|---|---|
| submissionDeadline = block.timestamp | Should succeed (edge case: same block) |
| submissionDeadline = block.timestamp - 1 | Revert (past deadline) |
| reviewWindow = 0 | Should revert or be blocked at creation |
| reviewerDeadline < disputedAt + minimum | Should revert at creation |
| claimTimeout at exactly submissionDeadline | Context-dependent; test both sides |

### 9.4 Economic invariant tests

| Test | Assertion |
|---|---|
| USDC in contract == sum of all FUNDED sessions that are not yet terminal | Always true |
| No USDC leaves on CREATED, TERMS_ACCEPTED, FUNDED, EVIDENCE_SUBMITTED, DISPUTED | Verified by post-state balance check |
| Reviewer bond returned in REVIEWER_PAID and REVIEWER_REFUNDED | Reviewer balance increases by bond amount |
| Reviewer bond forfeited in REVIEWER_ABSENT | Reviewer does not receive bond; non-defaulting party does |

---

## 10. Open Questions Before Implementation

1. **Arc Testnet `eth_getLogs` range:** ERC-1497 evidence is indexed by scanning logs. What is the
   practical `eth_getLogs` range limit on Arc Testnet? [Not verified this session — must test before
   building the evidence indexer.]

2. **Reviewer UX:** How does a reviewer discover they have a case to resolve? A notification system
   (email webhook listening to `SessionDisputed` events) is needed. This is offchain infrastructure
   not covered by the contract.

3. **Evidence encryption scheme:** AES-256-GCM with a shared key is suggested. How is the key
   exchanged? Options: (a) out-of-band (email/Signal), (b) ECDH between sponsor and host public
   keys, (c) lit Protocol-style threshold key management. Option (b) requires no third party and
   can be done in the browser. [Design decision needed before implementation.]

4. **Reviewer bond denomination:** USDC is proposed. Should the bond be a percentage of the
   session amount, a fixed floor, or user-defined? A fixed percentage (e.g., 10% of totalAmount,
   minimum 0.50 USDC) is simple and proportionate.

5. **Upgrade path:** If V2 needs a bug fix, the contract is immutable. Recommend a factory pattern
   with CREATE2 for deterministic addresses, but no proxy. New sessions use the new factory; old
   sessions complete under the old contract.

6. **V1 / V2 coexistence in the UI:** The V1 `SessionSplit` contract and the V2 contract are
   separate. The UI should show a clear V1/V2 indicator on each session so users are never confused
   about which rules apply.

---

## 11. What Does Not Change

- `SessionSplit.sol` (V1) — not modified.
- ABI at `src/contracts/sessionSplit.ts` — not modified.
- Deployed contract `0x0fe8a41346ab7aa30dc183384a85b5e36051713c` on Arc Testnet — not touched.
- Event #1 and Event #2 — preserved.
- All existing UI functionality — preserved.
- All 140 existing passing tests — preserved.

---

## 12. Summary of Recommended V2 Architecture

**New contract:** `SessionSplitV2.sol` — independent, non-upgradeable. Holds USDC, enforces
state machine, commits evidence hashes, emits ERC-1497 events, enforces reviewer bond and timeout.

**Offchain evidence layer:** IPFS with ≥2 pinning services (Filecoin Pin + Pinata recommended).
Evidence encrypted before upload (AES-256-GCM or ECDH-derived key). Client verifies hash before
committing onchain. Reviewer accesses evidence via IPFS gateway + hash verification.

**Reviewer model:** Named address, agreed before funding, posts a proportionate USDC bond.
Pre-agreed reviewer is appropriate for SeshPay's small-payment, known-parties use case.
Kleros V2 integration is architecturally compatible as a future upgrade but not recommended
for payments under ~50 USDC due to arbitration fee overhead.

**ERC-1497 compatibility:** All evidence is indexed via standard events, readable by any
third party without access to SeshPay's UI.
