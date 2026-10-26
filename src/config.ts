/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 *
 * Network selection:
 *   VITE_NETWORK=testnet (default) → Arc Testnet (chainId 5042002)
 *   VITE_NETWORK=mainnet           → Arc Mainnet (chainId 5042)
 *
 * The active chain ID is exported as ACTIVE_CHAIN_ID so action components
 * can import it instead of hardcoding a literal chain ID.
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'

// ── Arc Mainnet chain definition ─────────────────────────────────────────────
// Values sourced from onchain-facts.ts (Arc Studio registry) but defined inline
// here to avoid importing that module at the top level of config.ts — onchain-facts
// transitively imports tracing.ts which references `window` at module load time,
// causing "window is not defined" errors when the test runner (bun) evaluates any
// file whose import graph touches config.ts.
const arcMainnet = {
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.arc.io'] as [string, ...string[]] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://explorer.arc.io' },
  },
  testnet: false,
} as const

// ── Network selection ─────────────────────────────────────────────────────────
export const IS_MAINNET = import.meta.env.VITE_NETWORK === 'mainnet'
const activeChain = IS_MAINNET ? arcMainnet : arcTestnet

/** Chain ID of the currently configured network (5042002 testnet, 5042 mainnet). */
export const ACTIVE_CHAIN_ID: number = activeChain.id

// Pre-register chain RPC URLs so trace events show correct chain names immediately.
// In production import.meta.env.DEV is false, so this branch is dead-code-eliminated
// and tracing.ts never enters the production bundle.
if (import.meta.env.DEV) {
  // Dynamic import keeps the static analysis happy while still being tree-shaken in prod.
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  import('./tracing').then(({ registerChain }) => {
    registerChain(activeChain.id, activeChain.rpcUrls.default.http[0])
  })
}

export const config = createConfig({
  chains: [activeChain, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    // Provide transports for both possible active chains so TypeScript
    // is satisfied regardless of which one is selected at runtime.
    [arcTestnet.id]: http(),
    [arcMainnet.id]: http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
