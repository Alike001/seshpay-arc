/**
 * format.ts — display helpers and safe USDC parsing for SeshPay.
 *
 * IMPORTANT: parseUsdc delegates to parseUnitsExact (from @/onchain-money)
 * which is a pure bigint parser that rejects more fraction digits than the
 * token supports. Do NOT call viem's parseUnits with a user-supplied string
 * directly — it silently drops sub-decimal precision, leading to off-by-one
 * amounts at the six-decimal boundary.
 */
import { formatUnits } from "viem";
import { parseUnitsExact } from "@/onchain-money";

export const USDC_DECIMALS = 6;

/**
 * Convert a raw 6-decimal USDC bigint to a plain decimal string ("1.500000").
 */
export function formatUsdc(raw: bigint): string {
  return formatUnits(raw, USDC_DECIMALS);
}

/**
 * Parse a user-typed USDC string to a 6-decimal bigint.
 * Throws AmountError if the value has more than 6 fractional digits or is
 * not a valid decimal number — never silently rounds.
 */
export function parseUsdc(value: string): bigint {
  return parseUnitsExact(value, USDC_DECIMALS);
}

/**
 * Safe wrapper for component callers: returns 0n on empty/whitespace,
 * throws on an invalid or overprecise value.
 */
export function parseUsdcSafe(value: string): bigint {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "0" || trimmed === "0.") return 0n;
  return parseUnitsExact(trimmed, USDC_DECIMALS);
}

/**
 * Display a raw 6-decimal bigint as "1,234.56" with commas and two decimals.
 */
export function formatUsdcDisplay(raw: bigint): string {
  const n = Number(formatUnits(raw, USDC_DECIMALS));
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatAddress(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatDeadline(ts: bigint): string {
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * Whether the deadline (seconds since epoch, as bigint) has passed.
 * Uses Date.now() which is client-local time. The contract uses block.timestamp,
 * which can differ by up to ~12 seconds. A near-deadline check here is
 * informational only; the contract enforces the real boundary.
 */
export function isDeadlinePassed(ts: bigint): boolean {
  return Date.now() / 1000 > Number(ts);
}

/**
 * Arc-specific gas reserve check.
 *
 * On Arc, USDC is the native gas token — paying gas and depositing USDC draw
 * from the same balance.  We warn (but do not block) when the deposit would
 * leave less than GAS_RESERVE_USDC in the wallet.
 *
 * The reserve is advisory: the contract will still succeed if the wallet has
 * exactly enough USDC to cover the deposit plus the gas cost, but we can't
 * know the exact gas cost ahead of time.  A conservative fixed reserve avoids
 * confusing "insufficient funds for gas" revert messages.
 *
 * 0.50 USDC covers several hundred thousand gas units on Arc Testnet.
 */
export const GAS_RESERVE_USDC = 500_000n; // 0.50 USDC (6 decimals)

/**
 * Returns true when (balance - totalDeposit) < GAS_RESERVE_USDC.
 * If balance < totalDeposit the insufficientBalance check fires first; this
 * is a secondary advisory that only triggers when there IS enough USDC but
 * cutting it close on gas.
 */
export function isGasReserveLow(balance: bigint, totalDeposit: bigint): boolean {
  if (balance < totalDeposit) return false; // primary check covers this
  return balance - totalDeposit < GAS_RESERVE_USDC;
}

/**
 * Map contract revert data / error messages to user-readable strings.
 *
 * Covers:
 *  - wagmi/viem human-readable messages (lowercase)
 *  - Raw 0x custom-error selectors (keccak256 of "ErrorName()")
 */
export function parseOnchainError(error: unknown): string {
  if (!error) return "Something went wrong. Please try again.";

  // Hex selector fallback — viem sometimes surfaces raw revert data
  const data =
    (error as { cause?: { data?: string }; data?: string })?.cause?.data ??
    (error as { data?: string })?.data ??
    "";
  if (typeof data === "string" && data.startsWith("0x") && data.length >= 10) {
    const selector = data.slice(0, 10).toLowerCase();
    const selectorMap: Record<string, string> = {
      // keccak256("Unauthorized()")[0:4]
      "0x82b42900": "Not the event sponsor.",
      // keccak256("InvalidState()")[0:4]
      "0xe2517d3f": "This event is not in the correct state for that action.",
      // keccak256("DeadlinePassed()")[0:4]
      "0x1ab7da6b": "The approval deadline has passed. Payouts are no longer allowed.",
      // keccak256("DeadlineNotPassed()")[0:4]
      "0x8d532742": "The deadline hasn't passed yet. Recovery is only available after it expires.",
      // keccak256("RewardBudgetExceeded()")[0:4]
      "0x6c9d47e8": "Contributor amounts exceed the available budget.",
      // keccak256("DuplicateRecipient()")[0:4]
      "0x4c003a49": "You entered the same wallet address twice.",
      // keccak256("TooManyParticipants()")[0:4]
      "0x6fb5b0e2": "Maximum 5 contributors allowed.",
      // keccak256("LengthMismatch()")[0:4]
      "0xff633a38": "Address and amount counts don't match.",
      // keccak256("ZeroAddress()")[0:4]
      "0xd92e233d": "A wallet address cannot be zero.",
      // keccak256("InvalidAmount()")[0:4]
      "0x2c5211c6": "Amount must be greater than zero.",
      // keccak256("InvalidDeadline()")[0:4]
      "0x4db310c3": "Deadline must be in the future.",
    };
    if (selectorMap[selector]) return selectorMap[selector];
  }

  const msg = (error as { message?: string })?.message?.toLowerCase() ?? "";

  if (msg.includes("user rejected") || msg.includes("rejected the request"))
    return "Transaction cancelled.";
  if (msg.includes("insufficient funds") || msg.includes("exceeds balance"))
    return "Insufficient balance. Make sure you have enough USDC.";
  if (msg.includes("unauthorized"))
    return "Not the event sponsor.";
  if (msg.includes("invalidstate"))
    return "This event is not in the correct state for that action.";
  if (msg.includes("deadlinepassed"))
    return "The approval deadline has passed. Payouts are no longer allowed.";
  if (msg.includes("deadlinenotpassed"))
    return "The deadline hasn't passed yet. Recovery is only available after it expires.";
  if (msg.includes("rewardbudgetexceeded"))
    return "Contributor amounts exceed the available budget.";
  if (msg.includes("duplicaterecipient"))
    return "You entered the same wallet address twice.";
  if (msg.includes("toomanyparticipants"))
    return "Maximum 5 contributors allowed.";
  if (msg.includes("lengthmismatch"))
    return "Address and amount counts don't match.";
  if (msg.includes("zeroaddress"))
    return "A wallet address cannot be zero.";
  if (msg.includes("reverted"))
    return "Transaction failed on-chain. Check the event ID and try again.";
  if (msg.includes("network") || msg.includes("timeout"))
    return "Network error. Please check your connection and try again.";

  return "Something went wrong. Please try again.";
}
