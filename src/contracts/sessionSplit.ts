import artifact from "../../contracts/out/SessionSplit.sol/SessionSplit.json";
import { IS_MAINNET } from "@/config";

// ── Deployed contract addresses ───────────────────────────────────────────────
// TESTNET_ADDRESS: live Arc Testnet deployment (preserved, do not change).
// MAINNET_ADDRESS: verified Arc Mainnet deployment (2026-10-30).
//   Chain ID: 5042 | Deploy tx: 0x78fcb1fadb4d888c3f979a3ecee9dc093d2346c615cc1429b226d9b18e3b136b
//   Block: 28629917 | Runtime SHA-256: e2ba445af6cb74d98bb791c1f3ef3aad27ed8291ffc2f6298e4e20202ae6c46d
//   Bytecode matches hardened release artifact exactly (ContractAddress() guards included).
//   This is an unaudited mainnet pilot — no independent professional audit has been completed.
const TESTNET_ADDRESS = "0x0fe8a41346ab7aa30dc183384a85b5e36051713c" as const;
const MAINNET_ADDRESS = "0xd02bc329d5cfe93e841ea2c925520ef864621c4c" as const;

// Guard retained for safety: will never fire in practice now that MAINNET_ADDRESS is set,
// but protects against accidental erasure of the address in a future edit.
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
