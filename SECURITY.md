# Security Policy

## Project status

SeshPay is an Arc Testnet MVP. The application currently operates exclusively on Arc Testnet using test USDC. **It has not been deployed to Arc Mainnet and has not been reviewed by an external security firm.**

Do not use SeshPay with real funds on any network until an independent professional security audit has been completed and the results have been reviewed.

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

The repository includes 162 passing automated tests (16 Foundry + 146 Bun tests, verified 2026-10-27). These tests were written by the same developer who wrote the contract and frontend. They confirm expected behaviour and regression coverage but **do not constitute an independent security audit**. A professional third-party audit is required before any deployment involving real funds.

---

## Reporting a vulnerability

### Private GitHub vulnerability reporting — currently disabled

GitHub's built-in Private Vulnerability Reporting feature is not currently enabled on this repository. There is no "Report a vulnerability" button in the Security tab.

**If you are the repository owner and want to enable it:**
1. Go to [github.com/Alike001/seshpay-arc/settings/security\_analysis](https://github.com/Alike001/seshpay-arc/settings/security_analysis)
2. Under "Private vulnerability reporting", click **Enable**.

Once enabled, contributors can report vulnerabilities privately through GitHub without creating a public issue.

### Until private reporting is enabled

If you discover a suspected vulnerability, please **do not open a public GitHub issue**. Instead:

1. Create a **draft GitHub security advisory** by navigating to:
   `https://github.com/Alike001/seshpay-arc/security/advisories/new`
   This form is available even without the private reporting feature enabled and keeps the report confidential.
2. Describe the vulnerability in detail: affected component, reproduction steps, potential impact, and any suggested fix.
3. The maintainer will review the draft and respond through the advisory thread.

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
- Do not include real transaction hashes from mainnet operations involving real funds.
- Do not disclose the vulnerability in a public issue, pull request, or social media post before it has been acknowledged and a fix has been agreed upon.

---

## Disclosure expectations

This is an open-source project maintained on a best-effort basis without a formal response SLA. The maintainer will make a reasonable effort to acknowledge reports and work toward remediation, but no guaranteed response time or remediation timeline can be promised.

Critical findings that affect fund security will be prioritised over feature work.
