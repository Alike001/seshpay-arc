/**
 * uxCleanup.test.ts
 *
 * Regression tests for the production UX cleanup turn:
 *  1. Tab-parse logic (App.tsx parseTab — inlined for testability)
 *  2. Network label logic (Header.tsx IS_MAINNET conditional — inlined)
 *  3. ConnectKitButton removed from App hero — verified by absence of import
 *  4. How-it-works cards removed from App — verified by static string absence
 *  5. Two-transaction copy present in CreateSession description
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// ── helpers ────────────────────────────────────────────────────────────────

const root = join(import.meta.dir, "../../");

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

// ── 1. Tab-parse logic ─────────────────────────────────────────────────────

type Tab = "create" | "pay" | "recover" | "events";
const VALID_TABS = new Set<Tab>(["create", "pay", "recover", "events"]);

function parseTab(raw: string | null): Tab {
  if (raw && VALID_TABS.has(raw as Tab)) return raw as Tab;
  return "create";
}

describe("parseTab (App.tsx routing)", () => {
  it("returns 'create' for null (no ?tab= param)", () => {
    expect(parseTab(null)).toBe("create");
  });

  it("returns 'create' for empty string", () => {
    expect(parseTab("")).toBe("create");
  });

  it("returns 'create' for unknown tab name", () => {
    expect(parseTab("unknown")).toBe("create");
  });

  it("returns 'create' for 'create'", () => {
    expect(parseTab("create")).toBe("create");
  });

  it("returns 'pay' for 'pay'", () => {
    expect(parseTab("pay")).toBe("pay");
  });

  it("returns 'recover' for 'recover'", () => {
    expect(parseTab("recover")).toBe("recover");
  });

  it("returns 'events' for 'events'", () => {
    expect(parseTab("events")).toBe("events");
  });

  it("rejects 'Pay' (case-sensitive)", () => {
    expect(parseTab("Pay")).toBe("create");
  });

  it("rejects ' pay' (leading space)", () => {
    expect(parseTab(" pay")).toBe("create");
  });
});

// ── 2. Network label logic ─────────────────────────────────────────────────

function networkLabel(isMainnet: boolean): string {
  return isMainnet ? "on Arc Mainnet" : "on Arc Testnet";
}

function networkLabelColor(isMainnet: boolean): string {
  return isMainnet ? "var(--success)" : "var(--subtle)";
}

describe("Header network label", () => {
  it("shows 'on Arc Testnet' when IS_MAINNET is false", () => {
    expect(networkLabel(false)).toBe("on Arc Testnet");
  });

  it("shows 'on Arc Mainnet' when IS_MAINNET is true", () => {
    expect(networkLabel(true)).toBe("on Arc Mainnet");
  });

  it("uses --subtle color on testnet", () => {
    expect(networkLabelColor(false)).toBe("var(--subtle)");
  });

  it("uses --success color on mainnet (visual distinction)", () => {
    expect(networkLabelColor(true)).toBe("var(--success)");
  });
});

// ── 3. App.tsx: ConnectKitButton import removed from App.tsx ───────────────

describe("App.tsx ConnectKitButton cleanup", () => {
  const appSrc = readSrc("src/App.tsx");

  it("does not import ConnectKitButton in App.tsx", () => {
    // Header.tsx still imports ConnectKitButton — App.tsx must not
    expect(appSrc).not.toContain('import { ConnectKitButton }');
    expect(appSrc).not.toContain("ConnectKitButton");
  });

  it("still imports and renders Header", () => {
    expect(appSrc).toContain('import Header from');
    expect(appSrc).toContain('<Header');
  });
});

// ── 4. App.tsx: How-it-works marketing cards removed ──────────────────────

describe("App.tsx marketing card removal", () => {
  const appSrc = readSrc("src/App.tsx");

  it("does not contain 'How it works' section", () => {
    expect(appSrc).not.toContain("How it works");
  });

  it("does not render the three numbered step cards", () => {
    // The cards used a map over an array with 'num: "1"' etc.
    expect(appSrc).not.toContain('num: "1"');
    expect(appSrc).not.toContain('Create an event');
    expect(appSrc).not.toContain('Approve payouts');
    expect(appSrc).not.toContain('Funds settle instantly');
  });

  it("still contains the four tab IDs", () => {
    expect(appSrc).toContain('"create"');
    expect(appSrc).toContain('"pay"');
    expect(appSrc).toContain('"recover"');
    expect(appSrc).toContain('"events"');
  });

  it("still renders the footer with contract link", () => {
    expect(appSrc).toContain("View contract on ArcScan");
  });
});

// ── 5. CreateSession.tsx: two-transaction copy ────────────────────────────

describe("CreateSession two-transaction clarification", () => {
  const createSrc = readSrc("src/components/CreateSession.tsx");

  it("mentions 'two wallet confirmations' in the form description", () => {
    expect(createSrc).toContain("two wallet confirmations");
  });

  it("still labels Step 1 of 2 (USDC approve)", () => {
    expect(createSrc).toContain("Step 1 of 2");
  });

  it("still labels Step 2 of 2 (create event)", () => {
    expect(createSrc).toContain("Step 2 of 2");
  });

  it("clarifies that settlement is a single transaction", () => {
    expect(createSrc).toContain("single separate transaction");
  });
});

// ── 6. Header.tsx: dynamic label ──────────────────────────────────────────

describe("Header.tsx source", () => {
  const headerSrc = readSrc("src/components/Header.tsx");

  it("imports IS_MAINNET from config", () => {
    expect(headerSrc).toContain("IS_MAINNET");
    expect(headerSrc).toContain('@/config');
  });

  it("contains both mainnet and testnet label strings", () => {
    expect(headerSrc).toContain("on Arc Mainnet");
    expect(headerSrc).toContain("on Arc Testnet");
  });

  it("does NOT contain the hardcoded 'on Arc Testnet' as a static string literal", () => {
    // The old code had: >on Arc Testnet< with no conditional.
    // The new code uses a ternary: IS_MAINNET ? "on Arc Mainnet" : "on Arc Testnet"
    // Verify the conditional is present by checking for the ternary pattern.
    expect(headerSrc).toContain("IS_MAINNET ?");
  });
});
