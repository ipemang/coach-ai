const queue = [
  {
    athlete: "Jordan Lee",
    sport: "Basketball",
    status: "Needs review",
    reason: "Knee soreness after landing drill",
    priority: "High"
  },
  {
    athlete: "Mia Torres",
    sport: "Soccer",
    status: "Monitoring",
    reason: "Hamstring tightness, improved ROM",
    priority: "Medium"
  },
  {
    athlete: "Noah Kim",
    sport: "Track",
    status: "Cleared",
    reason: "No symptoms reported after warmup",
    priority: "Low"
  }
];

const metrics = [
  { label: "Open cases", value: "12", change: "+3 today" },
  { label: "Red flags", value: "4", change: "2 pending escalation" },
  { label: "Avg response", value: "8m", change: "Within target" },
  { label: "Cleared", value: "19", change: "This week" }
];

export function TriageDashboard() {
  return (
    <section className="rounded-3xl border border-line bg-surface/90 p-6 shadow-panel backdrop-blur">
      <div className="flex items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-sm font-medium text-sky-300">Triage Dashboard</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Athlete intake and case prioritization</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Monitor incoming symptoms, review priority flags, and route athletes to the right follow-up workflow.
          </p>
        </div>
        <div className="rounded-2xl bg-accent-soft px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-200/80">Today</p>
          <p className="mt-1 text-lg font-semibold text-white">14 new entries</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-line bg-panel p-4">
            <p className="text-sm text-slate-400">{metric.label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{metric.value}</p>
            <p className="mt-2 text-sm text-sky-300">{metric.change}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-2xl border border-line bg-panel p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Priority queue</h3>
            <span className="text-sm text-slate-400">Updated 2 min ago</span>
          </div>
          <div className="mt-4 space-y-3">
            {queue.map((item) => (
              <article key={item.athlete} className="rounded-2xl border border-white/5 bg-white/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-medium text-white">{item.athlete}</h4>
                    <p className="text-sm text-slate-400">{item.sport}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-sky-400/10 px-2.5 py-1 text-sky-200">{item.priority}</span>
                    <span className="rounded-full bg-white/5 px-2.5 py-1 text-slate-300">{item.status}</span>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{item.reason}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-4">
          <h3 className="text-base font-semibold text-white">Workflow actions</h3>
          <div className="mt-4 space-y-3 text-sm">
            {[
              "Review same-day symptom submissions",
              "Escalate red-flag cases to medical staff",
              "Schedule follow-up check-ins for monitoring cases",
              "Mark cleared athletes and notify coaches"
            ].map((action) => (
              <div key={action} className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-slate-300">
                {action}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
