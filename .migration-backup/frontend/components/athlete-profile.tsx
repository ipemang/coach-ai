const highlights = [
  { label: "Training load", value: "78%" },
  { label: "Recovery score", value: "Good" },
  { label: "Last check-in", value: "Today, 7:20 AM" },
  { label: "Status", value: "Active follow-up" }
];

const history = [
  { date: "Mon", note: "Reported knee soreness after jumping session", tone: "text-amber-300" },
  { date: "Tue", note: "Reduced swelling, mobility improving", tone: "text-emerald-300" },
  { date: "Wed", note: "Completed modified practice with no pain spike", tone: "text-sky-300" }
];

export function AthleteProfile() {
  return (
    <section className="rounded-3xl border border-line bg-surface/90 p-6 shadow-panel backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-xl font-semibold text-sky-200">
            JL
          </div>
          <div>
            <p className="text-sm font-medium text-sky-300">Athlete Profile</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Jordan Lee</h2>
            <p className="mt-2 text-sm text-slate-300">Basketball · Guard · Senior</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-slate-300">
          Care plan updated this morning
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {highlights.map((item) => (
          <div key={item.label} className="rounded-2xl border border-line bg-panel p-4">
            <p className="text-sm text-slate-400">{item.label}</p>
            <p className="mt-2 text-lg font-semibold text-white">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-line bg-panel p-4">
          <h3 className="text-base font-semibold text-white">Snapshot</h3>
          <dl className="mt-4 space-y-4 text-sm">
            {[
              ["Primary concern", "Mild anterior knee pain"],
              ["Current activity", "Modified practice only"],
              ["Recommended action", "Continue monitoring and mobility work"],
              ["Owner", "Athletic trainer"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-none last:pb-0">
                <dt className="text-slate-400">{label}</dt>
                <dd className="text-right font-medium text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Recent notes</h3>
            <span className="text-sm text-slate-400">Last 3 check-ins</span>
          </div>
          <div className="mt-4 space-y-4">
            {history.map((entry) => (
              <div key={entry.date} className="flex gap-4 rounded-2xl border border-white/5 bg-white/5 p-4">
                <div className="min-w-12 text-sm font-semibold text-slate-400">{entry.date}</div>
                <p className={`text-sm leading-6 ${entry.tone}`}>{entry.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
