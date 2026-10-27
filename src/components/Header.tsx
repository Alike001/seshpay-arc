import { ConnectKitButton } from "connectkit";
import { Link } from "react-router-dom";
import { IS_MAINNET } from "@/config";

export default function Header() {
  return (
    <header
      className="sticky top-0 z-30 w-full px-4 py-3"
      style={{
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(18,45,69,0.08)",
      }}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* Logo links back to landing */}
          <Link
            to="/"
            className="flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 rounded"
            style={{ outlineColor: "var(--focus)" }}
            aria-label="SeshPay — back to home"
          >
            <div
              className="flex size-8 items-center justify-center rounded-xl select-none"
              style={{ background: "var(--accent)" }}
            >
              <span
                className="display text-xs font-bold text-white"
                style={{ letterSpacing: "-0.04em" }}
              >
                SP
              </span>
            </div>
            <div className="flex flex-col leading-none">
              <span
                className="display text-base font-bold tracking-tight"
                style={{ color: "var(--ink)", letterSpacing: "-0.03em" }}
              >
                SeshPay
              </span>
              <span
                className="text-[10px] font-medium hidden sm:block"
                style={{ color: IS_MAINNET ? "var(--success)" : "var(--subtle)" }}
              >
                {IS_MAINNET ? "on Arc Mainnet" : "on Arc Testnet"}
              </span>
            </div>
          </Link>
        </div>
        <ConnectKitButton />
      </div>
    </header>
  );
}
