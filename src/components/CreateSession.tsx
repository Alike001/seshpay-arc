/**
 * CreateSession (Create Event tab)
 *
 * Two-step flow: approve USDC allowance, then createSession.
 *
 * After confirmation the real sessionId is extracted from the SessionCreated
 * event log — never from a guessed counter value.
 *
 * Fixes carried forward:
 *  D2 – live USDC balance and allowance; skip approve when covered
 *  D3 – approve error/rejection resets phase so Step 1 is retryable
 *  D7 – resets approve state when connected account changes mid-flow
 *  NEW – gas-reserve advisory (Arc USDC = native gas)
 *  NEW – sessionId from receipt log, shareable link, copy-to-clipboard
 */
import { useState, useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { erc20Abi } from "viem";
import {
  Loader2,
  ExternalLink,
  Info,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Link2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { getUsdc, buildTxExplorerUrl } from "@/onchain-facts";
import { SESSION_SPLIT } from "@/contracts/sessionSplit";
import { ACTIVE_CHAIN_ID } from "@/config";
import {
  parseUsdcSafe,
  formatUsdcDisplay,
  parseOnchainError,
  isGasReserveLow,
  GAS_RESERVE_USDC,
} from "@/utils/format";
import { extractSessionId, buildEventUrl } from "@/utils/eventId";
import { glass } from "@/utils/styles";

export default function CreateSession({ onCreated }: { onCreated: () => void }) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const [host, setHost] = useState("");
  const [hostPayout, setHostPayout] = useState("");
  const [rewardBudget, setRewardBudget] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  // nowAtDeadlineInput: wall-clock unix-seconds at the moment the user last changed
  // the deadline field. Computed in the event handler (not render) to satisfy the
  // react(purity) linter that prohibits Date.now() calls during render.
  const [nowAtDeadlineInput, setNowAtDeadlineInput] = useState<bigint>(0n);
  const [copied, setCopied] = useState(false);

  const usdcFact = getUsdc(ACTIVE_CHAIN_ID)!;
  const wrongChain = chainId !== ACTIVE_CHAIN_ID;
  const isConnected = !!address;

  // ── Live USDC balance ─────────────────────────────────────────────────────
  const { data: rawBalance } = useReadContract({
    address: usdcFact.address as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: isConnected && !wrongChain, refetchInterval: 10_000 },
  });
  const usdcBalance = rawBalance ?? 0n;

  // ── Live USDC allowance ───────────────────────────────────────────────────
  const { data: rawAllowance, refetch: refetchAllowance } = useReadContract({
    address: usdcFact.address as `0x${string}`,
    abi: erc20Abi,
    functionName: "allowance",
    args: [
      address ?? "0x0000000000000000000000000000000000000000",
      SESSION_SPLIT.address,
    ],
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: isConnected && !wrongChain },
  });
  const existingAllowance = rawAllowance ?? 0n;

  // ── Parsed form values ────────────────────────────────────────────────────
  let hostPayoutBig = 0n;
  let rewardBudgetBig = 0n;
  let parseError = "";
  try {
    hostPayoutBig = parseUsdcSafe(hostPayout);
    rewardBudgetBig = parseUsdcSafe(rewardBudget);
  } catch {
    parseError = "Amount has too many decimal places (max 6).";
  }
  const totalDeposit = hostPayoutBig + rewardBudgetBig;
  const deadlineTs = deadlineDate
    ? BigInt(Math.floor(new Date(deadlineDate).getTime() / 1000))
    : 0n;

  const insufficientBalance = isConnected && totalDeposit > 0n && usdcBalance < totalDeposit;
  const gasReserveWarn =
    isConnected && !insufficientBalance && isGasReserveLow(usdcBalance, totalDeposit);

  // If existing allowance already covers the deposit, skip approve
  const allowanceAlreadySufficient = existingAllowance >= totalDeposit && totalDeposit > 0n;

  // Deadline must be at least 5 minutes in the future (F-4).
  // nowAtDeadlineInput is captured in the onChange handler (not render path),
  // so no impure function is called during render.
  const MIN_DEADLINE_OFFSET = 300n; // 5 minutes
  const deadlineTooSoon =
    nowAtDeadlineInput > 0n &&
    deadlineTs > 0n &&
    deadlineTs < nowAtDeadlineInput + MIN_DEADLINE_OFFSET;

  const isValid =
    !parseError &&
    host.startsWith("0x") &&
    host.length === 42 &&
    hostPayoutBig > 0n &&
    deadlineTs > 0n &&
    !deadlineTooSoon &&
    !insufficientBalance;

  // ── Approve tx ───────────────────────────────────────────────────────────
  const {
    writeContract: approve,
    data: approveHash,
    isPending: approving,
    isError: approveError,
    error: approveErr,
    reset: resetApprove,
  } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveHash });

  // Step-1 is done if we just confirmed OR existing allowance already covers it
  const approveSuccess = approveConfirmed || allowanceAlreadySufficient;

  // ── Create tx ────────────────────────────────────────────────────────────
  const {
    writeContract: createSession,
    data: createHash,
    isPending: creating,
    isError: createError,
    error: createErr,
    reset: resetCreate,
  } = useWriteContract();

  // Wait for receipt — we need the full receipt to decode the SessionCreated log
  const { isLoading: createConfirming, isSuccess: createSuccess, data: createReceipt } =
    useWaitForTransactionReceipt({ hash: createHash });

  // Extract the confirmed session ID from the receipt logs
  const confirmedSessionId: bigint | null =
    createSuccess && createReceipt
      ? extractSessionId(createReceipt.logs)
      : null;

  // D7: reset approve state when the connected account changes
  useEffect(() => {
    resetApprove();
    resetCreate();
  }, [address, resetApprove, resetCreate]);

  // Refetch allowance after approval confirms
  useEffect(() => {
    if (approveConfirmed) void refetchAllowance();
  }, [approveConfirmed, refetchAllowance]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleApprove() {
    if (wrongChain) { switchChain({ chainId: ACTIVE_CHAIN_ID }); return; }
    resetApprove();
    approve({
      address: usdcFact.address as `0x${string}`,
      abi: erc20Abi,
      functionName: "approve",
      args: [SESSION_SPLIT.address, totalDeposit],
    });
  }

  function handleCreate() {
    if (wrongChain) { switchChain({ chainId: ACTIVE_CHAIN_ID }); return; }
    createSession({
      address: SESSION_SPLIT.address,
      abi: SESSION_SPLIT.abi,
      functionName: "createSession",
      args: [host as `0x${string}`, hostPayoutBig, rewardBudgetBig, deadlineTs],
    });
  }

  function handleReset() {
    setHost("");
    setHostPayout("");
    setRewardBudget("");
    setDeadlineDate("");
    setNowAtDeadlineInput(0n);
    resetApprove();
    resetCreate();
  }

  async function handleCopyLink() {
    if (!confirmedSessionId) return;
    try {
      await navigator.clipboard.writeText(buildEventUrl(confirmedSessionId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — silent
    }
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (createSuccess) {
    return (
      <div className="rounded-3xl p-6" style={glass.card}>
        <div
          className="mb-5 flex size-10 items-center justify-center rounded-2xl"
          style={{ background: "rgba(26,128,71,0.10)" }}
        >
          <CheckCircle2 className="size-5" style={{ color: "var(--success)" }} />
        </div>

        <h2 className="display text-xl font-bold mb-1" style={{ color: "var(--success)" }}>
          Event created
        </h2>
        <p className="text-sm mb-4 text-pretty" style={{ color: "var(--ink-2)" }}>
          Your USDC is held on-chain. Go to{" "}
          <strong>Pay Contributors</strong> when you're ready to approve payouts.
          Only you — the sponsor — can approve who gets paid and how much.
        </p>

        {/* Confirmed event ID (from receipt log) */}
        <div
          className="rounded-2xl px-4 py-4 mb-4 space-y-3"
          style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}
        >
          {confirmedSessionId !== null ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--subtle)", letterSpacing: "0.07em" }}>
                  Event ID
                </span>
                <span className="display text-2xl font-bold tabular-nums"
                  style={{ color: "var(--ink)" }}>
                  #{confirmedSessionId.toString()}
                </span>
              </div>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                This ID was confirmed from the on-chain transaction receipt. Share it with
                contributors so they can look up their payout.
              </p>

              {/* Shareable link */}
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{ background: "rgba(18,45,69,0.04)", border: "1px solid var(--border)" }}
              >
                <Link2 className="size-3.5 flex-shrink-0" style={{ color: "var(--subtle)" }} />
                <span
                  className="mono text-xs flex-1 truncate select-all"
                  style={{ color: "var(--ink-2)" }}
                >
                  {buildEventUrl(confirmedSessionId)}
                </span>
                <button
                  onClick={() => void handleCopyLink()}
                  className="flex-shrink-0 rounded-lg p-1.5 transition-colors hover:bg-black/5"
                  style={{ color: "var(--subtle)" }}
                  aria-label="Copy shareable link"
                >
                  {copied
                    ? <Check className="size-3.5" style={{ color: "var(--success)" }} />
                    : <Copy className="size-3.5" />}
                </button>
              </div>
            </>
          ) : (
            /* Fallback: log decode failed — the tx still succeeded */
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-4 flex-shrink-0 mt-0.5"
                style={{ color: "var(--muted)" }} />
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Transaction confirmed, but the event ID could not be read from the receipt.
                Check <strong>My Events</strong> to find your event.
              </p>
            </div>
          )}
        </div>

        {/* Transaction receipt link */}
        {createHash && (
          <a
            href={buildTxExplorerUrl(ACTIVE_CHAIN_ID, createHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold mb-5"
            style={{ color: "var(--accent-hover)" }}
          >
            View transaction on ArcScan <ExternalLink className="size-3" />
          </a>
        )}

        {/* CTA row */}
        <div className="flex gap-2">
          {confirmedSessionId !== null && (
            <Link
              to={`/app/events/${confirmedSessionId.toString()}`}
              className="flex-1 rounded-2xl py-3 text-sm font-semibold text-white text-center"
              style={{ background: "var(--accent-hover)" }}
            >
              View event #{confirmedSessionId.toString()}
            </Link>
          )}
          <button
            onClick={() => { handleReset(); onCreated(); }}
            className="flex-1 rounded-2xl py-3 text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            My events
          </button>
          <button
            onClick={handleReset}
            className="rounded-2xl px-4 py-3 text-sm font-semibold"
            style={{ background: "var(--surface-muted)", color: "var(--ink-2)" }}
          >
            New
          </button>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-3xl p-6" style={glass.card}>
      <div className="h-1 w-10 rounded-full mb-5"
        style={{ background: "linear-gradient(90deg,#c4a7e2,#9fc4e8)" }} />
      <h2 className="display text-xl font-bold mb-1" style={{ color: "var(--ink)" }}>
        Create an event
      </h2>
      <p className="text-sm mb-5 text-pretty" style={{ color: "var(--muted)" }}>
        Set a host, define your payout amounts, and choose an approval deadline.
        Funding requires <strong>two wallet confirmations</strong>: first to allow
        the USDC spend, then to create the event and deposit funds.
        Settlement is a single separate transaction when you're ready to pay out.
      </p>

      <div className="space-y-4">
        {/* Host address */}
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider mb-1.5 block"
            style={{ color: "var(--subtle)", letterSpacing: "0.07em" }}>
            Host wallet address
          </span>
          <input
            value={host}
            onChange={(e) => setHost(e.target.value.trim())}
            placeholder="0x..."
            autoComplete="off"
            spellCheck={false}
            className="mono w-full px-3 py-2.5 text-sm outline-none rounded-xl"
            style={{ ...glass.input, color: "var(--ink)" }}
            aria-label="Host wallet address"
          />
          <p className="mt-1 text-xs" style={{ color: "var(--subtle)" }}>
            The host receives their fixed payout the moment you approve.
          </p>
        </label>

        {/* Payout amounts */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider mb-1.5 block"
              style={{ color: "var(--subtle)", letterSpacing: "0.07em" }}>
              Host payout (USDC)
            </span>
            <input
              inputMode="decimal"
              value={hostPayout}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, "");
                if (v === "" || /^\d*\.?\d{0,6}$/.test(v)) setHostPayout(v);
              }}
              placeholder="0.00"
              className="display w-full px-3 py-2.5 text-lg font-bold tabular-nums outline-none rounded-xl"
              style={{ ...glass.input, color: "var(--ink)" }}
              aria-label="Host payout in USDC"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider mb-1.5 block"
              style={{ color: "var(--subtle)", letterSpacing: "0.07em" }}>
              Contributor budget (USDC)
            </span>
            <input
              inputMode="decimal"
              value={rewardBudget}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, "");
                if (v === "" || /^\d*\.?\d{0,6}$/.test(v)) setRewardBudget(v);
              }}
              placeholder="0.00"
              className="display w-full px-3 py-2.5 text-lg font-bold tabular-nums outline-none rounded-xl"
              style={{ ...glass.input, color: "var(--ink)" }}
              aria-label="Contributor reward budget in USDC"
            />
            <p className="mt-1 text-xs" style={{ color: "var(--subtle)" }}>
              Split across up to 5 people. Unused budget returns to you.
            </p>
          </label>
        </div>

        {/* Deadline */}
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider mb-1.5 block"
            style={{ color: "var(--subtle)", letterSpacing: "0.07em" }}>
            Approval deadline
          </span>
          <input
            type="datetime-local"
            value={deadlineDate}
            onChange={(e) => {
              setDeadlineDate(e.target.value);
              // Capture current wall-clock time alongside the deadline value so
              // the F-4 check can compare them without calling Date.now() in render.
              setNowAtDeadlineInput(BigInt(Math.floor(Date.now() / 1000)));
            }}
            className="w-full px-3 py-2.5 text-sm outline-none rounded-xl"
            style={{ ...glass.input, color: "var(--ink)" }}
            aria-label="Approval deadline"
          />
          {deadlineTooSoon && (
            <p className="mt-1 text-xs" style={{ color: "var(--danger)" }} role="alert">
              Deadline must be at least 5 minutes from now. The two-step approval flow
              (allow + create) takes a few minutes — a shorter deadline may expire
              between transactions.
            </p>
          )}
          {!deadlineTooSoon && (
            <p className="mt-1 text-xs" style={{ color: "var(--subtle)" }}>
              You must approve payouts before this time. After it passes, only fund
              recovery is available.
            </p>
          )}
        </label>

        {/* Balance + deposit summary */}
        {isConnected && !wrongChain && totalDeposit > 0n && (
          <div className="rounded-xl px-3 py-3 space-y-1.5" style={glass.inner}>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--subtle)" }}>
                Your USDC balance
              </span>
              <span className="text-xs font-semibold tabular-nums"
                style={{ color: insufficientBalance ? "var(--danger)" : "var(--ink)" }}>
                {formatUsdcDisplay(usdcBalance)} USDC
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--subtle)" }}>
                Total you'll deposit
              </span>
              <span className="text-xs font-bold tabular-nums"
                style={{ color: insufficientBalance ? "var(--danger)" : "var(--ink)" }}>
                {formatUsdcDisplay(totalDeposit)} USDC
              </span>
            </div>
            {allowanceAlreadySufficient && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <CheckCircle2 className="size-3" style={{ color: "var(--success)" }} />
                <span className="text-xs" style={{ color: "var(--success)" }}>
                  Existing allowance covers this deposit — no re-approval needed.
                </span>
              </div>
            )}
            {insufficientBalance && (
              <div className="flex items-start gap-1.5 pt-0.5">
                <AlertTriangle className="size-3 mt-0.5 flex-shrink-0"
                  style={{ color: "var(--danger)" }} />
                <span className="text-xs" style={{ color: "var(--danger)" }}>
                  Insufficient USDC. Use "Get test USDC" in the sidebar to top up.
                </span>
              </div>
            )}
            {/* Arc gas-reserve advisory */}
            {gasReserveWarn && (
              <div className="flex items-start gap-1.5 pt-0.5">
                <AlertTriangle className="size-3 mt-0.5 flex-shrink-0"
                  style={{ color: "#b45309" }} />
                <span className="text-xs" style={{ color: "#b45309" }}>
                  Low gas reserve. On Arc, USDC pays gas. This deposit would leave less than{" "}
                  {formatUsdcDisplay(GAS_RESERVE_USDC)} USDC for transaction fees — top up
                  before continuing.
                </span>
              </div>
            )}
            <div className="flex items-start gap-1.5 pt-0.5">
              <Info className="size-3 mt-0.5 flex-shrink-0"
                style={{ color: "var(--subtle)" }} />
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                No platform fee. Unused contributor budget returns to you at payout time.
              </span>
            </div>
          </div>
        )}

        {parseError && (
          <p className="text-xs" style={{ color: "var(--danger)" }} role="alert">
            {parseError}
          </p>
        )}

        {/* Step 1: Allow spend — hidden if allowance already sufficient */}
        {!approveSuccess && (
          <div className="space-y-2">
            <button
              onClick={handleApprove}
              disabled={!isConnected || !isValid || approving || approveConfirming}
              className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--accent)" }}
              aria-live="polite"
            >
              {!isConnected
                ? "Connect your wallet to continue"
                : wrongChain
                ? "Switch to Arc Testnet"
                : approving
                ? <span className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Confirm in wallet…
                  </span>
                : approveConfirming
                ? <span className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Confirming USDC allowance…
                  </span>
                : "Allow USDC spend — Step 1 of 2"}
            </button>
            {/* D3: approval rejected → show error + retry */}
            {approveError && (
              <p className="text-xs text-center" style={{ color: "var(--danger)" }} role="alert">
                {parseOnchainError(approveErr)}{" "}
                <button
                  onClick={() => resetApprove()}
                  className="underline font-semibold"
                  style={{ color: "var(--accent-hover)" }}
                >
                  Try again
                </button>
              </p>
            )}
          </div>
        )}

        {/* Step 2: Create event */}
        {approveSuccess && (
          <>
            <div
              className="rounded-xl px-3 py-2.5 flex items-center gap-2"
              style={{
                background: "rgba(26,128,71,0.07)",
                border: "1px solid rgba(26,128,71,0.15)",
                borderRadius: "12px",
              }}
            >
              <CheckCircle2 className="size-3.5 flex-shrink-0" style={{ color: "var(--success)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--success)" }}>
                USDC allowance confirmed. Ready to create event.
              </span>
            </div>
            <button
              onClick={handleCreate}
              disabled={!isValid || creating || createConfirming}
              className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--accent)" }}
              aria-live="polite"
            >
              {creating
                ? <span className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Confirm in wallet…
                  </span>
                : createConfirming
                ? <span className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Creating event on-chain…
                  </span>
                : "Create event and deposit USDC — Step 2 of 2"}
            </button>
            {createError && (
              <p className="text-xs text-center" style={{ color: "var(--danger)" }} role="alert">
                {parseOnchainError(createErr)}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
