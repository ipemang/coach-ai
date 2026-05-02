"use client";

/**
 * COA-79 Phase B — Training Load Chart
 *
 * Displays 90-day Fitness (CTL), Fatigue (ATL), and Form (TSB) as SVG lines.
 * No external chart library — pure React SVG.
 *
 * Metrics:
 *   TSS  = duration_min * 1.0  (simplified proxy — no power data yet)
 *         + distance_km * 3.0  (additional weight for distance-based sports)
 *   CTL  = 42-day EWMA of daily TSS  (Chronic Training Load / Fitness)
 *   ATL  = 7-day EWMA  of daily TSS  (Acute Training Load / Fatigue)
 *   TSB  = CTL - ATL               (Training Stress Balance / Form)
 *
 * Green TSB → rested & ready  |  Red TSB → fatigued  |  Deep negative → overtrained
 */

import { useEffect, useState, useMemo } from "react";
import { createBrowserSupabase } from "@/app/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkoutRow {
  scheduled_date: string;
  duration_min: number | null;
  distance_km: number | null;
  status: string;
}

interface LoadPoint {
  date: string;        // YYYY-MM-DD
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
}

// ── TSS proxy ─────────────────────────────────────────────────────────────────

function computeTss(w: WorkoutRow): number {
  if (w.status === "removed" || w.status === "rest") return 0;
  const durationScore = (w.duration_min ?? 0) * 1.0;
  const distanceScore = (w.distance_km ?? 0) * 3.0;
  return Math.round(durationScore + distanceScore);
}

// ── EWMA ──────────────────────────────────────────────────────────────────────

function buildLoadSeries(workouts: WorkoutRow[], days: number): LoadPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build a lookup of TSS by date (sum if multiple workouts on same day)
  const tssByDate: Record<string, number> = {};
  for (const w of workouts) {
    const d = w.scheduled_date.split("T")[0];
    tssByDate[d] = (tssByDate[d] ?? 0) + computeTss(w);
  }

  // Seed CTL/ATL from 60 days before our window (warm-up period)
  const warmupDays = 60;
  const startOffset = days + warmupDays;

  let ctl = 0;
  let atl = 0;
  const kCtl = 1 / 42;
  const kAtl = 1 / 7;

  const series: LoadPoint[] = [];

  for (let i = -warmupDays; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    const dateStr = d.toISOString().split("T")[0];
    const tss = tssByDate[dateStr] ?? 0;

    ctl = ctl + kCtl * (tss - ctl);
    atl = atl + kAtl * (tss - atl);
    const tsb = ctl - atl;

    if (i >= 0) {
      series.push({
        date: dateStr,
        tss: Math.round(tss),
        ctl: Math.round(ctl * 10) / 10,
        atl: Math.round(atl * 10) / 10,
        tsb: Math.round(tsb * 10) / 10,
      });
    }
  }

  void startOffset; // suppress unused var warning
  return series;
}

// ── SVG chart ─────────────────────────────────────────────────────────────────

function LoadChart({ series }: { series: LoadPoint[] }) {
  const W = 900;
  const H = 220;
  const PAD = { top: 16, right: 24, bottom: 36, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const maxLoad = useMemo(
    () => Math.max(10, ...series.map((p) => Math.max(p.ctl, p.atl))),
    [series],
  );
  const minTsb = useMemo(
    () => Math.min(0, ...series.map((p) => p.tsb)),
    [series],
  );
  const maxTsb = useMemo(
    () => Math.max(0, ...series.map((p) => p.tsb)),
    [series],
  );

  // Map a load value (0..maxLoad) → Y pixel
  const yLoad = (v: number) =>
    PAD.top + innerH * (1 - v / (maxLoad * 1.1));

  // Map TSB → Y pixel (shared axis: TSB 0 aligns with ~20% from bottom)
  const tsbRange = Math.max(10, Math.max(Math.abs(minTsb), maxTsb)) * 1.2;
  const yTsb = (v: number) =>
    PAD.top + innerH * (1 - (v + tsbRange) / (tsbRange * 2));

  // Map index → X pixel
  const xOf = (i: number) =>
    PAD.left + (i / (series.length - 1 || 1)) * innerW;

  function polyline(getter: (p: LoadPoint) => number, scale: "load" | "tsb") {
    const yFn = scale === "load" ? yLoad : yTsb;
    return series
      .map((p, i) => `${xOf(i)},${yFn(getter(p))}`)
      .join(" ");
  }

  // TSB area path (filled, split at zero)
  const tsbAreaAbove = useMemo(() => {
    const pts = series.map((p, i) => ({ x: xOf(i), y: yTsb(p.tsb), v: p.tsb }));
    const y0 = yTsb(0);
    let d = "";
    let inSegment = false;
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      if (pt.v >= 0) {
        if (!inSegment) {
          d += `M ${pt.x} ${y0} L ${pt.x} ${pt.y} `;
          inSegment = true;
        } else {
          d += `L ${pt.x} ${pt.y} `;
        }
      } else {
        if (inSegment) { d += `L ${pts[i - 1].x} ${y0} Z `; inSegment = false; }
      }
    }
    if (inSegment) { d += `L ${pts[pts.length - 1].x} ${y0} Z`; }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  const tsbAreaBelow = useMemo(() => {
    const pts = series.map((p, i) => ({ x: xOf(i), y: yTsb(p.tsb), v: p.tsb }));
    const y0 = yTsb(0);
    let d = "";
    let inSegment = false;
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      if (pt.v < 0) {
        if (!inSegment) {
          d += `M ${pt.x} ${y0} L ${pt.x} ${pt.y} `;
          inSegment = true;
        } else {
          d += `L ${pt.x} ${pt.y} `;
        }
      } else {
        if (inSegment) { d += `L ${pts[i - 1].x} ${y0} Z `; inSegment = false; }
      }
    }
    if (inSegment) { d += `L ${pts[pts.length - 1].x} ${y0} Z`; }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  // Month labels on X axis
  const monthLabels = useMemo(() => {
    const seen = new Set<string>();
    return series
      .map((p, i) => {
        const m = p.date.slice(0, 7); // YYYY-MM
        if (seen.has(m)) return null;
        seen.add(m);
        const dt = new Date(p.date + "T12:00:00");
        return {
          x: xOf(i),
          label: dt.toLocaleDateString("en-US", { month: "short" }),
        };
      })
      .filter(Boolean) as { x: number; label: string }[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  // Y-axis tick values
  const loadTicks = [0, Math.round(maxLoad * 0.5), Math.round(maxLoad)];

  const hover = hoverIdx !== null ? series[hoverIdx] : null;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * W - PAD.left;
          const idx = Math.round((relX / innerW) * (series.length - 1));
          setHoverIdx(Math.max(0, Math.min(series.length - 1, idx)));
        }}
      >
        {/* Zero line for TSB */}
        <line
          x1={PAD.left} y1={yTsb(0)} x2={PAD.left + innerW} y2={yTsb(0)}
          stroke="var(--rule)" strokeWidth={1} strokeDasharray="3,3"
        />

        {/* Y axis grid lines */}
        {loadTicks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left} y1={yLoad(v)} x2={PAD.left + innerW} y2={yLoad(v)}
              stroke="var(--rule)" strokeWidth={0.5} opacity={0.5}
            />
            <text
              x={PAD.left - 6} y={yLoad(v) + 4}
              textAnchor="end" fontSize={9} fill="var(--ink-mute)"
              fontFamily="var(--mono)"
            >
              {v}
            </text>
          </g>
        ))}

        {/* TSB filled areas */}
        <path d={tsbAreaAbove} fill="rgba(52,211,153,0.12)" />
        <path d={tsbAreaBelow} fill="rgba(239,68,68,0.12)" />

        {/* ATL line (fatigue — terracotta) */}
        <polyline
          points={polyline((p) => p.atl, "load")}
          fill="none"
          stroke="var(--terracotta-deep)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.85}
        />

        {/* CTL line (fitness — aegean) */}
        <polyline
          points={polyline((p) => p.ctl, "load")}
          fill="none"
          stroke="var(--aegean-deep)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* TSB line */}
        <polyline
          points={polyline((p) => p.tsb, "tsb")}
          fill="none"
          stroke="rgba(52,211,153,0.8)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray="4,2"
        />

        {/* Month labels */}
        {monthLabels.map((m) => (
          <text
            key={m.label + m.x}
            x={m.x} y={H - 4}
            textAnchor="middle" fontSize={9}
            fill="var(--ink-mute)" fontFamily="var(--mono)"
          >
            {m.label}
          </text>
        ))}

        {/* Hover crosshair */}
        {hoverIdx !== null && (
          <line
            x1={xOf(hoverIdx)} y1={PAD.top}
            x2={xOf(hoverIdx)} y2={PAD.top + innerH}
            stroke="var(--ink-mute)" strokeWidth={1} strokeDasharray="2,2" opacity={0.5}
          />
        )}
      </svg>

      {/* Hover tooltip */}
      {hover && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--parchment)",
            border: "1px solid var(--rule)",
            borderRadius: 4,
            padding: "6px 12px",
            fontSize: 11,
            fontFamily: "var(--mono)",
            color: "var(--ink)",
            display: "flex",
            gap: 16,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: "var(--ink-mute)" }}>{hover.date}</span>
          <span>TSS <strong>{hover.tss}</strong></span>
          <span style={{ color: "var(--aegean-deep)" }}>Fitness <strong>{hover.ctl}</strong></span>
          <span style={{ color: "var(--terracotta-deep)" }}>Fatigue <strong>{hover.atl}</strong></span>
          <span style={{ color: hover.tsb >= 0 ? "var(--aegean-deep)" : "var(--terracotta-deep)" }}>
            Form <strong>{hover.tsb > 0 ? "+" : ""}{hover.tsb}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TrainingLoadChart({ athleteId }: { athleteId: string }) {
  const [workouts, setWorkouts] = useState<WorkoutRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const DAYS = 90;

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const from = new Date();
    from.setDate(from.getDate() - DAYS - 60); // include warm-up window
    const fromStr = from.toISOString().split("T")[0];

    supabase
      .from("workouts")
      .select("scheduled_date, duration_min, distance_km, status")
      .eq("athlete_id", athleteId)
      .gte("scheduled_date", fromStr)
      .order("scheduled_date", { ascending: true })
      .then(({ data }) => {
        setWorkouts((data ?? []) as WorkoutRow[]);
        setLoading(false);
      });
  }, [athleteId]);

  const series = useMemo(
    () => (workouts ? buildLoadSeries(workouts, DAYS) : []),
    [workouts],
  );

  // Legend
  const legend = [
    { label: "Fitness (CTL)", color: "var(--aegean-deep)", dash: false },
    { label: "Fatigue (ATL)", color: "var(--terracotta-deep)", dash: false },
    { label: "Form (TSB)",    color: "rgba(52,211,153,0.9)", dash: true },
  ];

  return (
    <section
      className="ca-panel"
      style={{ padding: "1.25rem 1.5rem" }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <p className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 3 }}>Training Load</p>
          <h3 className="ca-display" style={{ fontSize: 16, margin: 0, color: "var(--ink)" }}>
            Fitness · Fatigue · Form
          </h3>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {legend.map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="22" height="8" style={{ flexShrink: 0 }}>
                <line
                  x1="0" y1="4" x2="22" y2="4"
                  stroke={l.color}
                  strokeWidth={l.dash ? 1.5 : 2.5}
                  strokeDasharray={l.dash ? "4,2" : undefined}
                />
              </svg>
              <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--ink-mute)", letterSpacing: "0.04em" }}>
                {l.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 12, color: "var(--ink-mute)", fontFamily: "var(--mono)" }}>Loading…</span>
        </div>
      ) : series.length === 0 ? (
        <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 12, color: "var(--ink-mute)", fontFamily: "var(--mono)" }}>No workout data in the last 90 days.</span>
        </div>
      ) : (
        <LoadChart series={series} />
      )}

      {/* Context note */}
      <p style={{ marginTop: "0.75rem", fontSize: 10, fontFamily: "var(--mono)", color: "var(--ink-mute)", letterSpacing: "0.04em" }}>
        TSS estimated from duration + distance · 90-day window · Hover to inspect
      </p>
    </section>
  );
}
