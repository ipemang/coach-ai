import { AthleteProfile } from "@/components/athlete-profile";
import { TriageDashboard } from "@/components/triage-dashboard";

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-line bg-surface/75 px-6 py-5 shadow-panel backdrop-blur">
        <div>
          <p className="text-sm font-medium text-sky-300">Coach AI</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Performance triage workspace</h1>
          <p className="mt-2 text-sm text-slate-300">Next.js + Tailwind starter for athlete intake and profile review.</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-300">Connected</div>
          <div className="rounded-full bg-white/5 px-3 py-1.5 text-slate-300">Draft mode</div>
        </div>
      </header>

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <TriageDashboard />
        <AthleteProfile />
      </div>
    </main>
  );
}
