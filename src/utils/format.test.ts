/**
 * Unit tests for format.ts utility functions.
 *
 * Run: bun test src/utils/format.test.ts
 *
 * These are pure-function tests — no wallet, no RPC, no contract needed.
 */
import { describe, it, expect } from "bun:test";
import {
  parseUsdc,
  parseUsdcSafe,
  formatUsdc,
  formatUsdcDisplay,
  formatAddress,
  isDeadlinePassed,
  parseOnchainError,
  isGasReserveLow,
  GAS_RESERVE_USDC,
} from "./format";

// ── parseUsdc ──────────────────────────────────────────────────────────────

describe("parseUsdc", () => {
  it("parses an integer string", () => {
    expect(parseUsdc("1")).toBe(1_000_000n);
  });

  it("parses a two-decimal string", () => {
    expect(parseUsdc("1.50")).toBe(1_500_000n);
  });

  it("parses the maximum six-decimal precision", () => {
    expect(parseUsdc("0.000001")).toBe(1n);
  });

  it("throws on seven-decimal precision (would silently round in the old version)", () => {
    expect(() => parseUsdc("0.0000001")).toThrow();
  });

  it("throws on a non-numeric string", () => {
    expect(() => parseUsdc("abc")).toThrow();
  });

  it("parses large amounts without overflow", () => {
    expect(parseUsdc("1000000")).toBe(1_000_000_000_000n);
  });
});

// ── parseUsdcSafe ──────────────────────────────────────────────────────────

describe("parseUsdcSafe", () => {
  it("returns 0n for empty string", () => {
    expect(parseUsdcSafe("")).toBe(0n);
  });

  it("returns 0n for whitespace", () => {
    expect(parseUsdcSafe("   ")).toBe(0n);
  });

  it("returns 0n for '0'", () => {
    expect(parseUsdcSafe("0")).toBe(0n);
  });

  it("parses a normal value", () => {
    expect(parseUsdcSafe("5.25")).toBe(5_250_000n);
  });

  it("throws on seven decimal places", () => {
    expect(() => parseUsdcSafe("1.1234567")).toThrow();
  });
});

// ── formatUsdc ─────────────────────────────────────────────────────────────

describe("formatUsdc", () => {
  it("formats 1 USDC", () => {
    expect(formatUsdc(1_000_000n)).toBe("1");
  });

  it("formats sub-cent value", () => {
    expect(formatUsdc(1n)).toBe("0.000001");
  });
});

// ── formatUsdcDisplay ──────────────────────────────────────────────────────

describe("formatUsdcDisplay", () => {
  it("shows two decimal places", () => {
    expect(formatUsdcDisplay(1_000_000n)).toBe("1.00");
  });

  it("shows commas for thousands", () => {
    expect(formatUsdcDisplay(1_234_567_000_000n)).toBe("1,234,567.00");
  });

  it("rounds to two decimals", () => {
    // 1.234567 USDC → display as "1.23"
    expect(formatUsdcDisplay(1_234_567n)).toBe("1.23");
  });
});

// ── formatAddress ──────────────────────────────────────────────────────────

describe("formatAddress", () => {
  it("truncates a 42-char address", () => {
    const addr = "0xabcdef1234567890abcdef1234567890abcdef12";
    const result = formatAddress(addr);
    expect(result).toBe("0xabcd…ef12");
  });

  it("handles a short string without crashing", () => {
    expect(() => formatAddress("0x1")).not.toThrow();
  });
});

// ── isDeadlinePassed ───────────────────────────────────────────────────────

describe("isDeadlinePassed", () => {
  it("returns true for a timestamp in the past", () => {
    const past = BigInt(Math.floor(Date.now() / 1000) - 3600);
    expect(isDeadlinePassed(past)).toBe(true);
  });

  it("returns false for a timestamp in the future", () => {
    const future = BigInt(Math.floor(Date.now() / 1000) + 3600);
    expect(isDeadlinePassed(future)).toBe(false);
  });
});

// ── parseOnchainError ──────────────────────────────────────────────────────

describe("parseOnchainError", () => {
  it("handles null input", () => {
    expect(parseOnchainError(null)).toBe("Something went wrong. Please try again.");
  });

  it("maps user rejection", () => {
    expect(parseOnchainError({ message: "User rejected the request." })).toBe(
      "Transaction cancelled."
    );
  });

  it("maps DeadlinePassed from message text", () => {
    expect(parseOnchainError({ message: "execution reverted: DeadlinePassed()" })).toBe(
      "The approval deadline has passed. Payouts are no longer allowed."
    );
  });

  it("maps DeadlineNotPassed from message text", () => {
    expect(parseOnchainError({ message: "execution reverted: DeadlineNotPassed()" })).toBe(
      "The deadline hasn't passed yet. Recovery is only available after it expires."
    );
  });

  it("maps Unauthorized from message text", () => {
    expect(parseOnchainError({ message: "Unauthorized()" })).toBe(
      "Not the event sponsor."
    );
  });

  it("maps DuplicateRecipient from message text", () => {
    expect(parseOnchainError({ message: "DuplicateRecipient()" })).toBe(
      "You entered the same wallet address twice."
    );
  });

  it("maps generic reverted", () => {
    expect(parseOnchainError({ message: "Transaction reverted without a reason string." })).toBe(
      "Transaction failed on-chain. Check the event ID and try again."
    );
  });

  it("maps hex selector for Unauthorized (0x82b42900)", () => {
    expect(
      parseOnchainError({ cause: { data: "0x82b42900" } })
    ).toBe("Not the event sponsor.");
  });

  it("maps hex selector for DeadlinePassed (0x1ab7da6b)", () => {
    expect(
      parseOnchainError({ cause: { data: "0x1ab7da6b" } })
    ).toBe("The approval deadline has passed. Payouts are no longer allowed.");
  });

  it("maps hex selector for DuplicateRecipient (0x4c003a49)", () => {
    expect(
      parseOnchainError({ cause: { data: "0x4c003a49" } })
    ).toBe("You entered the same wallet address twice.");
  });
});

// ── isGasReserveLow ───────────────────────────────────────────────────────
//
// On Arc, USDC IS the native gas token. When a deposit would leave less than
// GAS_RESERVE_USDC in the wallet we show an advisory warning.

describe("isGasReserveLow", () => {
  // GAS_RESERVE_USDC = 500_000n (0.50 USDC)
  it("returns false when balance greatly exceeds deposit + reserve", () => {
    const balance = 100_000_000n;  // 100 USDC
    const deposit = 10_000_000n;   // 10 USDC → leaves 90 USDC
    expect(isGasReserveLow(balance, deposit)).toBe(false);
  });

  it("returns false when balance - deposit == GAS_RESERVE_USDC exactly", () => {
    const deposit = 10_000_000n;
    const balance = deposit + GAS_RESERVE_USDC; // leaves exactly the reserve
    expect(isGasReserveLow(balance, deposit)).toBe(false);
  });

  it("returns true when balance - deposit < GAS_RESERVE_USDC (close to empty)", () => {
    const deposit = 10_000_000n;
    const balance = deposit + GAS_RESERVE_USDC - 1n; // 1 unit under reserve
    expect(isGasReserveLow(balance, deposit)).toBe(true);
  });

  it("returns true when deposit leaves zero remainder", () => {
    const deposit = 10_000_000n;
    const balance = deposit; // exact — no gas at all
    expect(isGasReserveLow(balance, deposit)).toBe(true);
  });

  it("returns false (not low-gas) when balance < deposit (primary insufficient-balance case)", () => {
    // The primary `insufficientBalance` check handles this — isGasReserveLow
    // must not double-trigger for the same condition.
    const deposit = 10_000_000n;
    const balance = deposit - 1n;
    expect(isGasReserveLow(balance, deposit)).toBe(false);
  });

  it("returns false when deposit is zero (nothing deposited)", () => {
    const balance = 50_000_000n;
    const deposit = 0n;
    // balance - 0n = 50 USDC >> reserve → should not warn
    expect(isGasReserveLow(balance, deposit)).toBe(false);
  });

  it("returns true when reserve is tight on a small balance", () => {
    const balance = 1_100_000n;   // 1.10 USDC
    const deposit = 1_000_000n;   // 1.00 USDC → leaves 0.10 USDC < 0.50 reserve
    expect(isGasReserveLow(balance, deposit)).toBe(true);
  });
});

// ── wallet-switch invariant (format.ts has no wallet state, so we test
//    the pure functions used in the account-reset flow) ──────────────────

describe("parseUsdcSafe wallet-switch invariants", () => {
  it("resets gracefully: empty string after wallet switch returns 0n", () => {
    // CreateSession resets all fields to '' on address change.
    // parseUsdcSafe('') must return 0n, not throw.
    expect(parseUsdcSafe("")).toBe(0n);
  });

  it("partial amount from previous wallet does not bleed into new session", () => {
    // Simulates: old wallet typed "5", new wallet connected, field reset to ""
    const beforeReset = parseUsdcSafe("5");
    const afterReset = parseUsdcSafe("");
    expect(beforeReset).toBe(5_000_000n);
    expect(afterReset).toBe(0n);
  });
});

// ── RPC error message handling (parseOnchainError) ────────────────────────

describe("parseOnchainError RPC/network scenarios", () => {
  it("maps a network timeout string to a user-readable message", () => {
    const result = parseOnchainError({ message: "network request timed out" });
    expect(result).toBe("Network error. Please check your connection and try again.");
  });

  it("maps a fetch error to the network message", () => {
    const result = parseOnchainError({ message: "Failed to fetch: timeout" });
    expect(result).toBe("Network error. Please check your connection and try again.");
  });

  it("returns fallback for an opaque RPC error with no known signature", () => {
    const result = parseOnchainError({ message: "Internal JSON-RPC error (code: -32603)" });
    expect(result).toBe("Something went wrong. Please try again.");
  });

  it("maps a reverted message to the generic reverted string", () => {
    const result = parseOnchainError({ message: "execution reverted" });
    expect(result).toBe("Transaction failed on-chain. Check the event ID and try again.");
  });

  it("handles an Error object correctly", () => {
    const err = new Error("User rejected the request.");
    const result = parseOnchainError(err);
    expect(result).toBe("Transaction cancelled.");
  });

  it("handles undefined gracefully", () => {
    const result = parseOnchainError(undefined);
    expect(result).toBe("Something went wrong. Please try again.");
  });
});
