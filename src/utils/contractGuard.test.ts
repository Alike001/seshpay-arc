/**
 * contractGuard.test.ts
 *
 * Focused tests for the frontend contract-address guard added in the
 * security-hardening pass.
 *
 * The deployed Arc Testnet contract is immutable and has no ContractAddress()
 * guard — setting it as a host or contributor would permanently lock funds
 * (safeTransfer sends to the contract itself, which has no withdrawal path).
 *
 * These tests:
 *  1. Verify the guard logic (inline, mirrors what the components compute)
 *  2. Confirm the guard is present in both CreateSession.tsx and SettleSession.tsx
 *  3. Confirm the guard uses viem `isAddress` + case-insensitive comparison
 *  4. Confirm the guard message is a blocking error (role="alert", danger color)
 *  5. Document the known limitation: frontend cannot prevent direct contract calls
 *
 * Run: bun test src/utils/contractGuard.test.ts
 */

import { describe, it, expect } from "bun:test";
import { isAddress, getAddress } from "viem";
import { readFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const root = join(import.meta.dir, "../../");

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

// The testnet contract address — matches TESTNET_ADDRESS in sessionSplit.ts.
// This value must stay consistent with the deployed contract.
const CONTRACT_ADDRESS = "0x0fe8a41346ab7aa30dc183384a85b5e36051713c";

// Mirror the guard logic from CreateSession.tsx / SettleSession.tsx
// so the tests stay independent of the component render cycle.
function hostIsContract(host: string, contractAddr: string): boolean {
  return (
    isAddress(host) &&
    host.toLowerCase() === contractAddr.toLowerCase()
  );
}

function contributorHasContract(
  rows: Array<{ address: string; amount: string }>,
  contractAddr: string
): boolean {
  return rows.some(
    (c) =>
      isAddress(c.address) &&
      c.address.toLowerCase() === contractAddr.toLowerCase()
  );
}

// ---------------------------------------------------------------------------
// 1. Guard logic — host
// ---------------------------------------------------------------------------

describe("hostIsContract guard logic", () => {
  it("returns true when host exactly matches the contract address", () => {
    expect(hostIsContract(CONTRACT_ADDRESS, CONTRACT_ADDRESS)).toBe(true);
  });

  it("returns true for the EIP-55 checksummed version of the contract address", () => {
    // Users often copy a checksummed address from an explorer.
    // getAddress produces the canonical EIP-55 form, which isAddress(strict=true) accepts.
    const checksummed = getAddress(CONTRACT_ADDRESS);
    expect(hostIsContract(checksummed, CONTRACT_ADDRESS)).toBe(true);
  });

  it("returns false for an all-uppercase address (fails EIP-55 checksum, rejected by isAddress)", () => {
    // viem isAddress with strict=true rejects addresses that don't match EIP-55.
    // An all-uppercase address fails checksum, so the guard treats it as invalid input
    // rather than a match — the component's isAddress(host) check returns false first.
    const upper = CONTRACT_ADDRESS.toUpperCase();
    expect(isAddress(upper)).toBe(false); // confirm the assumption
    expect(hostIsContract(upper, CONTRACT_ADDRESS)).toBe(false);
  });

  it("returns false for a normal EOA address", () => {
    const eoa = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    expect(hostIsContract(eoa, CONTRACT_ADDRESS)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(hostIsContract("", CONTRACT_ADDRESS)).toBe(false);
  });

  it("returns false for a partial address", () => {
    expect(hostIsContract("0x0fe8a413", CONTRACT_ADDRESS)).toBe(false);
  });

  it("returns false for the zero address", () => {
    expect(hostIsContract("0x0000000000000000000000000000000000000000", CONTRACT_ADDRESS)).toBe(false);
  });

  it("returns false for a different valid contract address", () => {
    const other = "0x3600000000000000000000000000000000000000"; // USDC
    expect(hostIsContract(other, CONTRACT_ADDRESS)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Guard logic — contributors
// ---------------------------------------------------------------------------

describe("contributorHasContract guard logic", () => {
  it("detects the contract address in the first row", () => {
    expect(
      contributorHasContract(
        [{ address: CONTRACT_ADDRESS, amount: "1.00" }],
        CONTRACT_ADDRESS
      )
    ).toBe(true);
  });

  it("detects the EIP-55 checksummed contract address in a later row", () => {
    // getAddress returns the canonical EIP-55 checksum form, which isAddress accepts.
    expect(
      contributorHasContract(
        [
          { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", amount: "1.00" },
          { address: getAddress(CONTRACT_ADDRESS), amount: "2.00" },
        ],
        CONTRACT_ADDRESS
      )
    ).toBe(true);
  });

  it("returns false when no row contains the contract address", () => {
    expect(
      contributorHasContract(
        [
          { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", amount: "1.00" },
          { address: "0x3600000000000000000000000000000000000000", amount: "2.00" },
        ],
        CONTRACT_ADDRESS
      )
    ).toBe(false);
  });

  it("returns false for empty rows array", () => {
    expect(contributorHasContract([], CONTRACT_ADDRESS)).toBe(false);
  });

  it("skips rows with invalid addresses (not EVM addresses)", () => {
    // A partially-typed address is not valid — guard should not match it
    expect(
      contributorHasContract(
        [{ address: CONTRACT_ADDRESS.slice(0, 20), amount: "1.00" }],
        CONTRACT_ADDRESS
      )
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Source scan — CreateSession.tsx
// ---------------------------------------------------------------------------

describe("CreateSession.tsx — contract-address guard present", () => {
  const src = readSrc("src/components/CreateSession.tsx");

  it("imports isAddress from viem", () => {
    expect(src).toContain("isAddress");
    expect(src).toContain('from "viem"');
  });

  it("derives hostIsContract with toLowerCase comparison", () => {
    expect(src).toContain("hostIsContract");
    expect(src).toContain("toLowerCase");
  });

  it("blocks isValid when hostIsContract is true", () => {
    // The isValid expression must include !hostIsContract
    expect(src).toContain("!hostIsContract");
  });

  it("renders a role=alert danger message when hostIsContract", () => {
    expect(src).toContain('role="alert"');
    expect(src).toContain("hostIsContract");
    expect(src).toContain("var(--danger)");
  });

  it("uses isAddress for proper EVM address validation", () => {
    expect(src).toContain("isAddress(host)");
  });

  it("documents that frontend cannot prevent direct contract calls", () => {
    expect(src).toContain("cannot prevent direct contract calls");
  });
});

// ---------------------------------------------------------------------------
// 4. Source scan — SettleSession.tsx
// ---------------------------------------------------------------------------

describe("SettleSession.tsx — contract-address guard present", () => {
  const src = readSrc("src/components/SettleSession.tsx");

  it("imports isAddress from viem", () => {
    expect(src).toContain("isAddress");
    expect(src).toContain('from "viem"');
  });

  it("derives contractAddrRows with toLowerCase comparison", () => {
    expect(src).toContain("contractAddrRows");
    expect(src).toContain("toLowerCase");
  });

  it("blocks isValid when contractAddrRows is non-empty", () => {
    expect(src).toContain("contractAddrRows.length === 0");
  });

  it("renders a role=alert danger message when contractAddrRows has entries", () => {
    expect(src).toContain('role="alert"');
    expect(src).toContain("contractAddrRows.length > 0");
    expect(src).toContain("var(--danger)");
  });

  it("uses isAddress for proper EVM address validation", () => {
    expect(src).toContain("isAddress(c.address)");
  });

  it("documents that frontend cannot prevent direct contract calls", () => {
    expect(src).toContain("cannot prevent direct contract calls");
  });
});

// ---------------------------------------------------------------------------
// 5. Known limitation documented in both components
// ---------------------------------------------------------------------------

describe("known limitation — frontend cannot prevent direct calls", () => {
  it("CreateSession.tsx documents the limitation in a code comment", () => {
    const src = readSrc("src/components/CreateSession.tsx");
    expect(src).toContain("cannot prevent direct contract calls");
  });

  it("SettleSession.tsx documents the limitation in a code comment", () => {
    const src = readSrc("src/components/SettleSession.tsx");
    expect(src).toContain("cannot prevent direct contract calls");
  });
});

// ---------------------------------------------------------------------------
// 6. Contributor address validation (rowAddressValid logic regression tests)
//
//    Mirrors the rowAddressValid() function and filledRows/invalidAddrRows/
//    zeroAddrRows derivations in SettleSession.tsx. Tests verify that
//    viem isAddress replaces the previous startsWith("0x") && length === 42
//    approach, which silently accepted malformed addresses.
// ---------------------------------------------------------------------------

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const VALID_EOA    = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

// Mirror rowAddressValid from SettleSession.tsx
function rowAddressValid(addr: string): boolean {
  return isAddress(addr) && addr.toLowerCase() !== ZERO_ADDRESS;
}

type Row = { address: string; amount: string };

function classifyRows(rows: Row[], contractAddr: string) {
  const filledRows   = rows.filter(c => rowAddressValid(c.address) && c.amount.trim() !== "" && c.amount.trim() !== "0");
  const invalidRows  = rows.filter(c => c.address !== "" && !isAddress(c.address));
  const zeroRows     = rows.filter(c => isAddress(c.address) && c.address.toLowerCase() === ZERO_ADDRESS);
  const contractRows = filledRows.filter(c => isAddress(c.address) && c.address.toLowerCase() === contractAddr.toLowerCase());
  const partialRows  = rows.filter(c =>
    (c.address !== "" || c.amount !== "") &&
    !filledRows.includes(c) &&
    !invalidRows.includes(c) &&
    !zeroRows.includes(c)
  );
  const addrs        = filledRows.map(c => c.address.toLowerCase());
  const hasDuplicates = addrs.length !== new Set(addrs).size;
  return { filledRows, invalidRows, zeroRows, contractRows, partialRows, hasDuplicates };
}

describe("rowAddressValid — address classification", () => {
  it("accepts a valid all-lowercase EVM address", () => {
    expect(rowAddressValid("0xd8da6bf26964af9d7eed9e03e53415d37aa96045")).toBe(true);
  });

  it("accepts a valid EIP-55 checksummed address", () => {
    expect(rowAddressValid(VALID_EOA)).toBe(true);
  });

  it("rejects the zero address", () => {
    expect(rowAddressValid(ZERO_ADDRESS)).toBe(false);
  });

  it("rejects a truncated address (only 20 chars after 0x)", () => {
    expect(rowAddressValid("0x0fe8a41346ab7aa30dc1")).toBe(false);
  });

  it("rejects an address with non-hex characters", () => {
    expect(rowAddressValid("0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(rowAddressValid("")).toBe(false);
  });

  it("rejects an address that is 42 chars but contains a typo (wrong checksum)", () => {
    // All-uppercase passes length/prefix check but fails EIP-55 strict checksum
    const badChecksum = "0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045";
    expect(isAddress(badChecksum)).toBe(false);
    expect(rowAddressValid(badChecksum)).toBe(false);
  });
});

describe("filledRows — only valid, non-zero, non-empty rows reach calldata", () => {
  it("accepts a valid address with a non-zero amount", () => {
    const { filledRows } = classifyRows([{ address: VALID_EOA, amount: "1.00" }], CONTRACT_ADDRESS);
    expect(filledRows).toHaveLength(1);
  });

  it("excludes a malformed address from filledRows", () => {
    const { filledRows, invalidRows } = classifyRows(
      [{ address: "0xNOTVALID", amount: "1.00" }],
      CONTRACT_ADDRESS
    );
    expect(filledRows).toHaveLength(0);
    expect(invalidRows).toHaveLength(1);
  });

  it("excludes the zero address from filledRows", () => {
    const { filledRows, zeroRows } = classifyRows(
      [{ address: ZERO_ADDRESS, amount: "1.00" }],
      CONTRACT_ADDRESS
    );
    expect(filledRows).toHaveLength(0);
    expect(zeroRows).toHaveLength(1);
  });

  it("excludes a row with zero amount from filledRows (partial)", () => {
    const { filledRows, partialRows } = classifyRows(
      [{ address: VALID_EOA, amount: "0" }],
      CONTRACT_ADDRESS
    );
    expect(filledRows).toHaveLength(0);
    expect(partialRows).toHaveLength(1);
  });

  it("excludes a row with empty amount from filledRows (partial)", () => {
    const { filledRows, partialRows } = classifyRows(
      [{ address: VALID_EOA, amount: "" }],
      CONTRACT_ADDRESS
    );
    expect(filledRows).toHaveLength(0);
    expect(partialRows).toHaveLength(1);
  });

  it("detects contract address in contractRows (not a zero-addr or invalid-addr)", () => {
    const { filledRows, contractRows } = classifyRows(
      [{ address: CONTRACT_ADDRESS, amount: "1.00" }],
      CONTRACT_ADDRESS
    );
    expect(filledRows).toHaveLength(1);  // contract addr IS isAddress-valid
    expect(contractRows).toHaveLength(1);
  });

  it("detects duplicate addresses in filledRows", () => {
    const { hasDuplicates } = classifyRows(
      [
        { address: VALID_EOA, amount: "1.00" },
        { address: VALID_EOA, amount: "2.00" },
      ],
      CONTRACT_ADDRESS
    );
    expect(hasDuplicates).toBe(true);
  });

  it("does not flag duplicates for two different valid addresses", () => {
    const other = "0x3600000000000000000000000000000000000000";
    const { hasDuplicates } = classifyRows(
      [
        { address: VALID_EOA, amount: "1.00" },
        { address: other, amount: "2.00" },
      ],
      CONTRACT_ADDRESS
    );
    expect(hasDuplicates).toBe(false);
  });
});

describe("SettleSession.tsx — uses isAddress for contributor validation", () => {
  const src = readSrc("src/components/SettleSession.tsx");

  it("uses rowAddressValid with isAddress (not startsWith check)", () => {
    expect(src).toContain("isAddress(addr)");
    // The old pattern must not remain as the primary address gate
    expect(src).not.toContain('c.address.startsWith("0x") &&\n      c.address.length === 42');
  });

  it("derives invalidAddrRows to catch malformed addresses", () => {
    expect(src).toContain("invalidAddrRows");
    expect(src).toContain("invalidAddrRows.length === 0");
  });

  it("derives zeroAddrRows to reject the zero address", () => {
    expect(src).toContain("zeroAddrRows");
    expect(src).toContain("zeroAddrRows.length === 0");
  });

  it("renders a role=alert error for invalid addresses", () => {
    expect(src).toContain("invalidAddrRows.length > 0");
  });

  it("renders a role=alert error for the zero address", () => {
    expect(src).toContain("zeroAddrRows.length > 0");
  });
});
