/**
 * EventDetail — /app/events/:id
 *
 * Read-only event detail page. Works on refresh, works without a connected
 * wallet. All data is fetched directly from the contract using the ID from
 * the URL param.
 *
 * Sponsor-only actions (Pay Contributors, Recover Funds) are shown as links
 * back to /app — they remain behind wallet-gated components.
 */
import { useParams, Link, useNavigate } from "react-router-dom";
import { useReadContract } from "wagmi";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ArrowLeft,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";
import { SESSION_SPLIT, SessionState } from "@/contracts/sessionSplit";
import { normaliseSession } from "@/utils/sessionDecode";
import { buildAddressExplorerUrl } from "@/onchain-facts";
import {
  formatUsdcDisplay,
  formatDeadline,
  isDeadlinePassed,
} from "@/utils/format";
import { buildEventUrl } from "@/utils/eventId";
import { glass } from "@/utils/styles";
import { ACTIVE_CHAIN_ID } from "@/config";
import { requireChain } from "@/onchain-facts";

const { explorerBase } = requireChain(ACTIVE_CHAIN_ID);
const CONTRACT_EXPLORER = `${explorerBase}/address/${SESSION_SPLIT.address}`;

// ── Helpers ────────────────────────────────────────────────────────────────

function stateLabel(state: number, deadline: bigint): string {
  if (state === SessionState.SETTLED) return "Completed — payouts distributed";
  if (state === SessionState.REFUNDED) return "Refunded — deposit returned";
  // OPEN only: distinguish active vs elapsed
  if (isDeadlinePassed(deadline)) return "Awaiting recovery";
  return "Open";
}

function stateColor(state: number, deadline: bigint): string {
  if (state === SessionState.SETTLED) return "var(--success)";
  if (state === SessionState.REFUNDED) return "var(--muted)";
  if (isDeadlinePassed(deadline)) return "var(--danger)";
  return "var(--accent-hover)";
}

function stateBg(state: number, deadline: bigint): string {
  if (state === SessionState.SETTLED) return "rgba(26,128,71,0.08)";
  if (state === SessionState.REFUNDED) return "rgba(107,101,128,0.08)";
  if (isDeadlinePassed(deadline)) return "rgba(186,43,76,0.08)";
  return "rgba(16,97,166,0.08)";
}

function StateIcon({ state, deadline }: { state: number; deadline: bigint }) {
  if (state === SessionState.SETTLED)
    return <CheckCircle2 className="size-4" />;
  if (state === SessionState.REFUNDED) return <XCircle className="size-4" />;
  if (isDeadlinePassed(deadline))
    return <AlertTriangle className="size-4" />;
  return <Clock className="size-4" />;
}

interface SessionData {
  sponsor: `0x${string}`;
  host: `0x${string}`;
  hostPayout: bigint;
  rewardBudget: bigint;
  deadline: bigint;
  state: number;
}

function Row({
  label,
  value,
  href,
  mono,
}: {
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
}) {
  return (
    <div
      className="flex items-start justify-between gap-4 py-3 border-b last:border-b-0"
      style={{ borderColor: "var(--border)" }}
    >
      <span
        className="text-xs font-medium shrink-0 pt-0.5"
        style={{ color: "var(--subtle)" }}
      >
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={`text-xs font-semibold text-right flex items-center gap-1 ${mono ? "mono" : ""}`}
          style={{ color: "var(--accent-hover)" }}
        >
          {value}
          <ExternalLink className="size-3 flex-shrink-0" />
        </a>
      ) : (
        <span
          className={`text-xs font-semibold text-right ${mono ? "mono" : ""}`}
          style={{ color: "var(--ink)" }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [scopeKey, setScopeKey] = useState(0);
  const [copied, setCopied] = useState(false);

  // Parse and validate the ID from the URL
  const parsedId = id && /^\d+$/.test(id) ? BigInt(id) : null;

  const {
    data: session,
    isLoading,
    isError,
    error: rpcError,
    refetch,
  } = useReadContract(
    parsedId !== null
      ? {
          address: SESSION_SPLIT.address,
          abi: SESSION_SPLIT.abi,
          functionName: "sessions",
          args: [parsedId],
          chainId: ACTIVE_CHAIN_ID,
          scopeKey: `event-detail-${scopeKey}`,
        }
      : undefined
  );

  // Normalise: handles named-field object and positional tuple via shared util
  const s: SessionData | undefined = normaliseSession(session);
  const isEmpty =
    s?.sponsor === "0x0000000000000000000000000000000000000000";
  const hasResult = s && !isEmpty && !isLoading;

  function handleRefresh() {
    setScopeKey((k) => k + 1);
    void refetch();
  }

  async function handleCopyLink() {
    if (!parsedId) return;
    try {
      await navigator.clipboard.writeText(buildEventUrl(parsedId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }

  // ── Invalid ID ──────────────────────────────────────────────────────────
  if (!parsedId) {
    return (
      <PageShell>
        <div
          className="rounded-2xl p-6 text-center"
          style={{
            background: "rgba(186,43,76,0.06)",
            border: "1px solid rgba(186,43,76,0.12)",
          }}
          role="alert"
        >
          <AlertTriangle
            className="size-6 mx-auto mb-3"
            style={{ color: "var(--danger)" }}
          />
          <p
            className="text-sm font-semibold mb-1"
            style={{ color: "var(--ink)" }}
          >
            Invalid event ID
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            "{id}" is not a valid event ID. Event IDs are positive integers.
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <PageShell id={parsedId}>
        <div className="rounded-2xl p-6 text-center" style={glass.inner}>
          <RefreshCw
            className="size-5 mx-auto mb-3 animate-spin"
            style={{ color: "var(--subtle)" }}
          />
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Loading event #{parsedId.toString()}…
          </p>
        </div>
      </PageShell>
    );
  }

  // ── RPC error ────────────────────────────────────────────────────────────
  if (isError) {
    const msg =
      (rpcError as { message?: string })?.message ?? "Unknown RPC error";
    return (
      <PageShell id={parsedId}>
        <div
          className="rounded-2xl p-5"
          style={{
            background: "rgba(186,43,76,0.06)",
            border: "1px solid rgba(186,43,76,0.12)",
          }}
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="size-5 flex-shrink-0 mt-0.5"
              style={{ color: "var(--danger)" }}
            />
            <div>
              <p
                className="text-sm font-semibold mb-1"
                style={{ color: "var(--ink)" }}
              >
                Could not load event
              </p>
              <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
                {msg.includes("network") || msg.includes("fetch")
                  ? "Network error — check your connection and try again."
                  : "The RPC call failed. The node may be temporarily unavailable."}
              </p>
              <button
                onClick={handleRefresh}
                className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                }}
              >
                <RefreshCw className="size-3" /> Retry
              </button>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────
  if (!hasResult) {
    return (
      <PageShell id={parsedId}>
        <div className="rounded-2xl p-6 text-center" style={glass.inner}>
          <p
            className="text-sm font-semibold mb-1"
            style={{ color: "var(--ink-2)" }}
          >
            No event found
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            There's no event #{parsedId.toString()} on this contract. Double-check
            the ID or{" "}
            <Link
              to="/app"
              className="underline"
              style={{ color: "var(--accent-hover)" }}
            >
              search in the app
            </Link>
            .
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Found ────────────────────────────────────────────────────────────────
  const deadlinePassed = isDeadlinePassed(s.deadline);
  const isOpen = s.state === SessionState.OPEN;

  return (
    <PageShell id={parsedId}>
      {/* Status badge + refresh */}
      <div className="flex items-center justify-between mb-5">
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold"
          style={{
            background: stateBg(s.state, s.deadline),
            color: stateColor(s.state, s.deadline),
          }}
        >
          <StateIcon state={s.state} deadline={s.deadline} />
          {stateLabel(s.state, s.deadline)}
        </span>
        <button
          onClick={handleRefresh}
          className="rounded-lg p-1.5 transition-colors hover:bg-black/5"
          style={{ color: "var(--subtle)" }}
          aria-label="Refresh event status"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>

      {/* Amounts */}
      <div
        className="rounded-2xl p-5 mb-4"
        style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}
      >
        <p
          className="text-xs font-semibold uppercase tracking-wider mb-1"
          style={{ color: "var(--subtle)", letterSpacing: "0.07em" }}
        >
          Host payout
        </p>
        <p
          className="display text-3xl font-bold tabular-nums mb-1"
          style={{ color: "var(--ink)" }}
        >
          {formatUsdcDisplay(s.hostPayout)}{" "}
          <span className="text-base font-medium" style={{ color: "var(--subtle)" }}>
            USDC
          </span>
        </p>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Contributor budget:{" "}
          <strong className="tabular-nums">
            {formatUsdcDisplay(s.rewardBudget)} USDC
          </strong>{" "}
          (up to 5 contributors, unused budget returned to sponsor)
        </p>
      </div>

      {/* Details table */}
      <div
        className="rounded-2xl px-4 mb-4"
        style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}
      >
        <Row
          label="Sponsor"
          value={`${s.sponsor.slice(0, 6)}…${s.sponsor.slice(-4)}`}
          href={buildAddressExplorerUrl(ACTIVE_CHAIN_ID, s.sponsor)}
          mono
        />
        <Row
          label="Host"
          value={`${s.host.slice(0, 6)}…${s.host.slice(-4)}`}
          href={buildAddressExplorerUrl(ACTIVE_CHAIN_ID, s.host)}
          mono
        />
        <Row
          label="Approval deadline"
          value={
            s.state === SessionState.OPEN
              ? `${formatDeadline(s.deadline)} ${deadlinePassed ? "(passed)" : "(active)"}`
              : formatDeadline(s.deadline)
          }
        />
        <Row
          label="Contract"
          value="0x0fe8…713c"
          href={CONTRACT_EXPLORER}
          mono
        />
      </div>

      {/* Next-step guidance */}
      {isOpen && !deadlinePassed && (
        <div
          className="rounded-2xl px-4 py-3.5 mb-4 flex items-start gap-3"
          style={{
            background: "rgba(16,97,166,0.06)",
            border: "1px solid rgba(16,97,166,0.10)",
          }}
        >
          <Clock
            className="size-4 flex-shrink-0 mt-0.5"
            style={{ color: "var(--accent-hover)" }}
          />
          <div>
            <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--ink)" }}>
              Waiting for sponsor approval
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Only the sponsor can approve payouts. Payouts are not automatic — the
              sponsor must initiate settlement before the deadline.
            </p>
            <button
              onClick={() => { void navigate(`/app?tab=pay&id=${parsedId.toString()}`); }}
              className="inline-flex items-center gap-1 mt-2 text-xs font-semibold"
              style={{ color: "var(--accent-hover)" }}
            >
              Pay Contributors — event #{parsedId.toString()} →
            </button>
          </div>
        </div>
      )}
      {isOpen && deadlinePassed && (
        <div
          className="rounded-2xl px-4 py-3.5 mb-4 flex items-start gap-3"
          style={{
            background: "rgba(186,43,76,0.06)",
            border: "1px solid rgba(186,43,76,0.10)",
          }}
        >
          <AlertTriangle
            className="size-4 flex-shrink-0 mt-0.5"
            style={{ color: "var(--danger)" }}
          />
          <div>
            <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--ink)" }}>
              Deadline passed — recovery available
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              The approval deadline has passed. The sponsor can now recover their
              full deposit. Payouts are no longer possible.
            </p>
            <button
              onClick={() => { void navigate(`/app?tab=recover&id=${parsedId.toString()}`); }}
              className="inline-flex items-center gap-1 mt-2 text-xs font-semibold"
              style={{ color: "var(--danger)" }}
            >
              Recover Funds — event #{parsedId.toString()} →
            </button>
          </div>
        </div>
      )}

      {/* Shareable link row */}
      <div
        className="rounded-2xl px-4 py-3 flex items-center gap-2"
        style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}
      >
        <span className="text-xs flex-1 truncate mono" style={{ color: "var(--ink-2)" }}>
          {buildEventUrl(parsedId)}
        </span>
        <button
          onClick={() => void handleCopyLink()}
          className="flex-shrink-0 rounded-lg p-1.5 transition-colors hover:bg-black/5"
          style={{ color: "var(--subtle)" }}
          aria-label="Copy shareable link"
        >
          {copied
            ? <Check className="size-4" style={{ color: "var(--success)" }} />
            : <Copy className="size-4" />}
        </button>
      </div>

      {/* ArcScan explorer link */}
      <div className="mt-3 flex justify-center">
        <a
          href={`https://explorer.testnet.arc.io/address/${SESSION_SPLIT.address}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: "var(--accent-hover)" }}
        >
          View contract on ArcScan <ExternalLink className="size-3" />
        </a>
      </div>
    </PageShell>
  );
}

// ── Wrapper ────────────────────────────────────────────────────────────────

function PageShell({
  id,
  children,
}: {
  id?: bigint | null;
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-dvh"
      style={{ background: "var(--bg-gradient)" }}
    >
      {/* Minimal header */}
      <header
        className="sticky top-0 z-30 w-full px-4 py-3"
        style={{
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(18,45,69,0.08)",
        }}
      >
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 focus-visible:outline focus-visible:outline-2 rounded"
            style={{ outlineColor: "var(--focus)" }}
          >
            <div
              className="flex size-7 items-center justify-center rounded-lg select-none"
              style={{ background: "var(--accent)" }}
            >
              <span
                className="display text-[10px] font-bold text-white"
                style={{ letterSpacing: "-0.04em" }}
              >
                SP
              </span>
            </div>
            <span
              className="display text-sm font-bold"
              style={{ color: "var(--ink)", letterSpacing: "-0.03em" }}
            >
              SeshPay
            </span>
          </Link>
          <Link
            to="/app"
            className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-xl px-3 py-2"
            style={{
              background: "var(--surface-muted)",
              color: "var(--ink-2)",
              border: "1px solid var(--border)",
            }}
          >
            <ArrowLeft className="size-3" />
            Back to app
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl px-4 py-7">
        {/* Title */}
        <div className="mb-5">
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: "var(--subtle)", letterSpacing: "0.07em" }}
          >
            Event
          </p>
          <h1
            className="display text-2xl font-bold"
            style={{ color: "var(--ink)", letterSpacing: "-0.03em" }}
          >
            {id !== null && id !== undefined
              ? `#${id.toString()}`
              : "Not found"}
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Live data from the contract. No wallet required to view.
          </p>
        </div>

        {children}
      </main>
    </div>
  );
}
