/**
 * Unit tests for eventId.ts — extractSessionId and buildEventUrl.
 *
 * Tests cover:
 *  - Normal happy-path extraction from a real-shaped log
 *  - Empty logs array
 *  - Log from a different contract address (must be ignored)
 *  - Log with correct address but wrong event signature (must be ignored)
 *  - Log topics truncated (must not throw, must return null)
 *  - Multiple logs where only one matches
 *  - buildEventUrl produces a correct URL shape
 */
import { describe, it, expect } from "bun:test";
import { extractSessionId, buildEventUrl } from "./eventId";
import { keccak256, toHex, encodeAbiParameters, parseAbiParameters } from "viem";
import type { Log } from "viem";

// ── Fixtures ────────────────────────────────────────────────────────────────

const CONTRACT_ADDR = "0x0fe8a41346ab7aa30dc183384a85b5e36051713c";
const OTHER_ADDR = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const SPONSOR = "0x1111111111111111111111111111111111111111";
const HOST = "0x2222222222222222222222222222222222222222";

/**
 * The SessionCreated event signature topic:
 *   keccak256("SessionCreated(uint256,address,address,uint256,uint256,uint256)")
 */
const SESSION_CREATED_TOPIC = keccak256(
  toHex("SessionCreated(uint256,address,address,uint256,uint256,uint256)")
);

/**
 * Build a realistic Log for SessionCreated.
 * sessionId is indexed → topics[1]
 * sponsor   is indexed → topics[2]
 * host      is indexed → topics[3]
 * hostPayout, rewardBudget, deadline → data
 */
function makeSessionCreatedLog(
  sessionId: bigint,
  overrides?: Partial<Log>
): Log {
  // Encode topics (indexed params) as 32-byte hex values
  const sessionIdTopic = `0x${sessionId.toString(16).padStart(64, "0")}`;
  const sponsorTopic = `0x${SPONSOR.slice(2).padStart(64, "0")}`;
  const hostTopic = `0x${HOST.slice(2).padStart(64, "0")}`;

  // Encode non-indexed params as ABI data
  const data = encodeAbiParameters(
    parseAbiParameters("uint256 hostPayout, uint256 rewardBudget, uint256 deadline"),
    [10_000_000n, 5_000_000n, BigInt(Math.floor(Date.now() / 1000) + 3600)]
  );

  return {
    address: CONTRACT_ADDR,
    topics: [SESSION_CREATED_TOPIC, sessionIdTopic, sponsorTopic, hostTopic],
    data,
    blockNumber: 1n,
    blockHash: "0xabc",
    transactionHash: "0xdef",
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
    ...overrides,
  };
}

// ── extractSessionId ──────────────────────────────────────────────────────

describe("extractSessionId", () => {
  it("returns the correct sessionId from a well-formed log", () => {
    const log = makeSessionCreatedLog(42n);
    const result = extractSessionId([log]);
    expect(result).toBe(42n);
  });

  it("returns 1n for sessionId = 1", () => {
    const log = makeSessionCreatedLog(1n);
    expect(extractSessionId([log])).toBe(1n);
  });

  it("returns a large sessionId correctly", () => {
    const log = makeSessionCreatedLog(9999n);
    expect(extractSessionId([log])).toBe(9999n);
  });

  it("returns null for empty logs array", () => {
    expect(extractSessionId([])).toBeNull();
  });

  it("ignores logs from a different contract address", () => {
    const log = makeSessionCreatedLog(7n, {
      address: OTHER_ADDR,
    });
    expect(extractSessionId([log])).toBeNull();
  });

  it("ignores logs with the correct address but wrong event signature", () => {
    const log = makeSessionCreatedLog(7n);
    // Replace the topic[0] with a different signature
    const wrongTopicLog: Log = {
      ...log,
      topics: [
        keccak256(toHex("SomeOtherEvent(uint256)")),
        log.topics[1]!,
        log.topics[2]!,
        log.topics[3]!,
      ],
    };
    expect(extractSessionId([wrongTopicLog])).toBeNull();
  });

  it("returns null when topics are empty (malformed log)", () => {
    const log = makeSessionCreatedLog(7n);
    const malformed: Log = { ...log, topics: [] };
    expect(extractSessionId([malformed])).toBeNull();
  });

  it("returns null when topics has only the signature (no indexed args)", () => {
    const log = makeSessionCreatedLog(7n);
    const malformed: Log = { ...log, topics: [log.topics[0]!] };
    expect(extractSessionId([malformed])).toBeNull();
  });

  it("picks the matching log when multiple logs are present", () => {
    // First log: unrelated ERC-20 Transfer from the contract
    const transferTopic = keccak256(toHex("Transfer(address,address,uint256)"));
    const unrelated: Log = {
      ...makeSessionCreatedLog(99n),
      topics: [transferTopic, `0x${"0".repeat(64)}`, `0x${"0".repeat(64)}`],
    };
    const sessionLog = makeSessionCreatedLog(15n);
    expect(extractSessionId([unrelated, sessionLog])).toBe(15n);
  });

  it("returns the first matching log when there are multiple SessionCreated logs", () => {
    // Shouldn't happen in practice but the function must be deterministic
    const log1 = makeSessionCreatedLog(10n);
    const log2 = makeSessionCreatedLog(11n);
    // Both from the same contract — we expect the first one found
    expect(extractSessionId([log1, log2])).toBe(10n);
  });
});

// ── buildEventUrl ─────────────────────────────────────────────────────────

describe("buildEventUrl", () => {
  // In bun test (non-browser), window is undefined so origin is "".
  // We test the path shape, not the full URL, so tests pass in both envs.

  it("produces a path ending in /app/events/<id>", () => {
    const url = buildEventUrl(42n);
    expect(url).toMatch(/\/app\/events\/42$/);
  });

  it("contains the event ID in the path", () => {
    const url = buildEventUrl(1n);
    expect(url).toContain("/app/events/1");
  });

  it("handles a large bigint ID without losing precision", () => {
    const big = 10_000_000n;
    const url = buildEventUrl(big);
    expect(url).toContain("/app/events/10000000");
  });
});
