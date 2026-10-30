# SeshPay — Mainnet Deployment Package

**Prepared:** 2026-10-29  
**Source commit:** `b7c3bf35abb00dca66ec455039011fd0e3cc838a` (main)  
**Compiler:** `solc 0.8.28+commit.7893614a`  
**Contract:** `contracts/SessionSplit.sol`  
**Constructor arg:** `0x3600000000000000000000000000000000000000` (Arc Mainnet USDC, 6 decimals, verified live)

> **This package is for your locally controlled wallet only.**  
> Arc Studio does not deploy to mainnet, sign mainnet transactions, hold private keys, or
> receive mainnet funds on your behalf. Nothing in this document should be executed until
> Blocker B-1 (independent professional audit) is resolved. These are instructions for
> a future action by the repository owner.

---

## Subsequent outcome — October 30, 2026

This is a **historical predeployment runbook**. The owner later elected a limited, explicitly unaudited mainnet pilot under an updated [`SECURITY.md`](../SECURITY.md) policy. The contract has **already been deployed** on Arc Mainnet at [`0xd02bc329d5cfe93e841ea2c925520ef864621c4c`](https://explorer.arc.io/address/0xd02bc329d5cfe93e841ea2c925520ef864621c4c); [deployment transaction](https://explorer.arc.io/tx/0x78fcb1fadb4d888c3f979a3ecee9dc093d2346c615cc1429b226d9b18e3b136b). **Do not rerun the broadcast instructions below.** The old B-1 gate and predeployment checklist are preserved as written to document the original security assessment and are not evidence of an independent audit. Current mainnet evidence is in the [README](../README.md#verified-arc-mainnet-transactions--event-1-october-30-2026).

---

## Reference bytecode hashes (hardened artifact, main commit b7c3bf3)

These were computed on 2026-10-29 from the compiled artifact at
`contracts/out/SessionSplit.sol/SessionSplit.json` after a clean `forge build`:

| Artifact component | SHA-256 |
|---|---|
| Source file (`contracts/SessionSplit.sol`) | `8619a639b94bffcd8d22a4521206d5021c9ae5c93baeb702cdc5d2a77eba9d0c` |
| Full artifact JSON | `7519f49f1e0a80b029a84496dea5770474feeab5c84fe41adfd19e9deb0b59e0` |
| Creation bytecode (no constructor arg) | `4f96b2393becb6b0efbe61a4579271773d5a28072f2f860ccc6bc11e9cd899e6` |
| Runtime bytecode (placeholder immutables) | `3fae30a0871ebe3ad8c5d4bf30a7c22d142392b61362f7708a96a1aaa0d5bed2` |
| Runtime bytecode (USDC immutables filled) | `e2ba445af6cb74d98bb791c1f3ef3aad27ed8291ffc2f6298e4e20202ae6c46d` |

The "immutables filled" hash is what you will read back from `eth_getCode` on a correctly
deployed contract. Fill the 6 immutable slots (bytes 164, 726, 1066, 1887, 2017, 2252,
each 32 bytes wide) with the ABI-encoded USDC address before comparing:
`0000000000000000000000003600000000000000000000000000000000000000`.

---

## Arc Mainnet chain facts (verified live 2026-10-29)

| Property | Value | How verified |
|---|---|---|
| Chain ID | 5042 (`0x13b2`) | `eth_chainId` live RPC call |
| RPC URL | `https://rpc.mainnet.arc.io` | Arc docs |
| Block explorer | `https://explorer.arc.io` | Arc docs |
| USDC address | `0x3600000000000000000000000000000000000000` | Arc docs |
| USDC `decimals()` | 6 | `eth_call` live RPC call |
| USDC `name()` | `"USDC"` | `eth_call` live RPC call |
| Current block | 28,774,637 at time of check | `eth_blockNumber` |

---

## Pre-flight checklist (complete in order, do not skip)

- [ ] **B-1 cleared:** independent professional EVM security audit completed; all findings resolved
- [ ] You are on the `main` branch at commit `b7c3bf3` (or newer, with no source changes to `SessionSplit.sol`)
- [ ] `forge build` completes with no errors on the current source
- [ ] Source SHA-256 matches the reference above: `sha256sum contracts/SessionSplit.sol`
- [ ] Artifact SHA-256 matches: `sha256sum contracts/out/SessionSplit.sol/SessionSplit.json`
- [ ] Your deployer wallet is a **fresh, dedicated wallet** — NOT your sponsor/host wallet, NOT your personal wallet with other funds
- [ ] Deployer wallet has only enough Arc Mainnet USDC to cover gas (a few cents; Arc gas fees are stable)
- [ ] You have the deployer wallet's private key in a local environment variable `DEPLOYER_KEY` — never paste it into a file tracked by git
- [ ] `cast wallet address --private-key $DEPLOYER_KEY` prints the expected deployer address
- [ ] You have confirmed your Circle account is mainnet-enabled (https://console.circle.com/)

---

## Step 1 — Confirm you are on the right chain

```bash
cast chain-id --rpc-url https://rpc.mainnet.arc.io
```

**Expected output:** `5042`

Stop immediately if any other value is returned. A wrong chain ID means you are
connecting to a different network and the USDC address will be wrong.

---

## Step 2 — Confirm your source and artifact integrity

```bash
# Source hash
sha256sum contracts/SessionSplit.sol
# Expected: 8619a639b94bffcd8d22a4521206d5021c9ae5c93baeb702cdc5d2a77eba9d0c

# Artifact hash  
sha256sum contracts/out/SessionSplit.sol/SessionSplit.json
# Expected: 7519f49f1e0a80b029a84496dea5770474feeab5c84fe41adfd19e9deb0b59e0

# If either hash does not match, rebuild first:
forge build
# Then re-check both hashes. If source hash changed, do NOT proceed —
# the source was modified since this package was prepared.
```

---

## Step 3 — Dry run (no broadcast, no funds moved)

`forge create` without `--broadcast` simulates the deployment locally. It encodes
constructor args, estimates gas, and validates the transaction — but sends nothing onchain.

```bash
forge create contracts/SessionSplit.sol:SessionSplit \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $DEPLOYER_KEY \
  --constructor-args 0x3600000000000000000000000000000000000000
# No --broadcast flag. This is a DRY RUN only.
```

What to check in the output:
- No errors or warnings
- Gas estimate is reasonable (the testnet deployment used approximately 490,000 gas)
- The `--constructor-args` value prints as `0x3600000000000000000000000000000000000000`

---

## Step 4 — Live broadcast (irreversible — only after B-1 + dry run clean)

> **WARNING:** This step submits a real transaction on Arc Mainnet with real USDC for gas.
> It is irreversible. Do not run this step until:
> (a) The independent audit (B-1) is complete with all findings resolved.
> (b) The dry run in Step 3 completed without errors.
> (c) You have read and understood the pre-flight checklist above.

```bash
forge create contracts/SessionSplit.sol:SessionSplit \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $DEPLOYER_KEY \
  --constructor-args 0x3600000000000000000000000000000000000000 \
  --broadcast
```

Record the output: deployed address and transaction hash. You will need both.

---

## Step 5 — Verify the deployment

```bash
# Verify USDC address is baked in correctly
cast call <DEPLOYED_ADDRESS> "usdc()(address)" --rpc-url https://rpc.mainnet.arc.io
# Must return: 0x3600000000000000000000000000000000000000

# Verify session counter starts at 1
cast call <DEPLOYED_ADDRESS> "nextSessionId()(uint256)" --rpc-url https://rpc.mainnet.arc.io
# Must return: 1

# Fetch deployed runtime bytecode and hash it
cast code <DEPLOYED_ADDRESS> --rpc-url https://rpc.mainnet.arc.io | python3 -c "
import sys, hashlib
code = sys.stdin.read().strip()[2:]  # strip 0x
print('Runtime SHA-256:', hashlib.sha256(bytes.fromhex(code)).hexdigest())
"
# Expected (with USDC immutables filled): e2ba445af6cb74d98bb791c1f3ef3aad27ed8291ffc2f6298e4e20202ae6c46d
```

If the runtime hash does not match, stop and investigate before proceeding. A mismatch
means either the wrong source was compiled or a different artifact was used.

---

## Step 6 — Record the address in the frontend

Edit `src/contracts/sessionSplit.ts` — change only this one line:

```typescript
const MAINNET_ADDRESS = "0x<YOUR_VERIFIED_DEPLOYED_ADDRESS>" as const;
```

Also update:
- `AGENTS.md`: add the mainnet address, tx hash, block number, and date
- `contracts/contract-metadata/SessionSplit.json`: add a new entry to `contract_deployments`

---

## Step 7 — Test the mainnet deployment end-to-end

With your deployer wallet as sponsor and a separate wallet as host:

```bash
# 1. Approve SessionSplit to spend 1.000001 USDC (1 USDC host + 0.000001 reward buffer)
cast send 0x3600000000000000000000000000000000000000 \
  "approve(address,uint256)" \
  <DEPLOYED_ADDRESS> 1000001 \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $DEPLOYER_KEY

# 2. Create a minimal session (1 USDC host payout, 1 unit reward, deadline = now + 3600)
DEADLINE=$(( $(date +%s) + 3600 ))
cast send <DEPLOYED_ADDRESS> \
  "createSession(address,uint256,uint256,uint256)" \
  <HOST_ADDRESS> 1000000 1 $DEADLINE \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $DEPLOYER_KEY

# 3. Settle immediately (0 participants, 1-unit leftover returned to sponsor)
cast send <DEPLOYED_ADDRESS> \
  "settle(uint256,address[],uint256[])" \
  1 "[]" "[]" \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $DEPLOYER_KEY
```

Verify both transactions on https://explorer.arc.io. Record the settlement tx hash
as mainnet evidence.

---

## Step 8 — Deploy the mainnet frontend

Set `VITE_NETWORK=mainnet` in your Vercel project environment variables.
Trigger a production deployment from the `main` branch.
Verify the live app at https://seshpay.vercel.app connects to Arc Mainnet (chain ID 5042).

---

## Known remaining risks (honest assessment)

| Risk | Severity | Notes |
|---|---|---|
| No independent professional audit | **Critical blocker** | Cannot proceed without this |
| USDC blacklisting blocks settlement or refund | Low | Confirmed on Arc — see SS-02 analysis |
| `block.timestamp` drift vs wall clock | Very low | Documented; use deadlines >> minimum |
| Sponsor trust (no dispute mechanism) | Design choice | Documented in README; V2 plans |
| Mock ERC-20 in tests (no blacklist coverage) | Known gap | Fork test recommended |

This package was prepared by the project developer — it is not an independent audit or a
guarantee of security. All bytecode hashes and RPC values were collected on 2026-10-29.
