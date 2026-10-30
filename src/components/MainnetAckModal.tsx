/**
 * MainnetAckModal
 *
 * Shown once per browser session before the first createSession form
 * interaction on mainnet. The user must check all boxes and click
 * "I understand — proceed" before the form becomes interactive.
 *
 * This is frontend guidance only. It does not prevent direct contract
 * calls and does not constitute an onchain limit on deposit size.
 *
 * The acknowledgement is stored in sessionStorage so it persists across
 * tab refreshes within one session but resets when the browser closes.
 */
import { useState, useEffect } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";

const STORAGE_KEY = "seshpay_mainnet_ack_v1";

interface Props {
  /** Called when the user confirms all boxes and clicks proceed. */
  onAcknowledged: () => void;
}

const RISKS = [
  "This contract has not been reviewed by an independent security firm. Real USDC may be lost if the contract contains undiscovered bugs.",
  "Sponsor approval is discretionary. The host and contributors have no recourse inside the contract if the sponsor does not settle before the deadline.",
  "If Circle restricts a recipient address, any transfer to that address will revert the entire settlement or refund transaction, locking all funds indefinitely, potentially permanently.",
  "Any suggested deposit limit is frontend guidance only, not an onchain restriction. The contract accepts any amount the sponsor approves.",
  "Blockchain transactions are irreversible. There is no undo once a transaction is confirmed.",
] as const;

export function isMainnetAcknowledged(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMainnetAcknowledged(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // sessionStorage unavailable — proceed without persisting
  }
}

export default function MainnetAckModal({ onAcknowledged }: Props) {
  const [checked, setChecked] = useState<boolean[]>(RISKS.map(() => false));

  // If already acknowledged this session, call back immediately on mount.
  useEffect(() => {
    if (isMainnetAcknowledged()) onAcknowledged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allChecked = checked.every(Boolean);

  function toggle(i: number) {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  function handleProceed() {
    if (!allChecked) return;
    setMainnetAcknowledged();
    onAcknowledged();
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(18,45,69,0.55)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ack-modal-title"
    >
      {/* Sheet */}
      <div
        className="w-full max-w-md rounded-3xl p-6 overflow-y-auto"
        style={{
          maxHeight: "calc(100dvh - 2rem)",
          background: "rgba(255,255,255,0.97)",
          border: "1px solid rgba(180,82,0,0.25)",
          boxShadow: "0 24px 60px rgba(18,45,69,0.20)",
        }}
      >
        {/* Icon + title */}
        <div className="flex items-start gap-3 mb-4">
          <div
            className="size-9 rounded-xl flex-shrink-0 flex items-center justify-center"
            style={{ background: "rgba(180,82,0,0.10)" }}
          >
            <ShieldAlert className="size-5" style={{ color: "#b45200" }} aria-hidden="true" />
          </div>
          <div>
            <h2
              id="ack-modal-title"
              className="display text-base font-bold leading-snug"
              style={{ color: "#7a3700" }}
            >
              Unaudited mainnet prototype
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "#7a3700", opacity: 0.8 }}>
              Read and confirm each risk before proceeding.
            </p>
          </div>
        </div>

        {/* Risk list */}
        <div className="space-y-3 mb-5">
          {RISKS.map((text, i) => (
            <label
              key={i}
              className="flex items-start gap-3 cursor-pointer rounded-xl p-3 transition-colors"
              style={{
                background: checked[i]
                  ? "rgba(180,82,0,0.06)"
                  : "rgba(18,45,69,0.03)",
                border: "1px solid",
                borderColor: checked[i]
                  ? "rgba(180,82,0,0.22)"
                  : "rgba(18,45,69,0.08)",
              }}
            >
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={() => toggle(i)}
                className="mt-0.5 flex-shrink-0"
                style={{ accentColor: "#b45200", width: 16, height: 16 }}
                aria-label={`Acknowledge risk ${i + 1}`}
              />
              <span className="text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {text}
              </span>
            </label>
          ))}
        </div>

        {/* Disclaimer line */}
        <p
          className="text-xs mb-4 text-center text-pretty"
          style={{ color: "var(--muted)" }}
        >
          This is an experimental pilot. Do not deposit funds you cannot afford to lose.
          An independent professional audit is required before any broader production launch.
        </p>

        {/* CTA */}
        <button
          onClick={handleProceed}
          disabled={!allChecked}
          className="w-full rounded-2xl py-3 text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2"
          style={{
            background: allChecked ? "#b45200" : "rgba(18,45,69,0.08)",
            color: allChecked ? "#fff" : "var(--muted)",
            cursor: allChecked ? "pointer" : "not-allowed",
            outlineColor: "#b45200",
          }}
          aria-disabled={!allChecked}
        >
          {allChecked
            ? "I understand the risks — proceed"
            : `Check all ${RISKS.length - checked.filter(Boolean).length} remaining item${RISKS.length - checked.filter(Boolean).length === 1 ? "" : "s"}`}
        </button>

        {/* Link to SECURITY.md */}
        <p className="text-xs text-center mt-3" style={{ color: "var(--muted)" }}>
          Full disclosure in{" "}
          <a
            href="https://github.com/Alike001/seshpay-arc/blob/main/SECURITY.md"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
            style={{ color: "var(--accent-hover)" }}
          >
            SECURITY.md
          </a>
        </p>

        {/* Non-production signal */}
        <div
          className="mt-4 flex items-center justify-center gap-1.5 rounded-xl py-2"
          style={{ background: "rgba(180,82,0,0.06)", border: "1px solid rgba(180,82,0,0.12)" }}
        >
          <AlertTriangle className="size-3" style={{ color: "#b45200" }} aria-hidden="true" />
          <span className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "#b45200", letterSpacing: "0.10em" }}>
            Not audited — not guaranteed safe
          </span>
        </div>
      </div>
    </div>
  );
}
