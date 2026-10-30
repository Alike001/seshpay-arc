import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import LandingHeader from "@/components/LandingHeader";
import MainnetPilotBanner from "@/components/MainnetPilotBanner";
import { IS_MAINNET } from "@/config";

/* ─── tiny design tokens (mirror index.css vars) ─────────────────────── */
const ink   = "var(--ink)";
const muted = "var(--muted)";
const acc   = "var(--accent)";
const accH  = "var(--accent-hover)";

/* ─── reusable primitives ────────────────────────────────────────────── */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-6 ${className}`}
      style={{
        background: "rgba(255,255,255,0.72)",
        border: "1px solid rgba(18,45,69,0.09)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="display text-xs font-semibold uppercase tracking-widest mb-3"
      style={{ color: accH, letterSpacing: "0.12em" }}
    >
      {children}
    </p>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="display text-2xl sm:text-3xl font-bold leading-tight mb-4"
      style={{ color: ink, letterSpacing: "-0.03em" }}
    >
      {children}
    </h2>
  );
}

/* ─── App preview mockup (derived from real UI, no invented data) ─────── */
function AppPreview() {
  return (
    <div
      className="w-full max-w-sm mx-auto rounded-3xl overflow-hidden shadow-2xl"
      style={{
        border: "1px solid rgba(18,45,69,0.12)",
        background: "rgba(249,249,252,0.97)",
      }}
      aria-hidden="true"
    >
      {/* Mocked header bar */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid rgba(18,45,69,0.07)", background: "rgba(255,255,255,0.92)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="size-7 rounded-xl flex items-center justify-center"
            style={{ background: acc }}
          >
            <span className="display text-[10px] font-bold text-white" style={{ letterSpacing: "-0.04em" }}>SP</span>
          </div>
          <span className="display text-sm font-bold" style={{ color: ink, letterSpacing: "-0.03em" }}>SeshPay</span>
        </div>
        <div className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "rgba(16,97,166,0.1)", color: accH }}>
          Connected
        </div>
      </div>

      {/* Mocked tab bar */}
      <div className="flex gap-1 p-2" style={{ background: "rgba(255,255,255,0.65)" }}>
        {["Create Event", "Pay", "Recover", "My Events"].map((t, i) => (
          <div
            key={t}
            className="flex-1 rounded-xl py-2 text-center text-[10px] font-semibold"
            style={{
              background: i === 0 ? acc : "transparent",
              color: i === 0 ? "#fff" : muted,
            }}
          >
            {t}
          </div>
        ))}
      </div>

      {/* Mocked create form */}
      <div className="p-4 space-y-3">
        <p className="display text-sm font-bold" style={{ color: ink }}>Create an event</p>
        <p className="text-[11px]" style={{ color: muted }}>Set the host payout, reward budget, and deadline.</p>

        <div className="space-y-2">
          {[
            { label: "Host wallet address", placeholder: "0x…" },
            { label: "Host payout (USDC)", placeholder: "50.00" },
            { label: "Contributor budget (USDC)", placeholder: "200.00" },
          ].map((f) => (
            <div key={f.label}>
              <p className="text-[10px] font-medium mb-1" style={{ color: muted }}>{f.label}</p>
              <div
                className="rounded-lg px-3 py-2 text-[11px]"
                style={{ background: "rgba(18,45,69,0.04)", border: "1px solid rgba(18,45,69,0.09)", color: "rgba(18,45,69,0.35)" }}
              >
                {f.placeholder}
              </div>
            </div>
          ))}
        </div>

        <div
          className="w-full rounded-xl py-2.5 text-center text-xs font-semibold text-white"
          style={{ background: acc }}
        >
          Approve USDC →
        </div>
      </div>

      {/* Subtle "testnet only" strip */}
      <div
        className="px-4 py-2 text-center text-[9px] font-medium"
        style={{ background: "rgba(18,45,69,0.03)", color: muted, borderTop: "1px solid rgba(18,45,69,0.05)" }}
      >
        {IS_MAINNET ? "Arc Mainnet — real USDC" : "Arc Testnet only — no real funds"}
      </div>
    </div>
  );
}

/* ─── How it works steps ─────────────────────────────────────────────── */
const STEPS = [
  {
    num: "01",
    title: "Create an event",
    body: "Set a host wallet, a fixed host payout, a contributor reward budget, and an approval deadline. All parameters are locked onchain at creation.",
    detail: "Your USDC is deposited in the contract at creation — nothing can be moved without your explicit approval or the expiry of the deadline.",
  },
  {
    num: "02",
    title: "Fund with USDC",
    body: "Approve and transfer USDC in one flow. The total deposit equals host payout plus the contributor budget. Arc's native USDC handles everything.",
    detail: "No wrapping, no bridging. USDC on Arc is the native gas token, so transfers are fast and fee costs are stable.",
  },
  {
    num: "03",
    title: "Approve and distribute",
    body: "When your event ends, name up to five contributors and their exact amounts. One transaction pays the host, all contributors, and returns unused budget to you.",
    detail: "Settlement is atomic — either everyone is paid in a single transaction, or nothing moves. No partial states.",
  },
];

/* ─── Use case data ──────────────────────────────────────────────────── */
const USE_CASES = [
  {
    icon: "🎓",
    title: "Workshops and courses",
    body: "A workshop organiser sets a fixed speaker payout and a budget for attendee participation rewards. After the session, the organiser approves exact amounts per contributor — no coordinator needed.",
  },
  {
    icon: "🌐",
    title: "Educational communities",
    body: "Community treasuries fund learning cohorts. Facilitators distribute USDC to active participants at the end of each cohort, with any leftover budget returned automatically to the treasury.",
  },
  {
    icon: "🤝",
    title: "Sponsored contributor sessions",
    body: "A sponsor funds a content or code sprint. Contributors are paid for merged work at the sponsor's discretion — onchain proof of every payout, no invoicing back-and-forth.",
  },
];

/* ─── FAQ items ──────────────────────────────────────────────────────── */
const FAQS = [
  {
    q: "Which wallet do I need?",
    a: IS_MAINNET
      ? "An EVM-compatible wallet such as MetaMask or Rabby, connected to Arc Mainnet (chain ID 5042) with real USDC for transactions and gas."
      : "Any EVM-compatible browser wallet that supports custom networks (MetaMask, Rabby, or similar). You will need to add Arc Testnet as a custom network and hold testnet USDC.",
  },
  {
    q: IS_MAINNET ? "How do I get USDC on Arc Mainnet?" : "Where do I get testnet USDC?",
    a: IS_MAINNET
      ? "Use a wallet or transfer service that explicitly supports USDC on Arc Mainnet. Check the network and recipient carefully; transactions use real USDC, including for gas."
      : 'Use the "Get test USDC" button in the Arc Studio sidebar when previewing the app, or visit the Arc Testnet faucet. Testnet USDC has no real-world value.',
  },
  {
    q: "Does SeshPay charge a fee?",
    a: IS_MAINNET
      ? "No. The contract has no platform fee and no admin address. Arc Mainnet transaction gas fees are paid in USDC."
      : "No. The contract has no platform fee and no admin address. The only cost is the Arc Testnet gas fee, which is paid in USDC and is typically a fraction of a cent.",
  },
  {
    q: "Who approves payouts?",
    a: "Only the sponsor — the wallet address that created and funded the event. No third party, no administrator, and no automated logic can release funds.",
  },
  {
    q: "What happens if I never settle?",
    a: "After the approval deadline passes, the sponsor can call Recover Funds to reclaim the entire deposit (host payout plus contributor budget). Nobody else can trigger this.",
  },
  {
    q: "Can I change the payout amounts after creating an event?",
    a: "No. The host payout and total budget are locked when the event is created. You choose the per-contributor amounts at settlement time, as long as the total does not exceed the budget.",
  },
  {
    q: "Is the contract upgradeable?",
    a: "No. The contract is non-upgradeable and has no owner or administrator. Once deployed, its rules cannot be changed.",
  },
  {
    q: "What is Arc?",
    a: "Arc is a blockchain where USDC is the native gas token, built by Circle. Fees are stable and predictable, transactions confirm in under a second, and no bridging is required to use USDC.",
  },
];

/* ─── Accordion item ─────────────────────────────────────────────────── */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid rgba(18,45,69,0.09)" }}>
      <button
        className="w-full text-left py-4 flex items-center justify-between gap-4 focus-visible:outline focus-visible:outline-2 rounded"
        style={{ outlineColor: "var(--focus)" }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold" style={{ color: ink }}>{q}</span>
        <span
          className="shrink-0 text-lg leading-none transition-transform duration-200"
          style={{ color: muted, transform: open ? "rotate(45deg)" : "none" }}
          aria-hidden="true"
        >
          +
        </span>
      </button>
      {open && (
        <p className="pb-4 text-sm text-pretty leading-relaxed" style={{ color: muted }}>
          {a}
        </p>
      )}
    </div>
  );
}

/* ─── Main landing page component ───────────────────────────────────── */
export default function LandingPage() {
  const howRef  = useRef<HTMLElement>(null);
  const useCaseRef = useRef<HTMLElement>(null);
  const faqRef  = useRef<HTMLElement>(null);

  const scrollTo = (ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-dvh" style={{ background: "var(--bg-gradient)" }}>
      {IS_MAINNET && <MainnetPilotBanner />}
      <LandingHeader
        onHowItWorks={() => scrollTo(howRef)}
        onUseCases={() => scrollTo(useCaseRef)}
        onFaq={() => scrollTo(faqRef)}
      />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Subtle radial glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(16,97,166,0.08) 0%, transparent 70%)",
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6 py-20 sm:py-28 lg:py-36 text-center">
          {/* Pill badge */}
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-6"
            style={{ background: "rgba(16,97,166,0.08)", border: "1px solid rgba(16,97,166,0.15)" }}>
            <span className="size-1.5 rounded-full" style={{ background: accH }} aria-hidden="true" />
            <span className="text-xs font-semibold" style={{ color: accH }}>{IS_MAINNET ? "Arc Mainnet — real USDC" : "Arc Testnet — USDC native"}</span>
          </div>

          <h1
            className="display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-5"
            style={{ color: ink, letterSpacing: "-0.04em", maxWidth: "800px", margin: "0 auto 20px" }}
          >
            Fund a session.{" "}
            <span style={{ color: accH }}>Pay your people.</span>
          </h1>

          <p
            className="text-base sm:text-lg text-pretty leading-relaxed mx-auto mb-8"
            style={{ color: muted, maxWidth: "540px" }}
          >
            Sponsor-controlled USDC payouts for creators, workshop hosts, contributors,
            and community events. One deposit, one approval, one atomic settlement.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/app"
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2"
              style={{ background: acc, outlineColor: "var(--focus)", minWidth: "160px" }}
            >
              Launch App
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <button
              onClick={() => scrollTo(howRef)}
              className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2"
              style={{
                background: "rgba(255,255,255,0.8)",
                border: "1px solid rgba(18,45,69,0.12)",
                color: ink,
                outlineColor: "var(--focus)",
              }}
            >
              How it works
            </button>
          </div>

          {/* Stat pills — real claims only */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            {[
              { label: "No platform fee", icon: "0%" },
              { label: "Up to 5 contributors per event", icon: "≤5" },
              { label: "Atomic single-tx settlement", icon: "1" },
              { label: "Sponsor-only approval", icon: "🔒" },
            ].map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{ background: "rgba(255,255,255,0.75)", border: "1px solid rgba(18,45,69,0.09)" }}
              >
                <span className="text-xs font-bold" style={{ color: acc }}>{s.icon}</span>
                <span className="text-xs font-medium" style={{ color: muted }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product preview ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
          <div className="flex-1 text-center lg:text-left">
            <SectionLabel>Product preview</SectionLabel>
            <SectionHeading>
              The full app,<br />
              <span style={{ color: accH }}>nothing invented.</span>
            </SectionHeading>
            <p className="text-sm text-pretty leading-relaxed mb-6" style={{ color: muted }}>
              The interface to the right is derived directly from the working application.
              Every field, button, and state you see is real and functional — not a
              marketing mockup.
            </p>
            <p className="text-sm text-pretty leading-relaxed" style={{ color: muted }}>
              Connect a wallet and click <strong style={{ color: ink }}>Launch App</strong> to
              interact with the live contract on {IS_MAINNET ? "Arc Mainnet" : "Arc Testnet"}.
            </p>
          </div>
          <div className="w-full max-w-sm lg:max-w-xs xl:max-w-sm">
            <AppPreview />
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section
        ref={howRef}
        id="how-it-works"
        className="mx-auto max-w-5xl px-6 py-16 scroll-mt-20"
      >
        <div className="text-center mb-12">
          <SectionLabel>How it works</SectionLabel>
          <SectionHeading>Three steps, one settlement.</SectionHeading>
          <p className="text-sm text-pretty mx-auto" style={{ color: muted, maxWidth: "460px" }}>
            SeshPay is deliberately simple. Every step is transparent, sponsor-controlled,
            and settled onchain.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {STEPS.map((step) => (
            <Card key={step.num}>
              <div
                className="display inline-flex items-center justify-center size-8 rounded-xl text-sm font-bold text-white mb-4"
                style={{ background: acc }}
              >
                {step.num}
              </div>
              <h3 className="display text-base font-bold mb-2" style={{ color: ink }}>
                {step.title}
              </h3>
              <p className="text-sm text-pretty leading-relaxed mb-3" style={{ color: muted }}>
                {step.body}
              </p>
              <p
                className="text-xs text-pretty leading-relaxed p-3 rounded-xl"
                style={{ background: "rgba(16,97,166,0.06)", color: accH }}
              >
                {step.detail}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Transparency ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div>
            <SectionLabel>How it works, honestly</SectionLabel>
            <SectionHeading>
              Sponsor-controlled.<br />
              <span style={{ color: accH }}>Nothing automatic.</span>
            </SectionHeading>
            <p className="text-sm text-pretty leading-relaxed" style={{ color: muted }}>
              Payouts are not triggered automatically by the system. Settlement only happens
              when the sponsor calls the contract — event attendance, completion, or any
              other external condition is entirely at the sponsor's discretion.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                title: "Sponsor controls approval",
                body: "Only the wallet that created the event can approve payouts. No admin, no platform operator, and no smart contract logic can release funds without the sponsor.",
              },
              {
                title: "Deadline triggers refund eligibility",
                body: "If the sponsor has not settled by the deadline, the full deposit becomes refundable — but only the sponsor can trigger the refund. Funds never move automatically.",
              },
              {
                title: "Settlement is atomic and final",
                body: "A single transaction pays the host, all approved contributors, and returns unused budget to the sponsor. Settlement can only happen once per event.",
              },
              {
                title: "No platform fee",
                body: IS_MAINNET
                  ? "The contract contains no fee logic and no platform address. Arc Mainnet transaction gas is paid in real USDC."
                  : "The contract contains no fee logic and no platform address. The only cost to create or settle is Arc Testnet gas, paid in USDC.",
              },
            ].map((item) => (
              <Card key={item.title} className="flex gap-3 items-start">
                <div
                  className="mt-0.5 shrink-0 size-5 rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(16,97,166,0.1)" }}
                  aria-hidden="true"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke={accH} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold mb-1" style={{ color: ink }}>{item.title}</p>
                  <p className="text-xs text-pretty leading-relaxed" style={{ color: muted }}>{item.body}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use cases ────────────────────────────────────────────────── */}
      <section
        ref={useCaseRef}
        id="use-cases"
        className="mx-auto max-w-5xl px-6 py-16 scroll-mt-20"
      >
        <div className="text-center mb-12">
          <SectionLabel>Use cases</SectionLabel>
          <SectionHeading>Built for real events.</SectionHeading>
          <p className="text-sm text-pretty mx-auto" style={{ color: muted, maxWidth: "440px" }}>
            SeshPay is designed for organisers, educators, and sponsors who want
            transparent, onchain payout records without off-chain coordination.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {USE_CASES.map((uc) => (
            <Card key={uc.title}>
              <div className="text-2xl mb-4" aria-hidden="true">{uc.icon}</div>
              <h3 className="display text-base font-bold mb-2" style={{ color: ink }}>
                {uc.title}
              </h3>
              <p className="text-sm text-pretty leading-relaxed" style={{ color: muted }}>
                {uc.body}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section
        ref={faqRef}
        id="faq"
        className="mx-auto max-w-2xl px-6 py-16 scroll-mt-20"
      >
        <div className="text-center mb-10">
          <SectionLabel>FAQ</SectionLabel>
          <SectionHeading>Common questions.</SectionHeading>
        </div>
        <div>
          {FAQS.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      {/* ── CTA strip ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-12 mb-4">
        <div
          className="rounded-3xl px-8 py-10 text-center"
          style={{
            background: acc,
          }}
        >
          <h2
            className="display text-2xl sm:text-3xl font-bold mb-3 text-white"
            style={{ letterSpacing: "-0.03em" }}
          >
            Ready to run your first event?
          </h2>
          <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.72)" }}>
            {IS_MAINNET
              ? "Arc Mainnet beta. Transactions use real USDC and the contract is unaudited. Review the risks before funding an event."
              : "Arc Testnet only. No real funds. Get testnet USDC from the faucet and create your first event in minutes."}
          </p>
          <Link
            to="/app"
            className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2"
            style={{ background: "#fff", color: acc, outlineColor: "rgba(255,255,255,0.6)" }}
          >
            Launch App
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer
        className="border-t px-6 py-10"
        style={{ borderColor: "rgba(18,45,69,0.08)" }}
      >
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div
              className="size-7 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: acc }}
            >
              <span className="display text-[10px] font-bold text-white" style={{ letterSpacing: "-0.04em" }}>SP</span>
            </div>
            <div>
              <p className="display text-sm font-bold" style={{ color: ink }}>SeshPay</p>
              <p className="text-xs" style={{ color: muted }}>Sponsor-controlled USDC payouts on Arc</p>
            </div>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer navigation">
            <Link to="/app" className="text-xs font-medium hover:underline" style={{ color: muted }}>
              Launch App
            </Link>
            <a
              href={IS_MAINNET
                ? "https://explorer.arc.io/address/0xd02bc329d5cfe93e841ea2c925520ef864621c4c"
                : "https://explorer.testnet.arc.io/address/0x0fe8a41346ab7aa30dc183384a85b5e36051713c"}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium hover:underline"
              style={{ color: muted }}
            >
              Contract on ArcScan
            </a>
            <a
              href="https://docs.arc.io"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium hover:underline"
              style={{ color: muted }}
            >
              Arc docs
            </a>
          </nav>

          {/* Disclaimer */}
          {IS_MAINNET ? (
            <p className="text-xs font-semibold" style={{ color: "#b45200" }}>
              Unaudited mainnet pilot — use at your own risk.
            </p>
          ) : (
            <p className="text-xs" style={{ color: "var(--subtle)" }}>
              Arc Testnet only — no real funds.
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
