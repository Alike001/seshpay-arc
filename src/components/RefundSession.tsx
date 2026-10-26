/**
 * RefundSession (Recover Funds tab)
 *
 * Bug fixes applied this turn:
 *  B1 – normaliseSession() from sessionDecode.ts replaces the direct cast
 *       that crashed with "Cannot read properties of undefined (reading
 *       'toLowerCase')" when wagmi returned a positional tuple.
 *  B2 – Reads ?id=N from the URL query string on mount so "Recover Funds"
 *       links from EventDetail and SessionStatus pre-fill the event ID.
 */
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import {
  Loader2,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { SESSION_SPLIT } from "@/contracts/sessionSplit";
import { formatUsdcDisplay, formatAddress, parseOnchainError, isDeadlinePassed } from "@/utils/format";
import { buildTxExplorerUrl } from "@/onchain-facts";
import { glass } from "@/utils/styles";
import { normaliseSession, isSponsor } from "@/utils/sessionDecode";
import { ACTIVE_CHAIN_ID } from "@/config";

export default function RefundSession() {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [searchParams, setSearchParams] = useSearchParams();
  const wrongChain = chainId !== ACTIVE_CHAIN_ID;

  // ── Initialise from URL query param ?id=N ──────────────────────────────
  const [sessionId, setSessionId] = useState<string>(() => {
    const qid = searchParams.get("id") ?? "";
    return /^\d+$/.test(qid) && parseInt(qid, 10) > 0 ? qid : "";
  });

  useEffect(() => {
    if (sessionId) {
      setSearchParams(
        (p) => { p.set("id", sessionId); p.set("tab", "recover"); return p; },
        { replace: true }
      );
    }
  }, [sessionId, setSearchParams]);

  const sessionIdBig =
    sessionId && /^\d+$/.test(sessionId) ? BigInt(sessionId) : undefined;

  // ── Prefetch session state ────────────────────────────────────────────────
  const {
    data: sessionRaw,
    isLoading: sessionLoading,
    isError: sessionError,
    refetch: refetchSession,
  } = useReadContract(
    sessionIdBig
      ? {
          address: SESSION_SPLIT.address,
          abi: SESSION_SPLIT.abi,
          functionName: "sessions",
          args: [sessionIdBig],
          chainId: ACTIVE_CHAIN_ID,
        }
      : undefined
  );

  // Normalise: handles both named-field object and positional tuple
  const s = normaliseSession(sessionRaw);

  const notFound = s && s.sponsor === "0x0000000000000000000000000000000000000000";
  const notSponsor = s && !notFound && address && !isSponsor(s, address);
  const alreadySettled = s && !notFound && s.state === 1;
  const alreadyRefunded = s && !notFound && s.state === 2;
  const deadlineStillActive = s && !notFound && !isDeadlinePassed(s.deadline);
  const eligible =
    s &&
    !notFound &&
    !notSponsor &&
    !alreadySettled &&
    !alreadyRefunded &&
    !deadlineStillActive;

  const totalRefund = s && !notFound ? s.hostPayout + s.rewardBudget : 0n;

  // ── Refund tx ─────────────────────────────────────────────────────────────
  const {
    writeContract: refund,
    data: hash,
    isPending,
    isError,
    error,
    reset: resetWrite,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function handleRefund() {
    if (wrongChain) { switchChain({ chainId: ACTIVE_CHAIN_ID }); return; }
    const id = parseInt(sessionId, 10);
    if (isNaN(id) || id <= 0) return;
    if (!eligible) return; // never fire a tx if checks haven't passed
    refund({
      address: SESSION_SPLIT.address,
      abi: SESSION_SPLIT.abi,
      functionName: "refund",
      args: [BigInt(id)],
    });
  }

  const isValid =
    sessionId !== "" &&
    /^\d+$/.test(sessionId) &&
    parseInt(sessionId) > 0;

  // ── Success ───────────────────────────────────────────────────────────────
  if (isSuccess && hash) {
    return (
      <div className="rounded-3xl p-6" style={glass.card}>
        <div className="mb-4 flex size-10 items-center justify-center rounded-2xl"
          style={{ background: "rgba(26,128,71,0.10)" }}>
          <CheckCircle2 className="size-5" style={{ color: "var(--success)" }} />
        </div>
        <h2 className="display text-xl font-bold mb-1" style={{ color: "var(--success)" }}>
          Funds recovered
        </h2>
        <p className="text-sm mb-4 text-pretty" style={{ color: "var(--ink-2)" }}>
          Your full deposit has been returned to your wallet. This event is now
          closed — no payouts can be made.
        </p>

        {/* Refund receipt */}
        <div className="rounded-xl px-4 py-3 space-y-2 mb-4" style={glass.inner}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: "var(--subtle)", letterSpacing: "0.07em" }}>
            Refund receipt
          </div>
          <RefundReceiptRow label="Event" value={`#${sessionId}`} />
          {s && !notFound && (
            <>
              <RefundReceiptRow
                label="Sponsor"
                value={formatAddress(s.sponsor)}
                mono
              />
              <RefundReceiptRow
                label="Host payout returned"
                value={`${formatUsdcDisplay(s.hostPayout)} USDC`}
              />
              <RefundReceiptRow
                label="Contributor budget returned"
                value={`${formatUsdcDisplay(s.rewardBudget)} USDC`}
              />
              <div className="border-t pt-2" style={{ borderColor: "var(--border)" }}>
                <RefundReceiptRow
                  label="Total returned"
                  value={`${formatUsdcDisplay(totalRefund)} USDC`}
                />
              </div>
            </>
          )}
          <RefundReceiptRow
            label="Status"
            value="Refunded — deposit returned"
            accent="var(--success)"
          />
        </div>

        <a
          href={buildTxExplorerUrl(ACTIVE_CHAIN_ID, hash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold mb-5 block"
          style={{ color: "var(--accent-hover)" }}
        >
          View transaction on ArcScan <ExternalLink className="size-3 inline" />
        </a>
        <button
          onClick={() => { resetWrite(); setSessionId(""); }}
          className="mt-4 w-full rounded-2xl py-3 text-sm font-semibold text-white"
          style={{ background: "var(--danger)" }}
        >
          Done
        </button>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-3xl p-6" style={glass.card}>
      <div className="h-1 w-10 rounded-full mb-5" style={{ background: "var(--danger)" }} />
      <h2 className="display text-xl font-bold mb-1" style={{ color: "var(--ink)" }}>
        Recover funds
      </h2>
      <p className="text-sm mb-5 text-pretty" style={{ color: "var(--muted)" }}>
        If you created an event but never approved payouts, you can recover your
        full deposit once the approval deadline has passed.
      </p>

      {/* Static eligibility conditions */}
      <div className="space-y-2 mb-5">
        <ConditionRow
          icon={<Clock className="size-3.5" />}
          text="The approval deadline must have already passed."
        />
        <ConditionRow
          icon={<ShieldCheck className="size-3.5" />}
          text="Only the original sponsor (you) can recover funds."
        />
        <ConditionRow
          icon={
            <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          }
          text="The event must not have already been settled or recovered."
        />
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider mb-1.5 block"
            style={{ color: "var(--subtle)", letterSpacing: "0.07em" }}>
            Event ID
          </span>
          <input
            inputMode="numeric"
            value={sessionId}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, "");
              setSessionId(v);
              resetWrite();
            }}
            placeholder="e.g. 1"
            className="display w-full px-3 py-2.5 text-lg font-bold tabular-nums outline-none rounded-xl"
            style={{ ...glass.input, color: "var(--ink)" }}
            aria-label="Event ID to recover funds from"
          />
          <p className="mt-1 text-xs" style={{ color: "var(--subtle)" }}>
            Check My Events to find the ID, or open this tab from an event's detail page to auto-fill it.
          </p>
        </label>

        {/* Loading / error while fetching */}
        {sessionLoading && sessionId && (
          <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={glass.inner}>
            <RefreshCw className="size-3.5 animate-spin flex-shrink-0" style={{ color: "var(--muted)" }} />
            <p className="text-xs" style={{ color: "var(--muted)" }}>Checking event status…</p>
          </div>
        )}

        {sessionError && sessionId && !sessionLoading && (
          <div className="rounded-xl px-3 py-2.5 flex items-start gap-2"
            style={{ background: "rgba(186,43,76,0.07)", border: "1px solid rgba(186,43,76,0.15)", borderRadius: "12px" }}>
            <AlertTriangle className="size-3.5 mt-0.5 flex-shrink-0" style={{ color: "var(--danger)" }} />
            <div className="flex-1">
              <p className="text-xs" style={{ color: "var(--danger)" }}>
                Could not load event #{sessionId}. Check your connection and try again.
              </p>
              <button
                onClick={() => void refetchSession()}
                className="mt-1 text-xs font-semibold underline"
                style={{ color: "var(--danger)" }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Eligibility status from on-chain data */}
        {s && !sessionLoading && !sessionError && (
          <>
            {notFound && (
              <StatusPill danger>No event found with ID #{sessionId}.</StatusPill>
            )}
            {notSponsor && !notFound && (
              <StatusPill danger>
                Your connected wallet is not the sponsor of event #{sessionId}. Only
                the original sponsor can recover funds.
              </StatusPill>
            )}
            {alreadySettled && (
              <StatusPill danger>
                Event #{sessionId} was already settled — funds have been paid out.
              </StatusPill>
            )}
            {alreadyRefunded && (
              <StatusPill danger>
                Event #{sessionId} was already recovered — funds were previously returned.
              </StatusPill>
            )}
            {deadlineStillActive && !notFound && !notSponsor && !alreadySettled && !alreadyRefunded && (
              <StatusPill warn>
                The approval deadline hasn't passed yet. Recovery will be available
                after that time. The contract will reject an early refund attempt.
              </StatusPill>
            )}
            {eligible && (
              <div className="rounded-xl px-3 py-3 space-y-1.5"
                style={{ background: "rgba(26,128,71,0.07)", border: "1px solid rgba(26,128,71,0.15)", borderRadius: "12px" }}>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 flex-shrink-0" style={{ color: "var(--success)" }} />
                  <span className="text-xs font-semibold" style={{ color: "var(--success)" }}>
                    Event #{sessionId} is eligible for recovery.
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--subtle)" }}>You will receive</span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: "var(--ink)" }}>
                    {formatUsdcDisplay(totalRefund)} USDC
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        <button
          onClick={handleRefund}
          disabled={
            !address ||
            !isValid ||
            !!notSponsor ||
            !!alreadySettled ||
            !!alreadyRefunded ||
            !!notFound ||
            !!deadlineStillActive ||
            isPending ||
            isConfirming ||
            sessionLoading
          }
          className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--danger)" }}
          aria-live="polite"
        >
          {!address
            ? "Connect your wallet to continue"
            : wrongChain
            ? `Switch to ${import.meta.env.VITE_NETWORK === "mainnet" ? "Arc Mainnet" : "Arc Testnet"}`
            : isPending
            ? <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Confirm in wallet…
              </span>
            : isConfirming
            ? <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Recovering funds…
              </span>
            : eligible
            ? `Recover ${formatUsdcDisplay(totalRefund)} USDC`
            : "Recover my funds"}
        </button>

        {isError && (
          <p className="text-xs text-center" style={{ color: "var(--danger)" }} role="alert">
            {parseOnchainError(error)}
          </p>
        )}
      </div>
    </div>
  );
}

function ConditionRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl px-3 py-2.5" style={glass.inner}>
      <span className="mt-0.5 flex-shrink-0" style={{ color: "var(--muted)" }}>
        {icon}
      </span>
      <p className="text-xs" style={{ color: "var(--ink-2)" }}>{text}</p>
    </div>
  );
}

function RefundReceiptRow({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string;
  accent?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs" style={{ color: "var(--subtle)" }}>{label}</span>
      <span className={`text-xs font-semibold tabular-nums text-right${mono ? " mono" : ""}`}
        style={{ color: accent ?? "var(--ink)" }}>
        {value}
      </span>
    </div>
  );
}

function StatusPill({
  children,
  danger,
  warn,
}: {
  children: React.ReactNode;
  danger?: boolean;
  warn?: boolean;
}) {
  const bg = danger
    ? "rgba(186,43,76,0.07)"
    : warn
    ? "rgba(200,120,0,0.07)"
    : "rgba(26,128,71,0.07)";
  const border = danger
    ? "1px solid rgba(186,43,76,0.15)"
    : warn
    ? "1px solid rgba(200,120,0,0.18)"
    : "1px solid rgba(26,128,71,0.15)";
  const color = danger ? "var(--danger)" : warn ? "#a05800" : "var(--success)";

  return (
    <div
      className="rounded-xl px-3 py-2.5 flex items-start gap-2"
      style={{ background: bg, border, borderRadius: "12px" }}
    >
      <AlertTriangle className="size-3.5 mt-0.5 flex-shrink-0" style={{ color }} />
      <p className="text-xs" style={{ color: "var(--ink-2)" }}>{children}</p>
    </div>
  );
}
