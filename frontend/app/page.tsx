import { AthleteProfile } from "@/components/athlete-profile";
import { TriageDashboard } from "@/components/triage-dashboard";

const integrationCards = [
  {
    provider: "Garmin",
    href: "/api/v1/integrations/garmin/connect?athlete_id=athlete-123&organization_id=org-1&coach_id=coach-1",
    description:
      "Connect Garmin to sync workouts, sleep, HRV, and readiness. The first connection backfills the last 90 days and then keeps syncing automatically.",
    permissions: ["workouts", "sleep", "HRV", "read historical data"],
  },
  {
    provider: "Strava",
    href: "/api/v1/integrations/strava/connect?athlete_id=athlete-123&organization_id=org-1&coach_id=coach-1",
    description:
      "Connect Strava to import training history, activity details, and future webhook updates. The first connection backfills the last 90 days.",
    permissions: ["activity history", "training metrics", "webhook updates", "read historical data"],
  },
  {
    provider: "Oura",
    href: "/api/v1/integrations/oura/connect?athlete_id=athlete-123&organization_id=org-1&coach_id=coach-1",
    description:
      "Connect Oura to sync readiness, HRV, and sleep trends. Historical access is requested so the first sync can backfill the last 90 days.",
    permissions: ["readiness", "sleep", "HRV", "read historical data"],
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-line bg-surface/75 px-6 py-5 shadow-panel backdrop-blur">
        <div>
          <p className="text-sm font-medium text-sky-300">Coach AI</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Performance triage workspace</h1>
          <p className="mt-2 text-sm text-slate-300">Next.js + Tailwind starter for athlete intake, profile review, and biometric integrations.</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-300">Connected</div>
          <div className="rounded-full bg-white/5 px-3 py-1.5 text-slate-300">Draft mode</div>
        </div>
      </header>

      <section className="mt-8 rounded-3xl border border-line bg-surface/90 p-6 shadow-panel backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="text-sm font-medium text-sky-300">Biometric integrations</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Connect Garmin, Strava, and Oura</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Each Connect button opens a clean OAuth redirect, explains the historical access needed for a 90-day backfill,
              and enables ongoing automated sync after the first successful connection.
            </p>
          </div>
          <div className="rounded-2xl bg-accent-soft px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-sky-200/80">Permissions</p>
            <p className="mt-1 text-sm font-medium text-white">Read access + background sync</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {integrationCards.map((card) => (
            <article key={card.provider} className="rounded-2xl border border-line bg-panel p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{card.provider}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{card.description}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {card.permissions.map((permission) => (
                  <span key={permission} className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">
                    {permission}
                  </span>
                ))}
              </div>

              <a
                href={card.href}
                className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-sky-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-sky-400"
              >
                Connect {card.provider}
              </a>
            </article>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <TriageDashboard />
        <AthleteProfile />
      </div>
    </main>
  );
}
