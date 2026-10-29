/**
 * SettleSession (Pay Contributors tab)
 *
 * Bug fixes applied this turn:
 *  B1 – normaliseSession() from sessionDecode.ts replaces the direct cast
 *       that crashed with "Cannot read properties of undefined (reading
 *       'toLowerCase')" when wagmi returned a positional tuple.
 *  B2 – Reads ?id=N from the URL query string on mount so "Pay Contributors"
 *       links from EventDetail and SessionStatus pre-fill the event ID.
 *       The tab + ID survive refresh because they live in the URL.
 */
import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { Plus, Trash2, Loader2, ExternalLink, Info, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { isAddress } from "viem";
import { SESSION_SPLIT } from "@/contracts/sessionSplit";
import { parseUsdcSafe, formatUsdcDisplay, formatAddress, formatDeadline, isDeadlinePassed, parseOnchainError } from "@/utils/format";
import { buildTxExplorerUrl } from "@/onchain-facts";
import { glass } from "@/utils/styles";
import { normaliseSession, isSponsor } from "@/utils/sessionDecode";
import { ACTIVE_CHAIN_ID } from "@/config";

interface Contributor {
  address: string;
  amount: string;
}

export default function SettleSession() {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Initialise from URL query param ?id=N ──────────────────────────────
  const [sessionId, setSessionId] = useState<string>(() => {
    const qid = searchParams.get("id") ?? "";
    return /^\d+$/.test(qid) && parseInt(qid, 10) > 0 ? qid : "";
  });

  // Keep URL in sync when the user types a new ID manually
  useEffect(() => {
    if (sessionId) {
      setSearchParams((p) => { p.set("id", sessionId); p.set("tab", "pay"); return p; }, { replace: true });
    }
  }, [sessionId, setSearchParams]);

  const [contributors, setContributors] = useState<Contributor[]>([
    { address: "", amount: "" },
  ]);
  const wrongChain = chainId !== ACTIVE_CHAIN_ID;

  // ── Prefetch session state ───────────────────────────────────────────────
  const sessionIdBig = sessionId && /^\d+$/.test(sessionId) ? BigInt(sessionId) : undefined;
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
  const fetchedSession = normaliseSession(sessionRaw);
  const notFound = fetchedSession && fetchedSession.sponsor === "0x0000000000000000000000000000000000000000";
  const sponsorMismatch = !notFound && !isSponsor(fetchedSession, address);
  const notOpen = fetchedSession && !notFound && fetchedSession.state !== 0;
  const deadlinePassed = fetchedSession && !notFound && isDeadlinePassed(fetchedSession.deadline);

  // Sponsor check: show warning only when session loaded AND wallet connected AND not sponsor
  const showNotSponsor = !sessionLoading && fetchedSession && !notFound && address && sponsorMismatch;

  // ── Contributor state ────────────────────────────────────────────────────
  function addContributor() {
    if (contributors.length < 5)
      setContributors([...contributors, { address: "", amount: "" }]);
  }

  function removeContributor(idx: number) {
    setContributors(contributors.filter((_, i) => i !== idx));
  }

  function updateContributor(idx: number, field: keyof Contributor, value: string) {
    const updated = [...contributors];
    updated[idx] = { ...updated[idx], [field]: value };
    setContributors(updated);
  }

  // Rows where both address AND amount are properly filled
  const filledRows = contributors.filter(
    (c) =>
      c.address.startsWith("0x") &&
      c.address.length === 42 &&
      c.amount.trim() !== "" &&
      c.amount.trim() !== "0"
  );

  // Rows with partial data — warn but don't block
  const partialRows = contributors.filter(
    (c) =>
      (c.address !== "" || c.amount !== "") &&
      !filledRows.includes(c)
  );

  // Duplicate address check
  const addresses = filledRows.map((c) => c.address.toLowerCase());
  const hasDuplicates = addresses.length !== new Set(addresses).size;

  // Reject the contract address as a contributor — the original Arc Testnet
  // contract has no withdrawal path; funds would be permanently locked.
  // The hardened mainnet contract enforces this onchain too, but this check
  // catches it before any wallet prompt.
  // Note: this frontend guard cannot prevent direct contract calls.
  const contractAddrRows = filledRows.filter(
    (c) =>
      isAddress(c.address) &&
      c.address.toLowerCase() === SESSION_SPLIT.address.toLowerCase()
  );

  // Total of all filled amounts
  const { totalAmountBig, parseError } = useMemo(() => {
    let total = 0n;
    let err = "";
    try {
      for (const c of filledRows) {
        total += parseUsdcSafe(c.amount);
      }
    } catch {
      err = "An amount has too many decimal places (max 6).";
    }
    return { totalAmountBig: total, parseError: err };
  }, [filledRows]);

  const budgetExceeded =
    fetchedSession && !notFound &&
    totalAmountBig > 0n &&
    totalAmountBig > fetchedSession.rewardBudget;

  // Remaining budget after contributor amounts
  const remainingBudget =
    fetchedSession && !notFound
      ? fetchedSession.rewardBudget - totalAmountBig
      : undefined;

  const isValid =
    sessionId !== "" &&
    /^\d+$/.test(sessionId) &&
    parseInt(sessionId) > 0 &&
    !hasDuplicates &&
    !parseError &&
    !budgetExceeded &&
    !showNotSponsor &&
    !notOpen &&
    !notFound &&
    contractAddrRows.length === 0 &&
    // Fail closed: partial rows must be completed or removed before settlement.
    // Silently excluding partial rows would send a different transaction than
    // the user reviewed — block until every non-empty row is fully filled.
    partialRows.length === 0 &&
    // Fail closed: session must be loaded, exist, be OPEN, and deadline active.
    !sessionLoading &&
    !sessionError &&
    fetchedSession !== null &&
    fetchedSession !== undefined &&
    !deadlinePassed;

  // ── Write tx ─────────────────────────────────────────────────────────────
  const {
    writeContract: settle,
    data: hash,
    isPending,
    isError,
    error,
    reset: resetWrite,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function handleSettle() {
    if (wrongChain) { switchChain({ chainId: ACTIVE_CHAIN_ID }); return; }
    const id = parseInt(sessionId, 10);
    if (isNaN(id) || id <= 0) return;
    if (!isValid) return;

    const addrs = filledRows.map((c) => c.address as `0x${string}`);
    let amounts: bigint[] = [];
    try {
      amounts = filledRows.map((c) => parseUsdcSafe(c.amount));
    } catch {
      return;
    }

    settle({
      address: SESSION_SPLIT.address,
      abi: SESSION_SPLIT.abi,
      functionName: "settle",
      args: [BigInt(id), addrs, amounts],
    });
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (isSuccess && hash && fetchedSession && !notFound) {
    return (
      <div className="rounded-3xl p-6" style={glass.card}>
        <div className="mb-4 flex size-10 items-center justify-center rounded-2xl"
          style={{ background: "rgba(26,128,71,0.10)" }}>
          <CheckCircle2 className="size-5" style={{ color: "var(--success)" }} />
        </div>
        <h2 className="display text-xl font-bold mb-1" style={{ color: "var(--success)" }}>
          Contributors paid
        </h2>
        <p className="text-sm mb-4 text-pretty" style={{ color: "var(--ink-2)" }}>
          Event #{sessionId} is now settled. The host and all approved contributors
          have received their USDC. Any unused contributor budget was returned to
          your wallet in the same transaction.
        </p>

        {/* Receipt */}
        <div className="rounded-xl px-4 py-3 space-y-2 mb-4" style={glass.inner}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: "var(--subtle)", letterSpacing: "0.07em" }}>
            Settlement receipt
          </div>
          <ReceiptRow label="Event" value={`#${sessionId}`} />
          {/* Host always paid first */}
          <ReceiptRow
            label={`Host (${formatAddress(fetchedSession.host)})`}
            value={`${formatUsdcDisplay(fetchedSession.hostPayout)} USDC`}
          />
          {/* Per-contributor breakdown — never aggregate */}
          {filledRows.map((c, i) => (
            <ReceiptRow
              key={i}
              label={`Contributor ${i + 1} (${formatAddress(c.address as `0x${string}`)})`}
              value={`${c.amount} USDC`}
            />
          ))}
          {/* Unused contributor budget returned to sponsor — separate from payouts */}
          {remainingBudget !== undefined && remainingBudget > 0n && (
            <ReceiptRow
              label={`Unused budget → sponsor (${formatAddress(fetchedSession.sponsor)})`}
              value={`${formatUsdcDisplay(remainingBudget)} USDC`}
              accent="var(--muted)"
            />
          )}
          <div className="border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <ReceiptRow
              label="Total distributed"
              value={`${formatUsdcDisplay(fetchedSession.hostPayout + totalAmountBig)} USDC`}
            />
          </div>
          <ReceiptRow label="Status" value="Settled — payouts distributed" accent="var(--success)" />
        </div>

        <a
          href={buildTxExplorerUrl(ACTIVE_CHAIN_ID, hash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold mb-5"
          style={{ color: "var(--accent-hover)" }}
        >
          View transaction on ArcScan <ExternalLink className="size-3" />
        </a>
        <button
          onClick={() => {
            resetWrite();
            setSessionId("");
            setContributors([{ address: "", amount: "" }]);
          }}
          className="mt-2 w-full rounded-2xl py-3 text-sm font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          Pay contributors for another event
        </button>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-3xl p-6" style={glass.card}>
      <div className="h-1 w-10 rounded-full mb-5"
        style={{ background: "linear-gradient(90deg,#9fc4e8,#a5e0d0)" }} />
      <h2 className="display text-xl font-bold mb-1" style={{ color: "var(--ink)" }}>
        Pay contributors
      </h2>
      <p className="text-sm mb-2 text-pretty" style={{ color: "var(--muted)" }}>
        Choose who gets paid and how much. Everything happens in one on-chain
        transaction — the host and all contributors receive USDC simultaneously.
      </p>

      <div className="rounded-xl px-3 py-3 flex items-start gap-2.5 mb-5" style={glass.inner}>
        <Info className="size-3.5 flex-shrink-0 mt-0.5" style={{ color: "var(--accent-hover)" }} />
        <p className="text-xs text-pretty" style={{ color: "var(--muted)" }}>
          Only the original sponsor can approve payouts. Each event can only be
          settled once. Any portion of the contributor budget you don't assign
          is returned to you in the same transaction.
        </p>
      </div>

      <div className="space-y-4">
        {/* ── Event ID ── */}
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
            aria-label="Event ID"
          />
          <p className="mt-1 text-xs" style={{ color: "var(--subtle)" }}>
            Check My Events to find the ID, or open this tab from an event's detail page to auto-fill it.
          </p>
        </label>

        {/* ── Session info panel (loaded from contract) ── */}
        {sessionLoading && sessionId && (
          <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={glass.inner}>
            <RefreshCw className="size-3.5 animate-spin flex-shrink-0" style={{ color: "var(--muted)" }} />
            <p className="text-xs" style={{ color: "var(--muted)" }}>Loading event #{sessionId}…</p>
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

        {fetchedSession && !sessionLoading && !sessionError && sessionId && (
          <div className="rounded-xl p-3 space-y-2" style={glass.inner}>
            <div className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--subtle)", letterSpacing: "0.07em" }}>
              Event #{sessionId} details
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-xs" style={{ color: "var(--subtle)" }}>Sponsor</span>
              <span className="text-xs font-semibold mono text-right" style={{ color: "var(--ink)" }}>
                {formatAddress(fetchedSession.sponsor)}
              </span>
              <span className="text-xs" style={{ color: "var(--subtle)" }}>Host payout</span>
              <span className="text-xs font-semibold tabular-nums text-right" style={{ color: "var(--ink)" }}>
                {formatUsdcDisplay(fetchedSession.hostPayout)} USDC
              </span>
              <span className="text-xs" style={{ color: "var(--subtle)" }}>Contributor budget</span>
              <span className="text-xs font-semibold tabular-nums text-right" style={{ color: "var(--ink)" }}>
                {formatUsdcDisplay(fetchedSession.rewardBudget)} USDC
              </span>
              <span className="text-xs" style={{ color: "var(--subtle)" }}>Deadline</span>
              <span className="text-xs font-semibold text-right"
                style={{ color: isDeadlinePassed(fetchedSession.deadline) ? "var(--danger)" : "var(--ink)" }}>
                {formatDeadline(fetchedSession.deadline)}
                {isDeadlinePassed(fetchedSession.deadline) ? " (passed)" : " (active)"}
              </span>
              <span className="text-xs" style={{ color: "var(--subtle)" }}>State</span>
              <span className="text-xs font-semibold text-right"
                style={{ color: fetchedSession.state === 0 ? "var(--accent-hover)" : "var(--muted)" }}>
                {fetchedSession.state === 0 ? "Open" : fetchedSession.state === 1 ? "Settled" : "Refunded"}
              </span>
            </div>
          </div>
        )}

        {/* ── Validation warnings ── */}
        {notFound && !sessionLoading && sessionId && (
          <WarningPill danger>No event found with ID #{sessionId}.</WarningPill>
        )}
        {showNotSponsor && (
          <WarningPill danger>
            Your connected wallet ({formatAddress(address)}) is not the sponsor of event #{sessionId}.
            Only {formatAddress(fetchedSession.sponsor)} can approve payouts.
          </WarningPill>
        )}
        {notOpen && !notFound && !sessionLoading && (
          <WarningPill danger>
            Event #{sessionId} is already {fetchedSession?.state === 1 ? "settled" : "closed"} and cannot be settled again.
          </WarningPill>
        )}
        {deadlinePassed && !notOpen && !notFound && !sessionLoading && (
          <WarningPill warn>
            The approval deadline for event #{sessionId} has passed. The contract will reject settlement.
            Use Recover Funds to reclaim the deposit instead.
          </WarningPill>
        )}

        {/* ── Budget summary ── */}
        {fetchedSession && !notOpen && !notFound && (
          <div className="rounded-xl px-3 py-2.5 space-y-1" style={glass.inner}>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--subtle)" }}>Available budget</span>
              <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--ink)" }}>
                {formatUsdcDisplay(fetchedSession.rewardBudget)} USDC
              </span>
            </div>
            {totalAmountBig > 0n && (
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--subtle)" }}>Contributor amounts</span>
                <span className="text-xs font-semibold tabular-nums"
                  style={{ color: budgetExceeded ? "var(--danger)" : "var(--ink)" }}>
                  {formatUsdcDisplay(totalAmountBig)} USDC
                </span>
              </div>
            )}
            {remainingBudget !== undefined && totalAmountBig > 0n && !budgetExceeded && (
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--subtle)" }}>Returned to sponsor</span>
                <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--muted)" }}>
                  {formatUsdcDisplay(remainingBudget)} USDC
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Contributor rows ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--subtle)", letterSpacing: "0.07em" }}>
              Contributors ({contributors.length}/5)
            </span>
            {contributors.length < 5 && (
              <button onClick={addContributor}
                className="flex items-center gap-1 text-xs font-semibold"
                style={{ color: "var(--accent-hover)" }}
                aria-label="Add contributor">
                <Plus className="size-3" /> Add contributor
              </button>
            )}
          </div>

          <div className="space-y-2">
            {contributors.map((c, idx) => (
              <div key={idx} className="rounded-xl p-3" style={glass.inner}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold tabular-nums" style={{ color: "var(--subtle)" }}>
                    Contributor {idx + 1}
                  </span>
                  {contributors.length > 1 && (
                    <button onClick={() => removeContributor(idx)}
                      className="ml-auto rounded-lg p-1 transition-colors hover:bg-black/5"
                      style={{ color: "var(--subtle)" }}
                      aria-label={`Remove contributor ${idx + 1}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <input
                  value={c.address}
                  onChange={(e) => updateContributor(idx, "address", e.target.value.trim())}
                  placeholder="0x wallet address"
                  autoComplete="off"
                  spellCheck={false}
                  className="mono w-full px-2.5 py-2 text-xs outline-none rounded-lg mb-2"
                  style={{ ...glass.input, color: "var(--ink)" }}
                  aria-label={`Contributor ${idx + 1} wallet address`}
                />
                <div className="relative">
                  <input
                    inputMode="decimal"
                    value={c.amount}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, "");
                      if (v === "" || /^\d*\.?\d{0,6}$/.test(v))
                        updateContributor(idx, "amount", v);
                    }}
                    placeholder="0.00"
                    className="display w-full px-2.5 py-2 pr-16 text-sm font-bold tabular-nums outline-none rounded-lg"
                    style={{ ...glass.input, color: "var(--ink)" }}
                    aria-label={`Contributor ${idx + 1} USDC amount`}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold"
                    style={{ color: "var(--subtle)" }}>
                    USDC
                  </span>
                </div>
              </div>
            ))}
          </div>

          {partialRows.length > 0 && (
            <p className="mt-2 text-xs font-semibold" style={{ color: "var(--danger)" }} role="alert">
              {partialRows.length === 1
                ? "1 row is incomplete."
                : `${partialRows.length} rows are incomplete.`}{" "}
              Fill both wallet address and amount, or remove the row before settling.
              Settlement is blocked until all rows are complete.
            </p>
          )}

          {contractAddrRows.length > 0 && (
            <p className="mt-2 text-xs font-semibold" style={{ color: "var(--danger)" }} role="alert">
              The contract address cannot be a contributor — funds sent to the
              contract have no withdrawal path and would be permanently locked.
              Remove that row before settling.
            </p>
          )}

          {hasDuplicates && (
            <p className="mt-2 text-xs" style={{ color: "var(--danger)" }} role="alert">
              Two or more contributors share the same address. Each address must be unique.
            </p>
          )}

          {parseError && (
            <p className="mt-2 text-xs" style={{ color: "var(--danger)" }} role="alert">
              {parseError}
            </p>
          )}

          {budgetExceeded && (
            <p className="mt-2 text-xs" style={{ color: "var(--danger)" }} role="alert">
              Total contributor amounts ({formatUsdcDisplay(totalAmountBig)} USDC) exceed the event's
              reward budget ({formatUsdcDisplay(fetchedSession.rewardBudget)} USDC).
            </p>
          )}
        </div>

        {/* ── Pre-transaction review ── */}
        {isValid && filledRows.length > 0 && fetchedSession && (
          <div className="rounded-xl px-3 py-3 space-y-1.5"
            style={{ background: "rgba(16,97,166,0.05)", border: "1px solid rgba(16,97,166,0.10)", borderRadius: "12px" }}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-1"
              style={{ color: "var(--accent-hover)", letterSpacing: "0.07em" }}>
              Transaction preview
            </div>
            <ReceiptRow label="Host payout" value={`${formatUsdcDisplay(fetchedSession.hostPayout)} USDC`} />
            {filledRows.map((c, i) => (
              <ReceiptRow key={i} label={`Contributor ${i + 1}`} value={`${c.amount} USDC → ${formatAddress(c.address as `0x${string}`)}`} />
            ))}
            {remainingBudget !== undefined && remainingBudget > 0n && (
              <ReceiptRow label="Returned to you" value={`${formatUsdcDisplay(remainingBudget)} USDC`} />
            )}
            <div className="pt-1.5 border-t" style={{ borderColor: "rgba(16,97,166,0.12)" }}>
              <ReceiptRow
                label="Total accounted for"
                value={`${formatUsdcDisplay(fetchedSession.hostPayout + totalAmountBig)} USDC`}
              />
            </div>
          </div>
        )}

        <button
          onClick={handleSettle}
          disabled={!address || !isValid || isPending || isConfirming}
          className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--accent)" }}
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
                <Loader2 className="size-4 animate-spin" /> Approving payouts on-chain…
              </span>
            : filledRows.length === 0
            ? "Approve payouts (host only — no contributors)"
            : `Approve payouts (${filledRows.length} contributor${filledRows.length > 1 ? "s" : ""})`}
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

// ── Small presentational helpers ────────────────────────────────────────────

function WarningPill({
  children,
  danger,
  warn: _warn,
}: {
  children: React.ReactNode;
  danger?: boolean;
  warn?: boolean;
}) {
  const bg = danger ? "rgba(186,43,76,0.07)" : "rgba(200,120,0,0.07)";
  const border = danger ? "1px solid rgba(186,43,76,0.15)" : "1px solid rgba(200,120,0,0.18)";
  const color = danger ? "var(--danger)" : "#a05800";
  return (
    <div className="rounded-xl px-3 py-2.5 flex items-start gap-2"
      style={{ background: bg, border, borderRadius: "12px" }}>
      <AlertTriangle className="size-3.5 mt-0.5 flex-shrink-0" style={{ color }} />
      <p className="text-xs" style={{ color: "var(--ink-2)" }}>{children}</p>
    </div>
  );
}

function ReceiptRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs" style={{ color: "var(--subtle)" }}>{label}</span>
      <span className="text-xs font-semibold tabular-nums text-right"
        style={{ color: accent ?? "var(--ink)" }}>
        {value}
      </span>
    </div>
  );
}
