// Public home (route "/"). Content rules from the Public Website spec:
//  * no fake live data — the product preview is a labelled schematic, no numbers;
//  * integrations are NOT shown as "Available": the MikroTik and Wizyfi adapters
//    are still simulated stubs (no live router calls), so they are "In
//    development"; the rest are "Planned";
//  * security lists only controls that exist in the code; no certifications.
import { Link } from "react-router-dom";
import { StatusBadge, type Tone } from "../../components/ui/StatusBadge";
import { btnPrimary, btnSecondary } from "../../components/ui/styles";
import { PRODUCT, SLOGAN } from "../../lib/brand";
import { PublicLayout } from "./PublicLayout";

const BENEFITS = [
  { title: "Organise every Place", body: "Group routers by location, see their status and how fresh that status is, and keep each Place's time zone." },
  { title: "Sell and track access", body: "Create access plans, generate vouchers in bulk, and watch live connections. Each payment is kept in a permanent ledger." },
  { title: "Control with care", body: "Disconnect one session, or schedule a reset for an exact time with a clear consequence review first." },
  { title: "Every action traceable", body: "Sensitive actions are recorded with who did them and when, and the records can't be edited." },
];

const STEPS = [
  "Create your account",
  "Create your organization",
  "Add a Place",
  "Add a router and test the connection",
  "Manage plans, vouchers and connections",
];

const INTEGRATIONS: Array<{ name: string; label: string; tone: Tone; note: string }> = [
  { name: "MikroTik", label: "In development", tone: "info", note: "Adapter in place; not yet validated against real devices." },
  { name: "Wizyfi", label: "In development", tone: "info", note: "First-party option; not yet validated against real devices." },
  { name: "Ruijie Reyee", label: "Planned", tone: "muted", note: "Not started." },
  { name: "TP-Link", label: "Planned", tone: "muted", note: "Not started." },
  { name: "Ubiquiti UniFi", label: "Planned", tone: "muted", note: "Not started." },
  { name: "Huawei · Cisco", label: "Planned", tone: "muted", note: "Not started." },
];

const SECURITY = [
  "Every request is checked on the server against the member's role and organization — hiding a button is never the only control.",
  "Each organization's data is isolated from every other organization's.",
  "Router credentials are stored encrypted and are never shown again after you save them.",
  "Short-lived sign-in tokens, with refresh tokens that are rotated and revoked on sign-out.",
  "Voucher codes are stored only as keyed hashes, and redemption attempts are rate-limited.",
  "Important actions are written to an append-only audit trail.",
];

const FAQ = [
  { q: "Do I need special hardware?", a: "Wizyfi Bridge manages networks through router integrations. Which devices work is listed under Integrations, and no integration is marked Available until it has been tested against real devices." },
  { q: "What is a Place?", a: "A named location or network grouping you manage, for example a café or a branch. A Place holds one or more routers." },
  { q: "What is a hard logout?", a: "A reset you schedule for an exact time. Everyone in scope is disconnected together and signs in again. It only ever happens when someone authorised schedules it." },
  { q: "Can access end at the reset?", a: "Yes. A plan can last until the next scheduled reset, and resets can repeat daily or on chosen weekdays. Customers who connect in the last hour before a reset get their voucher back to use again afterwards." },
  { q: "Is there a free trial or pricing?", a: "Pricing isn't published yet. You can create an account and set up a Place to explore." },
];

export function HomePage() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="bg-[var(--brand-navy)] text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <p className="text-sm font-medium text-[var(--brand-cyan)]">{PRODUCT}</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight lg:text-5xl">Manage every Wi-Fi network from one workspace.</h1>
            <p className="mt-4 max-w-xl text-lg text-slate-300">
              For operators of cafés, guest houses, offices and shared spaces: group your networks into Places, sell access,
              watch live connections and control them with care.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/sign-up" className={btnPrimary}>Create account</Link>
              <a href="#how-it-works" className={`${btnSecondary} !bg-transparent !text-white !border-slate-500 hover:!bg-white/10`}>
                See how it works
              </a>
            </div>
          </div>

          {/* Labelled schematic — deliberately no numbers or live-looking data. */}
          <figure aria-label="Illustration of how Wizyfi Bridge is organised" className="rounded-xl border border-slate-700 bg-white/5 p-5">
            <ol className="flex flex-col gap-3 text-sm">
              {["Organization", "Places", "Routers", "Plans · Vouchers · Live connections", "Sales · Audit trail"].map((t, i) => (
                <li key={t} className="flex items-center gap-3 rounded-md border border-slate-700 bg-white/5 px-3 py-2">
                  <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-cyan)] text-xs font-bold text-slate-900">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
            <figcaption className="mt-3 text-xs text-slate-400">Illustration — not live data.</figcaption>
          </figure>
        </div>
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="benefits-h">
        <h2 id="benefits-h" className="text-2xl font-bold">What you can do</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b) => (
            <article key={b.title} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
              <h3 className="text-base font-semibold">{b.title}</h3>
              <p className="mt-2 text-sm text-[var(--foreground-secondary)]">{b.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-y border-[var(--border)] bg-[var(--surface)]" aria-labelledby="how-h">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="how-h" className="text-2xl font-bold">How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s} className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4 text-sm">
                <span className="text-xs font-semibold text-[var(--primary)]">Step {i + 1}</span>
                <p className="mt-1 font-medium">{s}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-[var(--foreground-secondary)]">
            Setup depends on your devices and which integrations are available. A router is only shown as connected once the system confirms it.
          </p>
        </div>
      </section>

      {/* Wizyfi spotlight */}
      <section id="wizyfi" className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="wizyfi-h">
        <p className="text-sm font-medium text-[var(--primary)]">A {PRODUCT} product</p>
        <h2 id="wizyfi-h" className="mt-1 text-2xl font-bold">Wizyfi</h2>
        <p className="mt-1 text-[var(--foreground-secondary)]">{SLOGAN}</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          <li className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
            <h3 className="font-semibold">Exact-time hard logout</h3>
            <p className="mt-2 text-[var(--foreground-secondary)]">Choose the Place or routers, the date, the time and the time zone. The server runs it at that moment, even if nobody is signed in.</p>
          </li>
          <li className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
            <h3 className="font-semibold">Repeat on a schedule</h3>
            <p className="mt-2 text-[var(--foreground-secondary)]">Reset every day, or on chosen weekdays, at a set time. Each occurrence can still be cancelled on its own.</p>
          </li>
          <li className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
            <h3 className="font-semibold">Honest results</h3>
            <p className="mt-2 text-[var(--foreground-secondary)]">Per-router outcomes. A partial failure is shown as partial, never as success.</p>
          </li>
          <li className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
            <h3 className="font-semibold">Independent by design</h3>
            <p className="mt-2 text-[var(--foreground-secondary)]">Plans, vouchers, sales and sessions can read the reset schedule but can never trigger a reset.</p>
          </li>
        </ul>
        <p className="mt-4 text-xs text-[var(--foreground-muted)]">Running a reset on real routers depends on a tested integration — see Integrations below.</p>
        <div className="mt-4"><Link to="/wizyfi" className={btnSecondary}>Learn about Wizyfi</Link></div>
      </section>

      {/* Integrations */}
      <section id="integrations" className="border-y border-[var(--border)] bg-[var(--surface)]" aria-labelledby="int-h">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="int-h" className="text-2xl font-bold">Integrations</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--foreground-secondary)]">
            We only mark an integration Available once it has been tested against real devices. None has reached that point yet.
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INTEGRATIONS.map((i) => (
              <li key={i.name} className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{i.name}</span>
                  <StatusBadge label={i.label} tone={i.tone} />
                </div>
                <p className="mt-2 text-xs text-[var(--foreground-secondary)]">{i.note}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="sec-h">
        <h2 id="sec-h" className="text-2xl font-bold">Security you can check</h2>
        <p className="mt-2 text-sm text-[var(--foreground-secondary)]">These describe what the platform does today — not certifications.</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {SECURITY.map((s) => (
            <li key={s} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--foreground-secondary)]">{s}</li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-[var(--border)] bg-[var(--surface)]" aria-labelledby="faq-h">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h2 id="faq-h" className="text-2xl font-bold">Questions</h2>
          <div className="mt-6 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-4">
                <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">{f.q}</summary>
                <p className="mt-2 text-sm text-[var(--foreground-secondary)]">{f.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-10 text-center">
            <p className="text-lg font-semibold">Ready to set up your first Place?</p>
            <div className="mt-4"><Link to="/sign-up" className={btnPrimary}>Create account</Link></div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
