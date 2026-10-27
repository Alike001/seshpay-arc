# Contributing to SeshPay

Thank you for your interest in contributing. SeshPay is a sponsor-controlled USDC payout application built on Arc. Contributions that improve the frontend, documentation, accessibility, test coverage, or developer experience are welcome.

---

## Prerequisites

| Tool | Purpose | Install |
|---|---|---|
| [Bun](https://bun.sh) 1.x | Package manager, test runner | `curl -fsSL https://bun.sh/install \| bash` |
| [Foundry](https://book.getfoundry.sh) | Solidity compilation and tests | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| Git | Version control | System package manager |
| EVM wallet | Manual testing on Arc Testnet | MetaMask, Rabby, or similar |

Arc Testnet RPC: `https://rpc.testnet.arc.io` · Chain ID: `5042002`

---

## Getting started

```bash
# Clone the repository
git clone https://github.com/Alike001/seshpay-arc.git
cd seshpay-arc

# Install dependencies
bun install

# Start the development server
bun run dev        # http://localhost:5173
```

---

## Development commands

All scripts are defined in `package.json`. Run these before submitting a pull request:

```bash
# Lint and typecheck
bun run check

# JavaScript and TypeScript unit tests (146 tests across 4 files)
bun test

# Solidity unit tests (16 Foundry tests)
bun run contracts:test

# Production build
bun run build
```

A pull request must pass all four commands with zero errors before review.

---

## Recommended workflow

1. **Fork** the repository on GitHub and create a focused feature branch:
   ```bash
   git checkout -b fix/describe-your-change
   ```
2. Make the smallest change that addresses one issue or adds one feature.
3. Add or update tests for any change to `contracts/` or `src/utils/`.
4. Run `bun run check && bun test && bun run contracts:test` and confirm everything passes.
5. Commit with a clear, imperative message:
   ```
   fix: correct deadline validation copy in CreateSession
   docs: add Arc Testnet RPC setup instructions
   test: cover SETTLED state with past deadline
   ```
6. Push your branch and open a pull request against `main`.

---

## Pull request guidance

- Keep pull requests focused on a single concern. One problem, one PR.
- Describe what changed, why it changed, and how to verify it.
- Reference any related issue with `Fixes #N` or `Relates to #N`.
- Do not bump version numbers, reformat unrelated files, or change lock files unnecessarily.

---

## Areas where contributions help

| Area | Examples |
|---|---|
| **UI / UX** | Improved mobile layout, loading states, error messages |
| **Accessibility** | ARIA labels, keyboard navigation, colour contrast |
| **Documentation** | Clearer guides, corrected instructions, translated content |
| **Testing** | Additional edge-case tests for format utils, session decode, or event ID extraction |
| **Security research** | Reading the contract, identifying edge cases — see [SECURITY.md](SECURITY.md) for disclosure process |
| **Blockchain integration** | WalletConnect support, additional wallet connectors |

---

## Important constraints

**Do not use real USDC during routine contribution tests.** The live application runs on Arc Testnet. Use the "Get test USDC" button in Arc Studio, or request test tokens from the Arc Testnet faucet.

**Do not commit credentials.** The `.gitignore` excludes `.env` files. Never add wallet private keys, seed phrases, API keys, or any secret to the repository.

**Contract changes require separate review.** Pull requests that modify `contracts/SessionSplit.sol`, the ABI, or the deployed contract address should open an issue first to discuss the change. Financial contract changes carry higher risk and are reviewed independently of frontend work. Do not bundle them with unrelated UI changes.

**Do not redeploy or create on-chain transactions** as part of a pull request. Any deployment to Arc Testnet or Mainnet is a separate deliberate action performed by the maintainer.

---

## Questions

Open a GitHub issue to ask questions, propose features, or report non-security bugs.

For security-related reports, follow the process in [SECURITY.md](SECURITY.md).
