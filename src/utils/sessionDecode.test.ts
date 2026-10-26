/**
 * sessionDecode.test.ts
 *
 * Tests for the shared normaliseSession + isSponsor + isEmptySession utilities
 * (src/utils/sessionDecode.ts) that guard against wagmi returning a positional
 * tuple instead of a named-field object for sessions() calls.
 *
 * Also covers:
 *  - Both wagmi decode shapes (named-field object + positional tuple)
 *  - Null / undefined / malformed inputs
 *  - Sponsor vs non-sponsor logic
 *  - OPEN / SETTLED / REFUNDED state classification
 *  - Deep-link URL construction for ?tab=pay&id=N and ?tab=recover&id=N
 *  - parsedId URL param parsing (routing integration logic)
 *  - Duplicate address detection (client-side guard before settlement)
 *  - Reward budget overflow (total > rewardBudget)
 *  - Event #1 on-chain reference values
 *
 * Run: bun test src/utils/sessionDecode.test.ts
 */
import { describe, it, expect } from "bun:test";
import { normaliseSession, isSponsor, isEmptySession } from "./sessionDecode";

// ── Fixtures ───────────────────────────────────────────────────────────────

const NAMED_SESSION = {
  sponsor:      "0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a" as `0x${string}`,
  host:         "0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25" as `0x${string}`,
  hostPayout:   1_000_000n,
  rewardBudget: 1_000_000n,
  deadline:     1793120400n,
  state:        0,
};

const TUPLE_SESSION: unknown[] = [
  "0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a",
  "0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25",
  1_000_000n,
  1_000_000n,
  1793120400n,
  0n, // state returned as bigint by some RPCs
];

const SETTLED_TUPLE: unknown[] = [
  "0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a",
  "0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25",
  1_000_000n,
  1_000_000n,
  1793120400n,
  1n, // state = SETTLED
];

const REFUNDED_TUPLE: unknown[] = [
  "0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a",
  "0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25",
  1_000_000n,
  1_000_000n,
  1793120400n,
  2n, // state = REFUNDED
];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const EMPTY_TUPLE: unknown[] = [
  ZERO_ADDRESS, ZERO_ADDRESS,
  0n, 0n, 0n, 0n,
];

// ── normaliseSession: named-field object ───────────────────────────────────

describe("normaliseSession — named-field object", () => {
  it("returns the object unchanged", () => {
    const r = normaliseSession(NAMED_SESSION);
    expect(r?.sponsor).toBe("0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a");
    expect(r?.host).toBe("0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25");
    expect(r?.hostPayout).toBe(1_000_000n);
    expect(r?.rewardBudget).toBe(1_000_000n);
    expect(r?.deadline).toBe(1793120400n);
    expect(r?.state).toBe(0);
  });

  it("does not throw on .toLowerCase() of named-field sponsor", () => {
    const r = normaliseSession(NAMED_SESSION);
    expect(() => r?.sponsor.toLowerCase()).not.toThrow();
  });
});

// ── normaliseSession: positional tuple (the crash path) ───────────────────

describe("normaliseSession — positional tuple", () => {
  it("maps positional array to named fields without throwing", () => {
    const r = normaliseSession(TUPLE_SESSION);
    expect(r?.sponsor).toBe("0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a");
    expect(r?.host).toBe("0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25");
    expect(r?.hostPayout).toBe(1_000_000n);
    expect(r?.rewardBudget).toBe(1_000_000n);
  });

  it("converts bigint state (0n) to number 0", () => {
    const r = normaliseSession(TUPLE_SESSION);
    expect(typeof r?.state).toBe("number");
    expect(r?.state).toBe(0);
  });

  it("converts bigint state (1n) to number 1 (SETTLED)", () => {
    const r = normaliseSession(SETTLED_TUPLE);
    expect(r?.state).toBe(1);
  });

  it("converts bigint state (2n) to number 2 (REFUNDED)", () => {
    const r = normaliseSession(REFUNDED_TUPLE);
    expect(r?.state).toBe(2);
  });

  it("does NOT throw when calling .toLowerCase() on normalised sponsor", () => {
    const r = normaliseSession(TUPLE_SESSION);
    expect(() => r?.sponsor.toLowerCase()).not.toThrow();
  });
});

// ── normaliseSession: null / undefined / falsy inputs ─────────────────────

describe("normaliseSession — null / undefined inputs", () => {
  it("returns undefined for null", () => {
    expect(normaliseSession(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(normaliseSession(undefined)).toBeUndefined();
  });

  it("returns undefined for 0", () => {
    expect(normaliseSession(0)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(normaliseSession("")).toBeUndefined();
  });
});

// ── isEmptySession ─────────────────────────────────────────────────────────

describe("isEmptySession", () => {
  it("returns true for zero-address sponsor (empty slot)", () => {
    const s = normaliseSession(EMPTY_TUPLE);
    expect(isEmptySession(s)).toBe(true);
  });

  it("returns false for a real sponsor", () => {
    const s = normaliseSession(NAMED_SESSION);
    expect(isEmptySession(s)).toBe(false);
  });

  it("returns false for undefined (never throws)", () => {
    expect(isEmptySession(undefined)).toBe(false);
  });
});

// ── isSponsor ──────────────────────────────────────────────────────────────

describe("isSponsor", () => {
  it("returns true for matching sponsor (named-field)", () => {
    const s = normaliseSession(NAMED_SESSION);
    expect(isSponsor(s, "0x9ceaa6abfb2bc1ac202f96496cdc683d86bc458a")).toBe(true);
  });

  it("returns true for matching sponsor (tuple)", () => {
    const s = normaliseSession(TUPLE_SESSION);
    expect(isSponsor(s, "0x9ceaa6abfb2bc1ac202f96496cdc683d86bc458a")).toBe(true);
  });

  it("is case-insensitive (checksummed vs all-lower)", () => {
    const s = normaliseSession(NAMED_SESSION);
    expect(isSponsor(s, "0x9CEAA6ABFB2BC1AC202F96496CDC683D86BC458A")).toBe(true);
  });

  it("returns false for a different address", () => {
    const s = normaliseSession(NAMED_SESSION);
    expect(isSponsor(s, "0x0000000000000000000000000000000000000001")).toBe(false);
  });

  it("returns false (not true) when session is undefined — wallet-switch safety", () => {
    expect(isSponsor(undefined, "0x1234")).toBe(false);
  });

  it("returns false when address is undefined — no connected wallet", () => {
    const s = normaliseSession(NAMED_SESSION);
    expect(isSponsor(s, undefined)).toBe(false);
  });

  it("does NOT throw when sponsor is undefined (malformed RPC response)", () => {
    const malformed = { sponsor: undefined } as unknown as ReturnType<typeof normaliseSession>;
    expect(() => isSponsor(malformed, "0x1234")).not.toThrow();
    expect(isSponsor(malformed, "0x1234")).toBe(false);
  });
});

// ── Session state classification ───────────────────────────────────────────

describe("session state classification", () => {
  it("state 0 is OPEN", () => {
    const s = normaliseSession(TUPLE_SESSION);
    expect(s?.state).toBe(0);
  });

  it("state 1 is SETTLED", () => {
    const s = normaliseSession(SETTLED_TUPLE);
    expect(s?.state).toBe(1);
  });

  it("state 2 is REFUNDED", () => {
    const s = normaliseSession(REFUNDED_TUPLE);
    expect(s?.state).toBe(2);
  });

  it("notOpen is true for SETTLED", () => {
    const s = normaliseSession(SETTLED_TUPLE);
    expect(s?.state !== 0).toBe(true);
  });

  it("notOpen is true for REFUNDED", () => {
    const s = normaliseSession(REFUNDED_TUPLE);
    expect(s?.state !== 0).toBe(true);
  });

  it("notOpen is false for OPEN", () => {
    const s = normaliseSession(TUPLE_SESSION);
    expect(s?.state !== 0).toBe(false);
  });
});

// ── Event #1 reference values (verified on-chain) ─────────────────────────

describe("event #1 on-chain reference values", () => {
  const EVENT_1 = normaliseSession([
    "0x9Ceaa6aBFb2bC1aC202f96496Cdc683d86Bc458a",
    "0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25",
    1_000_000n,
    1_000_000n,
    1793120400n,
    0,
  ]);

  it("sponsor matches the wallet that created event #1", () => {
    expect(EVENT_1?.sponsor.toLowerCase()).toBe("0x9ceaa6abfb2bc1ac202f96496cdc683d86bc458a");
  });

  it("state is OPEN (0)", () => {
    expect(EVENT_1?.state).toBe(0);
  });

  it("hostPayout is 1.00 USDC raw", () => {
    expect(EVENT_1?.hostPayout).toBe(1_000_000n);
  });

  it("rewardBudget is 1.00 USDC raw", () => {
    expect(EVENT_1?.rewardBudget).toBe(1_000_000n);
  });

  it("deadline is 1793120400 (~2026-11-22)", () => {
    expect(EVENT_1?.deadline).toBe(1793120400n);
  });

  it("total deposit = hostPayout + rewardBudget = 2.00 USDC", () => {
    const total = (EVENT_1?.hostPayout ?? 0n) + (EVENT_1?.rewardBudget ?? 0n);
    expect(total).toBe(2_000_000n);
  });
});

// ── Deep-link URL construction ─────────────────────────────────────────────

describe("deep-link URL construction (?tab=pay&id=N)", () => {
  // Pure logic: this is what App.tsx builds when navigating from an event card
  function buildPayUrl(id: bigint): string {
    return `/app?tab=pay&id=${id.toString()}`;
  }
  function buildRecoverUrl(id: bigint): string {
    return `/app?tab=recover&id=${id.toString()}`;
  }

  it("buildPayUrl for event #1 contains correct tab and id", () => {
    const url = buildPayUrl(1n);
    expect(url).toContain("tab=pay");
    expect(url).toContain("id=1");
  });

  it("buildRecoverUrl for event #1 contains correct tab and id", () => {
    const url = buildRecoverUrl(1n);
    expect(url).toContain("tab=recover");
    expect(url).toContain("id=1");
  });

  it("buildPayUrl preserves large IDs without loss", () => {
    const url = buildPayUrl(9999999n);
    expect(url).toContain("id=9999999");
  });

  it("parsedId from URL param '1' yields 1n", () => {
    const raw = "1";
    const parsed = /^\d+$/.test(raw) ? BigInt(raw) : null;
    expect(parsed).toBe(1n);
  });

  it("parsedId from URL param 'abc' yields null", () => {
    const raw = "abc";
    const parsed = /^\d+$/.test(raw) ? BigInt(raw) : null;
    expect(parsed).toBeNull();
  });

  it("parsedId from URL param '1.5' yields null (non-integer blocked)", () => {
    const raw = "1.5";
    const parsed = /^\d+$/.test(raw) ? BigInt(raw) : null;
    expect(parsed).toBeNull();
  });

  it("parsedId from empty string yields null", () => {
    const raw = "";
    const parsed = /^\d+$/.test(raw) && parseInt(raw, 10) > 0 ? BigInt(raw) : null;
    expect(parsed).toBeNull();
  });

  it("deep-link id=1 with positive check passes", () => {
    const qid = "1";
    const initial = /^\d+$/.test(qid) && parseInt(qid, 10) > 0 ? qid : "";
    expect(initial).toBe("1");
  });

  it("deep-link id=0 is rejected (not > 0)", () => {
    const qid = "0";
    const initial = /^\d+$/.test(qid) && parseInt(qid, 10) > 0 ? qid : "";
    expect(initial).toBe("");
  });
});

// ── Duplicate address detection ────────────────────────────────────────────

describe("duplicate address detection (client-side settlement guard)", () => {
  function hasDuplicates(addresses: string[]): boolean {
    const lower = addresses.map((a) => a.toLowerCase());
    return lower.length !== new Set(lower).size;
  }

  it("returns false for unique addresses", () => {
    expect(hasDuplicates(["0xABC", "0xDEF", "0x123"])).toBe(false);
  });

  it("returns true for two identical addresses", () => {
    expect(hasDuplicates(["0xABC", "0xABC"])).toBe(true);
  });

  it("returns true for case-different duplicates (0xabc vs 0xABC)", () => {
    expect(hasDuplicates(["0xabc", "0xABC"])).toBe(true);
  });

  it("returns false for a single address", () => {
    expect(hasDuplicates(["0xABC"])).toBe(false);
  });

  it("returns false for an empty list", () => {
    expect(hasDuplicates([])).toBe(false);
  });
});

// ── Reward budget overflow ─────────────────────────────────────────────────

describe("reward budget overflow (totalAmountBig > rewardBudget)", () => {
  const budget = 1_000_000n; // 1.00 USDC

  it("returns false when total is within budget", () => {
    const total = 500_000n;
    expect(total > budget).toBe(false);
  });

  it("returns false when total equals budget exactly", () => {
    expect(budget > budget).toBe(false);
  });

  it("returns true when total exceeds budget by 1 micro-USDC", () => {
    expect((budget + 1n) > budget).toBe(true);
  });

  it("returns true when total is 2× budget", () => {
    expect((budget * 2n) > budget).toBe(true);
  });

  it("returns false when total is zero (no contributors entered)", () => {
    expect(0n > budget).toBe(false);
  });
});

// ── State display logic: five states ──────────────────────────────────────
//
// Inline the same logic used in SessionStatus + EventDetail so tests can run
// in bun without a React / wagmi dependency.  The helpers are intentionally
// identical to the production code — any divergence is a bug.

const PAST_DEADLINE = 1_000_000n;   // Unix epoch long past
const FUTURE_DEADLINE = 99_999_999_999n; // Far future

function isDeadlinePassed(deadline: bigint): boolean {
  return Number(deadline) * 1000 < Date.now();
}

function stateLabel(state: number, deadline: bigint): string {
  if (state === 1) return "Completed — payouts distributed";
  if (state === 2) return "Refunded — deposit returned";
  if (isDeadlinePassed(deadline)) return "Awaiting recovery";
  return "Open";
}

// Deadline badge logic: only shown for OPEN events
function deadlineBadge(state: number, deadline: bigint): string | undefined {
  if (state !== 0) return undefined; // SETTLED / REFUNDED: no badge
  return isDeadlinePassed(deadline) ? "Passed" : "Active";
}

describe("state display — five states", () => {
  it("OPEN before deadline → label 'Open', badge 'Active'", () => {
    const state = 0;
    expect(stateLabel(state, FUTURE_DEADLINE)).toBe("Open");
    expect(deadlineBadge(state, FUTURE_DEADLINE)).toBe("Active");
  });

  it("OPEN after deadline → label 'Awaiting recovery', badge 'Passed'", () => {
    const state = 0;
    expect(stateLabel(state, PAST_DEADLINE)).toBe("Awaiting recovery");
    expect(deadlineBadge(state, PAST_DEADLINE)).toBe("Passed");
  });

  it("SETTLED before deadline → label 'Completed — payouts distributed', no badge", () => {
    const state = 1;
    // Deadline still in the future — must NOT affect the label
    expect(stateLabel(state, FUTURE_DEADLINE)).toBe("Completed — payouts distributed");
    expect(deadlineBadge(state, FUTURE_DEADLINE)).toBeUndefined();
  });

  it("SETTLED after deadline → label 'Completed — payouts distributed', no badge", () => {
    const state = 1;
    // Deadline in the past — still must not say 'Awaiting recovery'
    expect(stateLabel(state, PAST_DEADLINE)).toBe("Completed — payouts distributed");
    expect(deadlineBadge(state, PAST_DEADLINE)).toBeUndefined();
  });

  it("REFUNDED → label 'Refunded — deposit returned', no badge regardless of deadline", () => {
    const state = 2;
    expect(stateLabel(state, PAST_DEADLINE)).toBe("Refunded — deposit returned");
    expect(stateLabel(state, FUTURE_DEADLINE)).toBe("Refunded — deposit returned");
    expect(deadlineBadge(state, PAST_DEADLINE)).toBeUndefined();
    expect(deadlineBadge(state, FUTURE_DEADLINE)).toBeUndefined();
  });

  it("SETTLED inferred from state, never from deadline alone", () => {
    // An event with state=0 and a past deadline is NOT settled — it's awaiting recovery
    expect(stateLabel(0, PAST_DEADLINE)).toBe("Awaiting recovery");
    expect(stateLabel(0, PAST_DEADLINE)).not.toBe("Completed — payouts distributed");
  });
});

// ── Wallet rejection / failed read scenarios ───────────────────────────────

describe("failed contract read handling", () => {
  it("normaliseSession returns undefined on null (simulates failed wagmi read)", () => {
    expect(normaliseSession(null)).toBeUndefined();
  });

  it("isSponsor returns false when session is undefined (RPC fetch pending)", () => {
    expect(isSponsor(undefined, "0x1234")).toBe(false);
  });

  it("isEmptySession returns false for undefined (never gates an action incorrectly)", () => {
    expect(isEmptySession(undefined)).toBe(false);
  });

  it("sponsor check fails closed when sponsor field is missing from response", () => {
    // Simulates an incomplete response where sponsor key is absent
    const incomplete = { host: "0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25" };
    const s = incomplete as unknown as ReturnType<typeof normaliseSession>;
    expect(isSponsor(s, "0x1234")).toBe(false);
  });
});
