/**
 * MainnetPilotBanner
 *
 * Shown at the top of every page when VITE_NETWORK=mainnet.
 * Discloses that SeshPay is an unaudited experimental prototype and that
 * real USDC may be lost. This banner is frontend guidance only — it does
 * not represent an onchain limit or a security guarantee.
 */
import { AlertTriangle } from "lucide-react";

export default function MainnetPilotBanner() {
  return (
    <div
      role="alert"
      aria-label="Unaudited mainnet prototype warning"
      className="w-full px-4 py-3"
      style={{
        background: "rgba(180,82,0,0.10)",
        borderBottom: "1px solid rgba(180,82,0,0.22)",
      }}
    >
      <div className="mx-auto max-w-xl flex items-start gap-3">
        <AlertTriangle
          className="size-4 flex-shrink-0 mt-0.5"
          style={{ color: "#b45200" }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold" style={{ color: "#7a3700" }}>
            Unaudited mainnet prototype — experimental pilot only
          </p>
          <p className="text-xs mt-0.5 text-pretty" style={{ color: "#7a3700", opacity: 0.85 }}>
            This contract has not been reviewed by an independent security firm.
            Real USDC may be lost. Sponsor approval is discretionary — hosts and
            contributors have no recourse if the sponsor does not settle before
            the deadline. Restricted USDC transfers can lock funds indefinitely,
            potentially permanently.
            Do not deposit more than you can afford to lose.
          </p>
        </div>
      </div>
    </div>
  );
}
