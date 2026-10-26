/**
 * eventId.ts — extract the real sessionId from a createSession receipt.
 *
 * The contract emits:
 *   event SessionCreated(
 *     uint256 indexed sessionId,
 *     address indexed sponsor,
 *     address indexed host,
 *     uint256 hostPayout,
 *     uint256 rewardBudget,
 *     uint256 deadline
 *   );
 *
 * sessionId is the FIRST indexed topic (topics[1]).
 * We parse it from the raw log topics rather than guessing from nextSessionId.
 */
import { decodeEventLog, type Log } from "viem";
import { SESSION_SPLIT } from "@/contracts/sessionSplit";

/** ABI fragment for SessionCreated — typed subset needed for decodeEventLog. */
const SESSION_CREATED_ABI = [
  {
    type: "event",
    name: "SessionCreated",
    inputs: [
      { name: "sessionId",    type: "uint256", indexed: true  },
      { name: "sponsor",      type: "address", indexed: true  },
      { name: "host",         type: "address", indexed: true  },
      { name: "hostPayout",   type: "uint256", indexed: false },
      { name: "rewardBudget", type: "uint256", indexed: false },
      { name: "deadline",     type: "uint256", indexed: false },
    ],
  },
] as const;

/**
 * Extract the sessionId emitted in the SessionCreated event from a receipt.
 *
 * Returns the bigint session ID, or null when:
 *  - the receipt has no logs
 *  - no log matches the SessionCreated topic
 *  - decoding fails (e.g. wrong contract address in receipt)
 *
 * Never throws — callers show a fallback when this returns null.
 */
export function extractSessionId(logs: Log[]): bigint | null {
  const contractAddr = SESSION_SPLIT.address.toLowerCase();
  for (const log of logs) {
    // Filter to logs from our contract
    if (log.address.toLowerCase() !== contractAddr) continue;
    try {
      const decoded = decodeEventLog({
        abi: SESSION_CREATED_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "SessionCreated") {
        return decoded.args.sessionId;
      }
    } catch {
      // wrong event signature — skip
    }
  }
  return null;
}

/**
 * Build the shareable /app/events/:id URL.
 * Uses window.location.origin when available (browser), falls back to
 * a relative path when running outside a browser context (SSR / tests).
 */
export function buildEventUrl(sessionId: bigint): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/app/events/${sessionId.toString()}`;
}
