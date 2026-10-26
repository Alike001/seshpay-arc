/**
 * SessionStatus (My Events tab)
 *
 * Defects fixed:
 *  D6 – "My events" mode reads nextSessionId from the contract, then fetches
 *       each session ID sequentially and filters by sponsor === connectedWallet.
 *       This is O(n) RPC calls, capped at MAX_SCAN (50) to avoid runaway fetches
 *       on a busy contract. A clear limitation note explains the cap.
 *       The ID-lookup mode is preserved for direct access.
 */
import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  User,
  ExternalLink,
} from "lucide-react";
import { SESSION_SPLIT } from "@/contracts/sessionSplit";
import {
  formatUsdcDisplay,
  formatAddress,
  formatDeadline,
  isDeadlinePassed,
} from "@/utils/format";
import { glass } from "@/utils/styles";
import { normaliseSession } from "@/utils/sessionDecode";
import { ACTIVE_CHAIN_ID } from "@/config";
const MAX_SCAN = 50; // max sessions to scan for "My events" mode

interface SessionData {
  sponsor: `0x${string}`;
  host: `0x${string}`;
  hostPayout: bigint;
  rewardBudget: bigint;
  deadline: bigint;
  state: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function stateColor(state: number, deadline: bigint): string {
  if (state === 1) return "var(--success)";
  if (state === 2) return "var(--muted)";
  // OPEN: distinguish active vs deadline-passed
  if (isDeadlinePassed(deadline)) return "var(--danger)";
  return "var(--accent-hover)";
}

function stateBg(state: number, deadline: bigint): string {
  if (state === 1) return "rgba(26,128,71,0.08)";
  if (state === 2) return "rgba(107,101,128,0.08)";
  if (isDeadlinePassed(deadline)) return "rgba(186,43,76,0.08)";
  return "rgba(16,97,166,0.08)";
}

function StateIcon({ state, deadline }: { state: number; deadline: bigint }) {
  if (state === 1) return <CheckCircle2 className="size-3.5" />;
  if (state === 2) return <XCircle className="size-3.5" />;
  if (isDeadlinePassed(deadline)) return <AlertTriangle className="size-3.5" />;
  return <Clock className="size-3.5" />;
}

function stateLabel(state: number, deadline: bigint): string {
  if (state === 1) return "Completed — payouts distributed";
  if (state === 2) return "Refunded — deposit returned";
  if (isDeadlinePassed(deadline)) return "Awaiting recovery";
  return "Open";
}

function Row({
  label,
  value,
  mono,
  note,
  noteColor,
}: {
  label: string;
  value: string;
  mono?: boolean;
  note?: string;
  noteColor?: string;
}) {
  return (
    <div
      className="flex items-start justify-between gap-3 py-1.5 border-b last:border-b-0"
      style={{ borderColor: "var(--border)" }}
    >
      <span className="text-xs font-medium shrink-0" style={{ color: "var(--subtle)" }}>
        {label}
      </span>
      <span
        className={`text-xs font-semibold tabular-nums text-right ${mono ? "mono" : ""}`}
        style={{ color: "var(--ink)" }}
      >
        {value}
        {note && (
          <span className="ml-1.5 text-xs font-medium" style={{ color: noteColor }}>
            ({note})
          </span>
        )}
      </span>
    </div>
  );
}

function StatusBadge({ state, deadline }: { state: number; deadline: bigint }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: stateBg(state, deadline), color: stateColor(state, deadline) }}
    >
      <StateIcon state={state} deadline={deadline} />
      {stateLabel(state, deadline)}
    </span>
  );
}

function EventCard({
  id,
  session,
}: {
  id: bigint;
  session: SessionData;
}) {
  const navigate = useNavigate();
  const idStr = id.toString();
  return (
    <div className="rounded-2xl overflow-hidden mb-3" style={glass.inner}>
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: "var(--subtle)" }}>
            Event #{id.toString()}
          </span>
          <StatusBadge state={session.state} deadline={session.deadline} />
        </div>
        <Link
          to={`/app/events/${id.toString()}`}
          className="inline-flex items-center gap-1 text-xs font-semibold"
          style={{ color: "var(--accent-hover)" }}
          aria-label={`View event #${id.toString()} detail page`}
        >
          View <ExternalLink className="size-3" />
        </Link>
      </div>

      <div className="px-4 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <p
          className="text-xs font-semibold uppercase tracking-wider mb-0.5"
          style={{ color: "var(--subtle)", letterSpacing: "0.07em" }}
        >
          Host payout
        </p>
        <p className="display text-2xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>
          {formatUsdcDisplay(session.hostPayout)}{" "}
          <span className="text-base font-medium" style={{ color: "var(--subtle)" }}>
            USDC
          </span>
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
          Contributor budget:{" "}
          <span className="font-semibold tabular-nums">
            {formatUsdcDisplay(session.rewardBudget)} USDC
          </span>
        </p>
      </div>

      <div className="px-4 py-3 space-y-0">
        <Row label="Sponsor" value={formatAddress(session.sponsor)} mono />
        <Row label="Host" value={formatAddress(session.host)} mono />
        <Row
          label="Approval deadline"
          value={formatDeadline(session.deadline)}
          // Only show Active/Passed for OPEN events — settled/refunded events
          // should display the deadline as historical context, not as an action signal.
          note={
            session.state === 0
              ? isDeadlinePassed(session.deadline) ? "Passed" : "Active"
              : undefined
          }
          noteColor={
            session.state === 0
              ? isDeadlinePassed(session.deadline) ? "var(--danger)" : "var(--success)"
              : undefined
          }
        />
      </div>

      {session.state === 0 && !isDeadlinePassed(session.deadline) && (
        <div
          className="mx-4 mb-3 rounded-xl px-3 py-2.5 flex items-center gap-2"
          style={{
            background: "rgba(16,97,166,0.06)",
            border: "1px solid rgba(16,97,166,0.10)",
            borderRadius: "12px",
          }}
        >
          <ArrowRight className="size-3.5 flex-shrink-0" style={{ color: "var(--accent-hover)" }} />
          <p className="text-xs flex-1" style={{ color: "var(--ink-2)" }}>
            Open — approve payouts before the deadline.
          </p>
          <button
            onClick={() => { void navigate(`/app?tab=pay&id=${idStr}`); }}
            className="text-xs font-semibold shrink-0"
            style={{ color: "var(--accent-hover)" }}
          >
            Pay →
          </button>
        </div>
      )}
      {session.state === 0 && isDeadlinePassed(session.deadline) && (
        <div
          className="mx-4 mb-3 rounded-xl px-3 py-2.5 flex items-center gap-2"
          style={{
            background: "rgba(186,43,76,0.06)",
            border: "1px solid rgba(186,43,76,0.10)",
            borderRadius: "12px",
          }}
        >
          <Clock className="size-3.5 flex-shrink-0" style={{ color: "var(--danger)" }} />
          <p className="text-xs flex-1" style={{ color: "var(--ink-2)" }}>
            Deadline passed — recover your deposit.
          </p>
          <button
            onClick={() => { void navigate(`/app?tab=recover&id=${idStr}`); }}
            className="text-xs font-semibold shrink-0"
            style={{ color: "var(--danger)" }}
          >
            Recover →
          </button>
        </div>
      )}
    </div>
  );
}

// ── My-Events wallet scan ──────────────────────────────────────────────────

function MyEventsWalletView({ address }: { address: `0x${string}` }) {
  const [scanKey, setScanKey] = useState(0);

  // Step 1: read nextSessionId so we know the range to scan
  const { data: nextIdData, isLoading: idLoading } = useReadContract({
    address: SESSION_SPLIT.address,
    abi: SESSION_SPLIT.abi,
    functionName: "nextSessionId",
    chainId: ACTIVE_CHAIN_ID,
    // scanKey in scopeKey forces a re-fetch on manual refresh
    scopeKey: `nextSessionId-${scanKey}`,
  });
  const nextId = nextIdData ? Number(nextIdData) : 1;
  const total = nextId - 1; // total sessions created so far

  // Step 2: scan up to MAX_SCAN from the most recent end
  const start = Math.max(1, nextId - MAX_SCAN);
  const idsToFetch = total > 0
    ? Array.from({ length: nextId - start }, (_, i) => BigInt(start + i))
    : [];

  const { data: sessionsRaw, isLoading: sessionsLoading } = useReadContracts({
    contracts: idsToFetch.map((id) => ({
      address: SESSION_SPLIT.address,
      // cast required: wagmi useReadContracts needs the narrower Abi type
      abi: SESSION_SPLIT.abi as import("viem").Abi,
      functionName: "sessions",
      args: [id],
      chainId: ACTIVE_CHAIN_ID,
    })),
    scopeKey: `sessions-scan-${scanKey}`,
    query: { enabled: idsToFetch.length > 0 },
  });

  // Filter to sessions where sponsor matches connected wallet.
  //
  // IMPORTANT: wagmi's useReadContracts decodes Solidity structs as objects
  // with named keys when the ABI includes named fields (our case). However,
  // some RPC nodes or wagmi versions return a positional tuple instead, where
  // result.result is [sponsor, host, hostPayout, rewardBudget, deadline, state].
  // We normalise both shapes here so neither causes a crash.
  const myEvents: { id: bigint; session: SessionData }[] = [];
  if (sessionsRaw) {
    for (let i = 0; i < idsToFetch.length; i++) {
      const result = sessionsRaw[i];
      if (result?.status === "success" && result.result) {
        // Normalise: accept both named-field object and positional tuple
        const raw = result.result;
        const s: SessionData = Array.isArray(raw)
          ? {
              sponsor:      raw[0] as `0x${string}`,
              host:         raw[1] as `0x${string}`,
              hostPayout:   raw[2] as bigint,
              rewardBudget: raw[3] as bigint,
              deadline:     raw[4] as bigint,
              state:        Number(raw[5]),
            }
          : (raw as SessionData);

        // Guard: skip if sponsor is undefined/null (malformed response)
        const sponsor = s?.sponsor;
        if (typeof sponsor === "string" && sponsor.toLowerCase() === address.toLowerCase()) {
          myEvents.push({ id: idsToFetch[i], session: s });
        }
      }
    }
    // Most recent first
    myEvents.reverse();
  }

  const isLoading = idLoading || sessionsLoading;
  // Be explicit when the cap is active — never claim complete history
  const cappedNote =
    total > MAX_SCAN
      ? `Showing your events among the most recent ${MAX_SCAN} of ${total} total. ` +
        `Events created before #${start} are not shown here. Use "Look up by ID" to find older ones.`
      : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <User className="size-4" style={{ color: "var(--subtle)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            Events you sponsored
          </span>
        </div>
        <button
          onClick={() => setScanKey((k) => k + 1)}
          className="rounded-lg p-1.5 transition-colors hover:bg-black/5"
          style={{ color: "var(--subtle)" }}
          aria-label="Refresh my events"
          disabled={isLoading}
        >
          <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {cappedNote && (
        <p className="text-xs mb-3 text-pretty" style={{ color: "var(--muted)" }}>
          {cappedNote}
        </p>
      )}

      {isLoading && (
        <div className="rounded-2xl p-5 text-center" style={glass.inner}>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Scanning for your events…
          </span>
        </div>
      )}

      {!isLoading && myEvents.length === 0 && (
        <div
          className="rounded-2xl p-5 text-center border border-dashed"
          style={{ borderColor: "var(--border)", borderRadius: "16px" }}
        >
          <p className="text-sm font-medium mb-1" style={{ color: "var(--ink-2)" }}>
            No events found
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {total === 0
              ? "No events have been created on this contract yet."
              : "You haven't created any events yet. Create one in the Create Event tab."}
          </p>
        </div>
      )}

      {!isLoading && myEvents.map(({ id, session }) => (
        <EventCard key={id.toString()} id={id} session={session} />
      ))}
    </div>
  );
}

// ── ID lookup view ─────────────────────────────────────────────────────────

function IdLookupView() {
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [lookupId, setLookupId] = useState<bigint | null>(null);

  const { data: session, isLoading, isError, refetch } = useReadContract(
    lookupId !== null
      ? {
          address: SESSION_SPLIT.address,
          abi: SESSION_SPLIT.abi,
          functionName: "sessions",
          args: [lookupId],
          chainId: ACTIVE_CHAIN_ID,
        }
      : undefined
  );

  function handleLookup() {
    const n = parseInt(sessionIdInput, 10);
    if (!isNaN(n) && n > 0) setLookupId(BigInt(n));
  }

  // Normalise named-field object or positional tuple via shared util
  const s = normaliseSession(session);
  const isEmpty = s && s.sponsor === "0x0000000000000000000000000000000000000000";
  const hasResult = s && !isEmpty && !isLoading;

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <label className="sr-only" htmlFor="event-id-input">Event ID</label>
        <input
          id="event-id-input"
          inputMode="numeric"
          value={sessionIdInput}
          onChange={(e) => setSessionIdInput(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && handleLookup()}
          placeholder="Enter event ID"
          className="display flex-1 px-3 py-2.5 text-lg font-bold tabular-nums outline-none rounded-xl"
          style={{ ...glass.input, color: "var(--ink)" }}
        />
        <button
          onClick={handleLookup}
          className="flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-semibold text-white min-w-[48px] min-h-[44px]"
          style={{ background: "var(--accent)" }}
          aria-label="Look up event"
        >
          <Search className="size-4" />
        </button>
      </div>

      {isLoading && (
        <div className="rounded-2xl p-5 text-center" style={glass.inner}>
          <span className="text-sm" style={{ color: "var(--muted)" }}>Loading event…</span>
        </div>
      )}

      {isError && (
        <div
          className="rounded-2xl p-4 text-center"
          style={{ background: "rgba(186,43,76,0.06)", border: "1px solid rgba(186,43,76,0.12)", borderRadius: "16px" }}
          role="alert"
        >
          <span className="text-sm" style={{ color: "var(--danger)" }}>
            Could not load this event. Check the ID and try again.
          </span>
        </div>
      )}

      {hasResult && s && (
        <div>
          <div className="flex justify-end mb-2">
            <button
              onClick={() => void refetch()}
              className="rounded-lg p-1.5 transition-colors hover:bg-black/5"
              style={{ color: "var(--subtle)" }}
              aria-label="Refresh event status"
            >
              <RefreshCw className="size-3.5" />
            </button>
          </div>
          <EventCard id={lookupId!} session={s} />
        </div>
      )}

      {s && isEmpty && !isLoading && (
        <div className="rounded-2xl p-5 text-center" style={glass.inner}>
          <p className="text-sm font-medium mb-1" style={{ color: "var(--ink-2)" }}>No event found</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            There's no event with that ID. Double-check the number and try again.
          </p>
        </div>
      )}

      {lookupId === null && !isLoading && (
        <div
          className="rounded-2xl p-5 text-center border border-dashed"
          style={{ borderColor: "var(--border)", borderRadius: "16px" }}
        >
          <Search className="size-5 mx-auto mb-2" style={{ color: "var(--subtle)" }} />
          <p className="text-sm font-medium mb-1" style={{ color: "var(--ink-2)" }}>
            Enter an event ID above
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            The ID is shown when you create an event and increments with each new one.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function SessionStatus() {
  const { address } = useAccount();
  const [mode, setMode] = useState<"mine" | "lookup">("mine");
  const switchMode = useCallback((m: "mine" | "lookup") => setMode(m), []);

  return (
    <div className="rounded-3xl p-6" style={glass.card}>
      <div className="h-1 w-10 rounded-full mb-5" style={{ background: "var(--accent)" }} />
      <h2 className="display text-xl font-bold mb-1" style={{ color: "var(--ink)" }}>
        My events
      </h2>
      <p className="text-sm mb-4 text-pretty" style={{ color: "var(--muted)" }}>
        View your events or look up any event by ID.
      </p>

      {/* Mode toggle */}
      <div
        className="flex rounded-xl p-0.5 mb-5 gap-0.5"
        style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}
        role="tablist"
      >
        {(["mine", "lookup"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all"
            style={{
              background: mode === m ? "#fff" : "transparent",
              color: mode === m ? "var(--ink)" : "var(--muted)",
              boxShadow: mode === m ? "0 1px 3px rgba(18,45,69,0.10)" : "none",
            }}
          >
            {m === "mine" ? "My events" : "Look up by ID"}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {mode === "mine" && address && <MyEventsWalletView address={address} />}
        {mode === "mine" && !address && (
          <div
            className="rounded-2xl p-5 text-center border border-dashed"
            style={{ borderColor: "var(--border)", borderRadius: "16px" }}
          >
            <User className="size-5 mx-auto mb-2" style={{ color: "var(--subtle)" }} />
            <p className="text-sm font-medium mb-1" style={{ color: "var(--ink-2)" }}>
              Connect your wallet
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Connect to see events you've sponsored.
            </p>
          </div>
        )}
        {mode === "lookup" && <IdLookupView />}
      </div>
    </div>
  );
}
