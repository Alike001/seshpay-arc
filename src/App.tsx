/**
 * App.tsx — SeshPay main dashboard (/app)
 *
 * Tab routing change (this turn):
 *  The active tab is now stored in the URL query param ?tab=<id> so that:
 *   - Links from EventDetail (/app?tab=pay&id=1) open the Pay tab with the
 *     event ID pre-filled (SettleSession reads ?id= on mount).
 *   - Links from SessionStatus (/app?tab=recover&id=1) open Recover Funds.
 *   - Refreshing /app?tab=pay&id=1 restores the correct tab and event ID.
 *   - Direct navigation to /app still defaults to the Create Event tab.
 */
import { useAccount } from "wagmi";
import { useSearchParams } from "react-router-dom";
import { IS_MAINNET, ACTIVE_CHAIN_ID } from "@/config";
import { requireChain } from "@/onchain-facts";
import { SESSION_SPLIT } from "@/contracts/sessionSplit";
import Header from "@/components/Header";
import CreateEvent from "@/components/CreateSession";
import PayContributors from "@/components/SettleSession";
import RecoverFunds from "@/components/RefundSession";
import MyEvents from "@/components/SessionStatus";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MainnetPilotBanner from "@/components/MainnetPilotBanner";

type Tab = "create" | "pay" | "recover" | "events";

const TABS: { id: Tab; label: string; shortLabel: string }[] = [
  { id: "create",  label: "Create Event",    shortLabel: "Create"  },
  { id: "pay",     label: "Pay Contributors", shortLabel: "Pay"     },
  { id: "recover", label: "Recover Funds",    shortLabel: "Recover" },
  { id: "events",  label: "My Events",        shortLabel: "Events"  },
];

const VALID_TABS = new Set<Tab>(["create", "pay", "recover", "events"]);

function parseTab(raw: string | null): Tab {
  if (raw && VALID_TABS.has(raw as Tab)) return raw as Tab;
  return "create";
}

export default function App() {
  useAccount(); // keep wagmi subscription alive for child components
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = parseTab(searchParams.get("tab"));

  function setTab(next: Tab) {
    setSearchParams(
      (p) => {
        p.set("tab", next);
        // Clear id when navigating away from pay/recover so the field
        // doesn't carry over to an unrelated action
        if (next !== "pay" && next !== "recover") p.delete("id");
        return p;
      },
      { replace: true }
    );
  }

  return (
    <div className="min-h-dvh" style={{ background: "var(--bg-gradient)" }}>
      {IS_MAINNET && <MainnetPilotBanner />}
      <Header />

      <main className="mx-auto w-full max-w-xl px-4 pt-5 pb-7">

        {/* Tab bar */}
        <div
          className="flex rounded-2xl p-1 mb-5 gap-1"
          style={{
            background: "rgba(255,255,255,0.65)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(18,45,69,0.08)",
          }}
          role="tablist"
          aria-label="SeshPay navigation"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 rounded-xl py-2.5 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2"
              style={{
                background: tab === t.id ? "var(--accent)" : "transparent",
                color: tab === t.id ? "#fff" : "var(--muted)",
                outlineColor: "var(--focus)",
              }}
            >
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.shortLabel}</span>
            </button>
          ))}
        </div>

        {/* Active panel — each tab independently error-bounded */}
        <div role="tabpanel">
          {tab === "create"  && <ErrorBoundary label="Create Event"    resetKey={tab}><CreateEvent onCreated={() => setTab("events")} /></ErrorBoundary>}
          {tab === "pay"     && <ErrorBoundary label="Pay Contributors" resetKey={tab}><PayContributors /></ErrorBoundary>}
          {tab === "recover" && <ErrorBoundary label="Recover Funds"   resetKey={tab}><RecoverFunds /></ErrorBoundary>}
          {tab === "events"  && <ErrorBoundary label="My Events"       resetKey={tab}><MyEvents /></ErrorBoundary>}
        </div>

        {/* Footer */}
        <footer className="mt-8 flex flex-col items-center gap-1.5 text-center">
          {!IS_MAINNET && (
            <p className="text-xs" style={{ color: "var(--subtle)" }}>
              Arc Testnet only — no real funds.
            </p>
          )}
          {IS_MAINNET && (
            <p className="text-xs" style={{ color: "var(--subtle)" }}>
              Arc Mainnet — real USDC. Transactions are irreversible.
            </p>
          )}
          <div className="flex items-center gap-3">
            <a
              href={`${requireChain(ACTIVE_CHAIN_ID).explorerBase}/address/${SESSION_SPLIT.address}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs underline underline-offset-2"
              style={{ color: "var(--accent-hover)" }}
            >
              View contract on ArcScan
            </a>
            <span style={{ color: "var(--border-strong)" }}>·</span>
            <span className="mono text-xs" style={{ color: "var(--subtle)" }}>
              {SESSION_SPLIT.address.slice(0, 6)}…{SESSION_SPLIT.address.slice(-4)}
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}
