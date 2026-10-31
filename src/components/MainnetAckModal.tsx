/**
 * MainnetRiskDisclosure (exported as MainnetAckModal for import compatibility)
 *
 * Inline risk acknowledgement rendered inside the Create Event form, just
 * above the first financial action button. Does NOT block browsing, reading
 * event details, or navigating the app — judges and visitors can explore
 * everything freely.
 *
 * Security guarantees:
 *  - One checkbox + CTA must be completed before approve or create fires.
 *  - handleApprove() and handleCreate() have code-level early-return guards
 *    (not only disabled button styling).
 *  - The five substantive risk statements are accessible via "Read all risks".
 *  - Stored in sessionStorage — one acknowledgement per browser session.
 *
 * This is frontend guidance only. It does not prevent direct contract calls
 * and does not constitute an onchain limit on deposit size.
 */
import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";

const STORAGE_KEY = "seshpay_mainnet_ack_v1";

interface Props {
  /** Called when the user checks the box and clicks proceed. */
  onAcknowledged: () => void;
}

/**
 * The five substantive risk statements — unchanged from the previous modal.
 * All remain accessible in the expandable panel; only the interaction pattern
 * has changed (expandable list vs five forced checkboxes).
 */
const RISKS = [
  "This contract has not been reviewed by an independent security firm. Real USDC may be lost if it contains undiscovered bugs.",
  "Sponsor approval is discretionary. Hosts and contributors have no recourse inside the contract if the sponsor does not settle before the deadline.",
  "If Circle restricts a recipient address, any transfer to that address reverts the entire settlement or refund, locking all funds indefinitely, potentially permanently.",
  "Any suggested deposit limit is frontend guidance only, not an onchain restriction. The contract accepts any amount the sponsor approves.",
  "Blockchain transactions are irreversible. There is no undo once confirmed.",
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
  const [checked, setChecked] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // If already acknowledged this session, call back immediately on mount.
  useEffect(() => {
    if (isMainnetAcknowledged()) onAcknowledged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleProceed() {
    if (!checked) return;
    setMainnetAcknowledged();
    onAcknowledged();
  }

  return (
    <div
      className="rounded-2xl p-4 mb-4"
      style={{
        background: "rgba(16,97,166,0.04)",
        border: "1px solid rgba(18,45,69,0.10)",
      }}
      role="group"
      aria-labelledby="risk-disclosure-title"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert
          className="size-3.5 flex-shrink-0"
          style={{ color: "var(--accent-hover)" }}
          aria-hidden="true"
        />
        <p
          id="risk-disclosure-title"
          className="text-xs font-semibold"
          style={{ color: "var(--ink)" }}
        >
          Real USDC — unaudited beta
        </p>
        <a
          href="https://github.com/Alike001/seshpay-arc/blob/main/SECURITY.md"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs underline underline-offset-2 flex-shrink-0"
          style={{ color: "var(--muted)" }}
        >
          Full disclosure
        </a>
      </div>

      {/* Summary */}
      <p className="text-xs text-pretty mb-3" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
        This contract is unaudited. Real USDC can be lost due to bugs, sponsor
        non-settlement, or USDC address restrictions that may lock funds
        indefinitely.
      </p>

      {/* Expandable risk list */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs mb-3 focus-visible:outline focus-visible:outline-2 rounded"
        style={{ color: "var(--accent-hover)", outlineColor: "var(--focus)" }}
        aria-expanded={expanded}
        aria-controls="risk-list"
      >
        {expanded
          ? <ChevronUp className="size-3" aria-hidden="true" />
          : <ChevronDown className="size-3" aria-hidden="true" />}
        {expanded ? "Hide details" : "Read all risks"}
      </button>

      {expanded && (
        <ol
          id="risk-list"
          className="space-y-1.5 mb-3 pl-4 list-decimal"
          style={{ color: "var(--muted)" }}
        >
          {RISKS.map((text, i) => (
            <li key={i} className="text-xs text-pretty" style={{ lineHeight: 1.6 }}>
              {text}
            </li>
          ))}
        </ol>
      )}

      {/* Single acknowledgement checkbox */}
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 flex-shrink-0"
          style={{ accentColor: "var(--accent)", width: 15, height: 15 }}
          aria-label="I understand these risks and want to proceed"
        />
        <span className="text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
          I understand this contract is unaudited, transactions are irreversible,
          and real USDC may be lost.
        </span>
      </label>

      {/* Proceed button */}
      <button
        type="button"
        onClick={handleProceed}
        disabled={!checked}
        className="mt-3 w-full rounded-xl py-2.5 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          background: checked ? "var(--accent)" : "rgba(18,45,69,0.07)",
          color: checked ? "#fff" : "var(--muted)",
          outlineColor: "var(--focus)",
        }}
        aria-disabled={!checked}
      >
        {checked ? "Acknowledge and show funding form" : "Check the box above to continue"}
      </button>
    </div>
  );
}
