import { useState } from "react";
import { Link } from "react-router-dom";

interface Props {
  onHowItWorks: () => void;
  onUseCases: () => void;
  onFaq: () => void;
}

export default function LandingHeader({ onHowItWorks, onUseCases, onFaq }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { label: "How it works", onClick: onHowItWorks },
    { label: "Use cases",    onClick: onUseCases },
    { label: "FAQ",          onClick: onFaq },
  ];

  const handleNav = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  return (
    <header
      className="sticky top-0 z-40 w-full"
      style={{
        background: "rgba(255,255,255,0.90)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(18,45,69,0.08)",
      }}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 rounded"
          style={{ outlineColor: "var(--focus)" }}
          aria-label="SeshPay home"
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
          <span
            className="display text-base font-bold"
            style={{ color: "var(--ink)", letterSpacing: "-0.03em" }}
          >
            SeshPay
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
          {navLinks.map((l) => (
            <button
              key={l.label}
              onClick={() => handleNav(l.onClick)}
              className="rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-black/5 focus-visible:outline focus-visible:outline-2"
              style={{ color: "var(--muted)", outlineColor: "var(--focus)" }}
            >
              {l.label}
            </button>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            to="/app"
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2"
            style={{ background: "var(--accent)", outlineColor: "var(--focus)" }}
          >
            Launch App
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden rounded-xl p-2 focus-visible:outline focus-visible:outline-2"
          style={{ outlineColor: "var(--focus)" }}
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            {menuOpen ? (
              <path d="M4 4l12 12M16 4L4 16" stroke="var(--ink)" strokeWidth="1.75" strokeLinecap="round"/>
            ) : (
              <>
                <path d="M3 5h14M3 10h14M3 15h14" stroke="var(--ink)" strokeWidth="1.75" strokeLinecap="round"/>
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div
          className="md:hidden px-6 pb-4 pt-1 flex flex-col gap-1"
          style={{ borderTop: "1px solid rgba(18,45,69,0.07)" }}
        >
          {navLinks.map((l) => (
            <button
              key={l.label}
              onClick={() => handleNav(l.onClick)}
              className="rounded-xl px-3 py-2.5 text-sm font-medium text-left transition-colors hover:bg-black/5 focus-visible:outline focus-visible:outline-2"
              style={{ color: "var(--muted)", outlineColor: "var(--focus)" }}
            >
              {l.label}
            </button>
          ))}
          <Link
            to="/app"
            onClick={() => setMenuOpen(false)}
            className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2"
            style={{ background: "var(--accent)", outlineColor: "var(--focus)" }}
          >
            Launch App
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>
      )}
    </header>
  );
}
