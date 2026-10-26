/**
 * sessionDecode.ts
 *
 * Shared session-data normaliser used by SettleSession, RefundSession,
 * SessionStatus, and EventDetail.
 *
 * wagmi's useReadContract / useReadContracts decodes a Solidity struct as a
 * named-field object when the ABI has named fields (our case). However, some
 * RPC nodes or wagmi versions return a positional tuple array instead:
 *   [sponsor, host, hostPayout, rewardBudget, deadline, state]
 *
 * All four components previously cast the result directly to the named-field
 * shape, which caused `s.sponsor.toLowerCase()` to throw when the RPC returned
 * a tuple (s.sponsor === undefined).
 *
 * normaliseSession handles both shapes so callers never see undefined fields.
 * isSponsor wraps the sponsorship check with a typeof guard so it never throws
 * on a malformed or mid-fetch result.
 */

export interface SessionData {
  sponsor:      `0x${string}`;
  host:         `0x${string}`;
  hostPayout:   bigint;
  rewardBudget: bigint;
  deadline:     bigint;
  state:        number;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/**
 * Normalise a wagmi sessions() result to a SessionData object.
 * Accepts:
 *  - undefined / null  → returns undefined
 *  - named-field object → returned as-is
 *  - positional tuple array → mapped by index
 */
export function normaliseSession(raw: unknown): SessionData | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    const a = raw as unknown[];
    return {
      sponsor:      a[0] as `0x${string}`,
      host:         a[1] as `0x${string}`,
      hostPayout:   a[2] as bigint,
      rewardBudget: a[3] as bigint,
      deadline:     a[4] as bigint,
      state:        Number(a[5]),
    };
  }
  return raw as SessionData;
}

/**
 * True iff s.sponsor (string-typed, case-insensitive) equals address.
 * Never throws on undefined session or malformed sponsor field.
 * Fails closed: returns false on any missing/non-string value.
 */
export function isSponsor(
  s: SessionData | undefined,
  address: string | undefined
): boolean {
  const sponsor = s?.sponsor;
  if (typeof sponsor !== "string") return false;
  if (typeof address !== "string") return false;
  return sponsor.toLowerCase() === address.toLowerCase();
}

/**
 * True iff the session is an empty slot (sponsor === zero address).
 * Useful to distinguish "contract returned empty data" from "event not found".
 */
export function isEmptySession(s: SessionData | undefined): boolean {
  return s?.sponsor === ZERO_ADDRESS;
}
