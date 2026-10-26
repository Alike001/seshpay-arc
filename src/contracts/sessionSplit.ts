import artifact from "../../contracts/out/SessionSplit.sol/SessionSplit.json";
import { IS_MAINNET } from "@/config";

// ── Deployed contract addresses ───────────────────────────────────────────────
// Testnet address is the live Arc Testnet deployment.
// Mainnet address is intentionally empty — it must not be populated until an
// independently reviewed deployment to Arc Mainnet has actually occurred.
const TESTNET_ADDRESS = "0x0fe8a41346ab7aa30dc183384a85b5e36051713c" as const;
const MAINNET_ADDRESS = "" as const; // ← fill in after mainnet deployment

// Guard: the mainnet build must fail loudly if the address is not set.
if (IS_MAINNET && !MAINNET_ADDRESS) {
  throw new Error(
    "[SeshPay] VITE_NETWORK=mainnet is set but the mainnet contract address " +
    "has not been recorded. Populate MAINNET_ADDRESS in src/contracts/sessionSplit.ts " +
    "with the deployed Arc Mainnet contract address before building the mainnet frontend."
  );
}

export const SESSION_SPLIT_ADDRESS = (
  IS_MAINNET ? MAINNET_ADDRESS : TESTNET_ADDRESS
) as `0x${string}`;

export const SESSION_SPLIT_ABI = artifact.abi;

export const SESSION_SPLIT = {
  address: SESSION_SPLIT_ADDRESS,
  abi: SESSION_SPLIT_ABI,
} as const;

export const SessionState = {
  OPEN: 0,
  SETTLED: 1,
  REFUNDED: 2,
} as const;

export type SessionStateValue = (typeof SessionState)[keyof typeof SessionState];

export interface Session {
  sponsor: `0x${string}`;
  host: `0x${string}`;
  hostPayout: bigint;
  rewardBudget: bigint;
  deadline: bigint;
  state: number;
}

export function decodeSessionState(state: number): string {
  if (state === SessionState.OPEN) return "Open";
  if (state === SessionState.SETTLED) return "Settled";
  if (state === SessionState.REFUNDED) return "Refunded";
  return "Unknown";
}
