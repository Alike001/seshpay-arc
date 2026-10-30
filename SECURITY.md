# Security Policy

## Project status

SeshPay was developed as an Arc Testnet MVP. A limited, **unaudited** mainnet pilot was deployed on October 30, 2026 at the owner's discretion as an experimental demonstration for Arc Microgrants. This pilot is self-funded and operates at the owner's risk.

**Previous policy:** Real-fund use required a completed independent professional security audit before any mainnet deployment.

**Current status:** The owner has decided to proceed with a limited mainnet pilot without a prior professional audit. This decision was made knowingly and does not imply that the contract is free of defects. An independent professional security audit remains a prerequisite for any broader, public-facing production launch.

**What this means for users:**
- The smart contract has not been reviewed by an independent security firm.
- Automated tests were written by the same developer who wrote the contract — they confirm expected behaviour but do not constitute an independent audit.
- Real USDC can be lost if the contract contains undiscovered bugs.
- Sponsor approval is discretionary — hosts and contributors have no recourse if the sponsor does not settle before the deadline.
- USDC transfers to blacklisted addresses will revert the entire transaction, which can lock funds indefinitely, potentially permanently.
- The pilot uses the smallest viable deposit amounts consistent with demonstrating the payout flow.

Do not use SeshPay with funds you cannot afford to lose. This is an experimental prototype, not an audited production application.

---

## Scope

The following are in scope for security research:

| Component | Examples |
|---|---|
| `contracts/SessionSplit.sol` | Authorization bypass, reentrancy, accounting errors, state-machine violations |
| USDC approval handling | Over-approval, approval phishing surface in the frontend |
| Settlement / refund authorization | Any path that lets a non-sponsor settle or refund |
| Frontend wallet integration | Transaction parameter manipulation, misleading confirmation UI |
| Transaction handling | Race conditions, ambiguous error states, unguarded retries |
| Configuration | `VITE_NETWORK` misuse, hardcoded address risks |

The following are out of scope:

- Denial-of-service attacks on the Arc Testnet RPC
- Social engineering or phishing attacks unrelated to the application
- Vulnerabilities in third-party dependencies (OpenZeppelin, wagmi, viem) unless they affect SeshPay specifically
- Issues in `docs/`, `scripts/`, or development tooling that have no impact on fund security

---

## Automated tests are not a security audit

The repository includes 222 passing automated tests (29 Foundry + 193 Bun tests, verified 2026-10-30). These tests were written by the same developer who wrote the contract and frontend. They confirm expected behaviour and regression coverage but **do not constitute an independent security audit**. A professional third-party audit remains a prerequisite for any broader production launch involving real funds at scale.

---

## Reporting a vulnerability

### Private GitHub vulnerability reporting — enabled

GitHub's built-in Private Vulnerability Reporting is **enabled** on this repository (verified 2026-10-27). Researchers can submit confidential reports without creating a public issue.

**To report a vulnerability:**

1. Go to the **Security** tab of [github.com/Alike001/seshpay-arc](https://github.com/Alike001/seshpay-arc).
2. Click **"Report a vulnerability"** (visible under Security > Advisories).
3. Fill in the advisory form: affected component, steps to reproduce, potential impact, and any suggested fix.
4. Submit the draft. It is only visible to you and the repository maintainer.
5. The maintainer will review and respond through the private advisory thread.

Please **do not open a public GitHub issue** to report a suspected vulnerability. Public disclosure before a fix is in place puts users at risk.

---

## What to include in a report

A useful security report includes:

- The affected file(s) and function(s)
- A clear description of the vulnerability and the conditions under which it can be triggered
- The potential impact (e.g. fund theft, authorization bypass, denial of service)
- Steps to reproduce or a proof-of-concept (on testnet only, using test USDC)
- Any suggested fix or mitigation

---

## What not to include

- **Never share seed phrases, private keys, or wallet secrets** in a report or anywhere in this repository.
- Do not include third-party transaction hashes, wallet addresses, or any private or sensitive information belonging to users other than the reporter.
- The owner's own consented mainnet demonstration transactions may be shared publicly for hackathon verification purposes. Sharing those transaction hashes and the verified contract address is permitted and expected.
- Do not disclose the vulnerability in a public issue, pull request, or social media post before it has been acknowledged and a fix has been agreed upon.

---

## Disclosure expectations

This is an open-source project maintained on a best-effort basis without a formal response SLA. The maintainer will make a reasonable effort to acknowledge reports and work toward remediation, but no guaranteed response time or remediation timeline can be promised.

Critical findings that affect fund security will be prioritised over feature work.
