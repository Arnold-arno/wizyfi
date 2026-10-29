// Public home ("/"). Content rules (Public Website spec):
//  * no fake live data — the product preview is a labelled schematic, no numbers;
//  * integrations are NOT shown as "Available": the MikroTik and Wizyfi adapters
//    are still simulated stubs, so they read "In development"; the rest "Planned";
//  * security lists only controls that exist in the code; no certifications.
import {
  Activity, CalendarClock, Layers, MapPin, Power, Receipt, ScrollText, ShieldCheck, Ticket, Users,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { StatusBadge, type Tone } from "../../components/ui/StatusBadge";
import { btnPrimary, btnSecondary } from "../../components/ui/styles";
import { PRODUCT, SLOGAN } from "../../lib/brand";
import { PublicLayout } from "./PublicLayout";

const FEATURES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: MapPin, title: "Places and routers", body: "Group your routers by location. Every Place keeps its own time zone, and every router shows its status with a clear “last seen” time, so you know how fresh the information is." },
  { icon: Layers, title: "Access plans", body: "Define what customers can buy: price, duration, data cap and device limit. A plan can end after a set time, or at the next scheduled network reset." },
  { icon: Ticket, title: "Vouchers in bulk", body: "Generate up to thousands of voucher codes in one safe, repeatable step. Codes are shown once, then stored only as hashes. Redeemed vouchers can’t be used twice." },
  { icon: Activity, title: "Live connections", body: "See who is online right now, on which router and plan, and how long they have left. Disconnect one exact session when you need to." },
  { icon: Receipt, title: "Sales and a permanent ledger", body: "Record payments as sales and keep each one backed by an unchangeable transaction. Refunds add an entry; they never rewrite history." },
  { icon: Users, title: "People and devices", body: "A searchable directory of your customers and the devices seen on your networks, kept apart from your staff accounts." },
  { icon: CalendarClock, title: "Network cycles", body: "Plan the operating periods of each Place ahead of time, with exact start and end times." },
  { icon: ScrollText, title: "Audit trail", body: "Sensitive actions are recorded with who did them and when. The records are append-only and can’t be edited." },
];

const STEPS = [
  { t: "Create your account", d: "Sign up in a minute and name your organization." },
  { t: "Add a Place", d: "A café, a branch, a guest house: anywhere you run a network." },
  { t: "Connect a router", d: "Add a router through a connector and run a connection test." },
  { t: "Sell and manage access", d: "Create plans, issue vouchers and watch live connections." },
  { t: "Stay in control", d: "Review sales, audit history and schedule resets with Wizyfi." },
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
  "Every request is checked on the server against the member’s role and organization. Hiding a button is never the only control.",
  "Each organization’s data is isolated from every other organization’s.",
  "Router credentials are stored encrypted and are never shown again after you save them.",
  "Short-lived sign-in tokens, with refresh tokens that are rotated and revoked on sign-out.",
  "Voucher codes are stored only as keyed hashes, and redemption attempts are rate-limited.",
  "Important actions are written to an append-only audit trail.",
];

const FAQ = [
  { q: "Do I need special hardware?", a: "Wizyfi Bridge manages networks through router integrations. Which devices work is listed under Integrations, and no integration is marked Available until it has been tested against real devices." },
  { q: "What is a Place?", a: "A named location or network grouping you manage, such as a café or a branch. A Place holds one or more routers." },
  { q: "What is a hard logout?", a: "A reset you schedule for an exact time. Everyone in scope is disconnected together and signs in again. It only ever happens when someone authorised schedules it." },
  { q: "Can access end at the reset?", a: "Yes. A plan can last until the next scheduled reset, and resets can repeat daily or on chosen weekdays. Customers who connect in the last hour before a reset get their voucher back to use again afterwards." },
  { q: "Is there a free trial or pricing?", a: "Pricing isn’t published yet. You can create an account and set up a Place to explore." },
];

const card = "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5";

export function HomePage() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="wz-brand-panel text-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
          <div className="wz-page">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-[var(--brand-blue)]">
              {PRODUCT} · One Platform. Every Network.
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">Run every Wi-Fi network you manage from one workspace.</h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">
              Wizyfi Bridge is a cloud platform for operators of cafés, guest houses, offices, schools and shared spaces.
              Organise your networks into Places, sell access with plans and vouchers, watch who is connected, keep a clean
              record of every payment, and schedule network resets for an exact time.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/sign-up" className={btnPrimary}>Create account</Link>
              <a href="#how-it-works" className={`${btnSecondary} !border-white/25 !bg-transparent !text-white hover:!bg-white/10`}>See how it works</a>
            </div>
            <p className="mt-4 text-xs text-slate-400">No card needed to explore. Set up your first Place in minutes.</p>
          </div>

          {/* Labelled schematic: deliberately no numbers or live-looking data. */}
          <figure aria-label="Illustration of how Wizyfi Bridge is organised" className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <ol className="flex flex-col gap-3 text-sm">
              {[
                ["Your organization", "Members, roles and plan"],
                ["Places", "Each with its own time zone"],
                ["Routers", "Status and last-seen time"],
                ["Plans · Vouchers · Live connections", "What customers buy and use"],
                ["Sales · Ledger · Audit trail", "Permanent records"],
              ].map(([t, s], i) => (
                <li key={t} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                  <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-bold text-white">{i + 1}</span>
                  <span>
                    <span className="block font-medium">{t}</span>
                    <span className="block text-xs text-slate-400">{s}</span>
                  </span>
                </li>
              ))}
            </ol>
            <figcaption className="mt-3 text-xs text-slate-400">Illustration, not live data.</figcaption>
          </figure>
        </div>
      </section>

      {/* What it does */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16" aria-labelledby="features-h">
        <h2 id="features-h" className="text-2xl font-bold sm:text-3xl">Everything you need to run a managed network</h2>
        <p className="mt-2 max-w-2xl text-[var(--foreground-secondary)]">
          One login for the whole picture, from the router on the wall to the payment in the ledger, without juggling separate tools.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article key={title} className={card}>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--info-soft)] text-[var(--info-text)]">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-[var(--foreground-secondary)]">{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-y border-[var(--border)] bg-[var(--surface)]" aria-labelledby="how-h">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="how-h" className="text-2xl font-bold sm:text-3xl">How it works</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.t} className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-bold text-[var(--primary-contrast)]">{i + 1}</span>
                <p className="mt-3 font-semibold">{s.t}</p>
                <p className="mt-1 text-sm text-[var(--foreground-secondary)]">{s.d}</p>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-sm text-[var(--foreground-secondary)]">
            Setup depends on your devices and which integrations are available. A router is only shown as connected once the system confirms it.
          </p>
        </div>
      </section>

      {/* Wizyfi spotlight */}
      <section id="wizyfi" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16" aria-labelledby="wizyfi-h">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--info-soft)] text-[var(--info-text)]"><Power className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <p className="text-sm font-medium text-[var(--primary)]">A {PRODUCT} product</p>
            <h2 id="wizyfi-h" className="text-2xl font-bold sm:text-3xl">Wizyfi</h2>
          </div>
        </div>
        <p className="mt-3 text-[var(--foreground-secondary)]">{SLOGAN}</p>
        <p className="mt-2 max-w-3xl text-[var(--foreground-secondary)]">
          Wizyfi is the control side of the platform. Choose a Place or specific routers, pick an exact date and time,
          review what will happen, and the server carries it out, even if nobody is signed in at that moment.
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            ["Exact-time hard logout", "Choose the Place or routers, the date, the time and the time zone. Everyone in scope is disconnected at that moment and signs in again."],
            ["Repeat on a schedule", "Reset every day, or on chosen weekdays, at a set time. Each occurrence can still be cancelled on its own."],
            ["Honest results", "Per-router outcomes. A partial failure is shown as partial, never as success."],
            ["Independent by design", "Plans, vouchers, sales and sessions can read the reset schedule but can never trigger a reset."],
          ].map(([t, b]) => (
            <li key={t} className={card}>
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-[var(--foreground-secondary)]">{b}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-[var(--foreground-muted)]">Running a reset on real routers depends on a tested integration. See Integrations below.</p>
        <div className="mt-5"><Link to="/wizyfi" className={btnSecondary}>Learn about Wizyfi</Link></div>
      </section>

      {/* Integrations */}
      <section id="integrations" className="scroll-mt-20 border-y border-[var(--border)] bg-[var(--surface)]" aria-labelledby="int-h">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="int-h" className="text-2xl font-bold sm:text-3xl">Integrations</h2>
          <p className="mt-2 max-w-2xl text-[var(--foreground-secondary)]">
            We only mark an integration Available once it has been tested against real devices. None has reached that point yet.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INTEGRATIONS.map((i) => (
              <li key={i.name} className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
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
      <section id="security" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16" aria-labelledby="sec-h">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--success-soft)] text-[var(--success-text)]"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span>
          <h2 id="sec-h" className="text-2xl font-bold sm:text-3xl">Security you can check</h2>
        </div>
        <p className="mt-2 text-[var(--foreground-secondary)]">These describe what the platform does today. They are not certifications.</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {SECURITY.map((s) => (
            <li key={s} className={`${card} text-sm text-[var(--foreground-secondary)]`}>{s}</li>
          ))}
        </ul>
      </section>

      {/* FAQ + closing CTA */}
      <section id="faq" className="scroll-mt-20 border-t border-[var(--border)] bg-[var(--surface)]" aria-labelledby="faq-h">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h2 id="faq-h" className="text-2xl font-bold sm:text-3xl">Questions</h2>
          <div className="mt-6 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-4">
                <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">{f.q}</summary>
                <p className="mt-2 text-sm text-[var(--foreground-secondary)]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
        <div className="wz-brand-panel px-4 py-14 text-center text-white">
          <p className="text-2xl font-bold">Ready to set up your first Place?</p>
          <p className="mx-auto mt-2 max-w-lg text-slate-300">Create an account, add a Place and connect a router. You stay in control at every step.</p>
          <div className="mt-6"><Link to="/sign-up" className={btnPrimary}>Create account</Link></div>
        </div>
      </section>
    </PublicLayout>
  );
}
