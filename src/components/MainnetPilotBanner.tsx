/**
 * MainnetNetworkChip (exported as MainnetPilotBanner for import compatibility)
 *
 * Compact "Arc Mainnet · Unaudited beta" status chip shown at the top of every
 * page when VITE_NETWORK=mainnet. Provides a "View risks" link to the full
 * disclosure in SECURITY.md without alarming visual treatment across the page.
 *
 * The full risk disclosure (fund-loss, sponsor discretion, USDC blacklisting,
 * irreversibility) remains one click away — this component does not remove or
 * reduce the substantive disclosure; it moves it out of the page's visual
 * hierarchy so it does not dominate non-financial views.
 *
 * This is frontend guidance only — it does not represent an onchain limit
 * or a security guarantee.
 */

export default function MainnetPilotBanner() {
  return (
    <div
      className="w-full px-4 py-2 flex items-center justify-center gap-3"
      style={{
        background: "rgba(16,97,166,0.05)",
        borderBottom: "1px solid rgba(18,45,69,0.08)",
      }}
    >
      {/* Live dot */}
      <span
        className="size-1.5 rounded-full flex-shrink-0"
        style={{ background: "var(--accent-hover)" }}
        aria-hidden="true"
      />

      {/* Network label */}
      <span className="text-xs font-semibold" style={{ color: "var(--accent-hover)" }}>
        Arc Mainnet
      </span>

      {/* Divider + status */}
      <span
        className="text-xs"
        style={{
          color: "var(--muted)",
          borderLeft: "1px solid rgba(18,45,69,0.14)",
          paddingLeft: "0.75rem",
        }}
      >
        Beta
      </span>

      {/* View security link */}
      <a
        href="https://github.com/Alike001/seshpay-arc/blob/main/SECURITY.md"
        target="_blank"
        rel="noreferrer"
        className="text-xs underline underline-offset-2 flex-shrink-0"
        style={{ color: "var(--muted)" }}
        aria-label="View full security disclosure in SECURITY.md"
      >
        View security
      </a>
    </div>
  );
}
