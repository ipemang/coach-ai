/* Page 1: Today / Home — Snapshot + Week mosaic + Daily detail + Biometrics */

const { useState: useState1, useEffect: useEffect1, useRef: useRef1, useMemo: useMemo1 } = React;

// ─── Today snapshot card ─────────────────────────────────────────────────
function TodaySnapshot({ today, onOpen, onMarkComplete }) {
  if (!today) return null;
  const planned = today.planned || {};
  const isDone = today.status === 'met' || today.status === 'partial';
  return (
    <div className="panel lift" onClick={() => onOpen(today)} style={{
      padding: 28, cursor: 'pointer',
      borderTop: '3px solid var(--ink)',
      background: 'var(--parchment)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12 }}>
        <span className="eyebrow" style={{ whiteSpace: 'nowrap' }}>Today · {fmtDate(today.date, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
        <CompliancePill status={today.status} value={today.compliance} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
        <SportGlyph sport={today.sport} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="display" style={{ fontSize: 32, lineHeight: 1.15, color: 'var(--ink)', marginBottom: 6 }}>
            {today.title}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 13, color: 'var(--ink-soft)' }}>
            {planned.duration && <span className="mono" style={{ whiteSpace: 'nowrap' }}>{planned.duration}</span>}
            {planned.distance && <span className="mono" style={{ whiteSpace: 'nowrap' }}>{planned.distance}</span>}
            {planned.tss && <span className="mono" style={{ color: 'var(--ink-mute)', whiteSpace: 'nowrap' }}>{planned.tss} TSS planned</span>}
          </div>
          {today.description && (
            <p style={{ margin: '14px 0 0', fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.65, whiteSpace: 'pre-line' }}>
              {today.description.split('\n').slice(0, 2).join('\n')}
            </p>
          )}
        </div>
      </div>
      {today.coachNote && (
        <div style={{
          marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--rule-soft)',
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <div className="avatar avatar-coach avatar-sm" style={{ width: 26, height: 26, fontSize: 10 }}>{COACH.initials}</div>
          <div style={{ flex: 1 }}>
            <div className="eyebrow eyebrow-terracotta" style={{ fontSize: 9.5, marginBottom: 4 }}>Coach Andes · Note</div>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.55, fontStyle: 'italic' }}>
              "{today.coachNote}"
            </p>
          </div>
        </div>
      )}
      <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); onOpen(today); }}>
          Open workout →
        </button>
        {!isDone && (
          <button className="btn" onClick={(e) => { e.stopPropagation(); onMarkComplete(today); }}>
            Mark complete
          </button>
        )}
        {isDone && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--olive-deep)', alignSelf: 'center', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            ● Synced from Strava
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Week strip / mosaic ─────────────────────────────────────────────────
function WeekMosaic({ week, weekStart, weekLabel, weekOffset, onPrev, onNext, onThisWeek, onOpen, onMove }) {
  const [drag, setDrag] = useState1(null);
  const [over, setOver] = useState1(null);
  const todayKey = '2026-04-27'; // demo "today" = Mon

  const days = useMemo1(() => {
    const start = parseLocalDate(weekStart);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${da}`;
    });
  }, [weekStart]);

  const byDay = useMemo1(() => {
    const m = {};
    days.forEach(d => m[d] = []);
    week.forEach(w => { if (m[w.date]) m[w.date].push(w); });
    return m;
  }, [week, days]);

  return (
    <div className="panel" style={{ padding: 20, background: 'var(--linen)' }}>
      <div className="sec-h">
        <div>
          <span className="eyebrow">Training Week {weekOffset !== 0 && <span style={{ color: 'var(--ink-mute)', marginLeft: 6 }}>· {weekOffset > 0 ? `+${weekOffset}` : weekOffset}w</span>}</span>
          <h2 style={{ marginTop: 4 }}>{weekLabel}</h2>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-icon" title="Previous week" onClick={onPrev}>‹</button>
          <button className="btn btn-ghost" onClick={onThisWeek} disabled={weekOffset === 0}
            style={{ opacity: weekOffset === 0 ? 0.55 : 1 }}>This week</button>
          <button className="btn btn-ghost btn-icon" title="Next week" onClick={onNext}>›</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {days.map((d) => (
          <div key={d}>
            <DayHeader date={d} isToday={d === todayKey} />
          </div>
        ))}
        {days.map((d) => {
          const list = byDay[d] || [];
          const isOver = over === d;
          return (
            <div key={`col-${d}`}
              onDragOver={(e) => { e.preventDefault(); setOver(d); }}
              onDragLeave={() => setOver(o => o === d ? null : o)}
              onDrop={(e) => {
                e.preventDefault();
                if (drag) onMove(drag, d);
                setDrag(null); setOver(null);
              }}
              style={{
                minHeight: 280,
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: 4,
                background: isOver ? 'var(--aegean-wash)' : 'transparent',
                borderRadius: 3,
                transition: 'background 140ms',
              }}>
              {list.map((w) => (
                <WorkoutCard key={w.id} w={w}
                  draggable
                  onDragStart={() => setDrag(w.id)}
                  onClick={() => onOpen(w)} />
              ))}
              {list.length === 0 && (
                <div style={{
                  border: '1px dashed var(--rule-soft)',
                  borderRadius: 3,
                  padding: '20px 8px',
                  textAlign: 'center',
                  color: 'var(--ink-faint)',
                  fontSize: 11,
                  fontFamily: 'var(--mono)',
                }}>
                  rest
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week summary (compliance bar + totals) ──────────────────────────────
function WeekSummary({ week }) {
  const completed = week.filter(w => w.status === 'met' || w.status === 'partial' || w.status === 'missed');
  const totalCompliance = completed.length
    ? completed.reduce((s, w) => s + (w.compliance || 0), 0) / completed.length
    : null;

  const counts = { met: 0, partial: 0, missed: 0, planned: 0 };
  week.forEach(w => { counts[w.status] = (counts[w.status] || 0) + 1; });

  const totalPlannedHours = week.reduce((s, w) => {
    const dur = (w.actual?.duration || w.planned?.duration || '0:00:00').split(':');
    return s + (+dur[0] || 0) + ((+dur[1] || 0) / 60);
  }, 0);

  const total = week.length;
  return (
    <div className="panel" style={{ padding: 20 }}>
      <span className="eyebrow">Week snapshot</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginTop: 16 }}>
        <div>
          <div className="display" style={{ fontSize: 36, color: 'var(--ink)', lineHeight: 1 }}>
            {totalCompliance != null ? Math.round(totalCompliance * 100) + '%' : '—'}
          </div>
          <div className="eyebrow" style={{ marginTop: 6 }}>Compliance to date</div>
          <div className="compliance-bar" style={{ marginTop: 10 }}>
            <span style={{ width: `${(counts.met / total) * 100}%`, background: 'var(--c-met)' }}></span>
            <span style={{ width: `${(counts.partial / total) * 100}%`, background: 'var(--c-partial)' }}></span>
            <span style={{ width: `${(counts.missed / total) * 100}%`, background: 'var(--c-missed)' }}></span>
            <span style={{ width: `${(counts.planned / total) * 100}%`, background: 'var(--rule-soft)' }}></span>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10.5, color: 'var(--ink-mute)', fontFamily: 'var(--mono)' }}>
            <span><span className="dot dot-met"></span> {counts.met} met</span>
            <span><span className="dot dot-partial"></span> {counts.partial} partial</span>
            <span><span className="dot dot-missed"></span> {counts.missed} missed</span>
          </div>
        </div>
        <div>
          <div className="display" style={{ fontSize: 36, color: 'var(--ink)', lineHeight: 1 }}>
            {totalPlannedHours.toFixed(1)}<span style={{ fontSize: 18, color: 'var(--ink-mute)' }}>h</span>
          </div>
          <div className="eyebrow" style={{ marginTop: 6 }}>Volume this week</div>
          <div style={{ marginTop: 14, display: 'flex', gap: 16, fontSize: 11.5, color: 'var(--ink-soft)' }}>
            <div>
              <div className="mono" style={{ fontSize: 13, color: 'var(--ink)' }}>{week.filter(w => w.sport === 'swim').length}</div>
              <div className="eyebrow" style={{ fontSize: 9 }}>Swim</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 13, color: 'var(--ink)' }}>{week.filter(w => w.sport === 'bike').length}</div>
              <div className="eyebrow" style={{ fontSize: 9 }}>Bike</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 13, color: 'var(--ink)' }}>{week.filter(w => w.sport === 'run').length}</div>
              <div className="eyebrow" style={{ fontSize: 9 }}>Run</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 13, color: 'var(--ink)' }}>{week.filter(w => w.sport === 'strength' || w.sport === 'brick').length}</div>
              <div className="eyebrow" style={{ fontSize: 9 }}>S&amp;C</div>
            </div>
          </div>
        </div>
        <div>
          <div className="display" style={{ fontSize: 36, color: 'var(--ink)', lineHeight: 1 }}>
            {ATHLETE.weeksOut}<span style={{ fontSize: 18, color: 'var(--ink-mute)' }}>wk</span>
          </div>
          <div className="eyebrow" style={{ marginTop: 6 }}>To Lake Placid</div>
          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            Peak block · week 1 of 3
            <br />
            <span className="mono" style={{ color: 'var(--ink-mute)', fontSize: 10.5 }}>July 26, 2026</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Biometrics rail ─────────────────────────────────────────────────────
function BiometricsRail({ visible, lastSync, onSync }) {
  if (!visible) return null;
  const [b, setB] = useState1(BIOMETRICS);
  const [syncing, setSyncing] = useState1(false);

  function syncNow() {
    if (syncing) return;
    setSyncing(true);
    // Simulate API pull — jitter the values slightly to feel "fresh"
    setTimeout(() => {
      setB(prev => ({
        ...prev,
        recovery: clamp(prev.recovery + Math.round((Math.random() - 0.4) * 6), 30, 99),
        hrv: clamp(prev.hrv + Math.round((Math.random() - 0.5) * 5), 35, 90),
        rhr: clamp(prev.rhr + Math.round((Math.random() - 0.5) * 3), 40, 65),
        sleepHours: +(prev.sleepHours + (Math.random() - 0.5) * 0.4).toFixed(1),
        strain: +(prev.strain + (Math.random() - 0.5) * 1.4).toFixed(1),
        trend7: [...prev.trend7.slice(1), prev.recovery],
      }));
      setSyncing(false);
      onSync && onSync(prev => prev.device);
      onSync && onSync(b.device);
    }, 1100);
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  if (!b.connected) {
    return (
      <div className="panel" style={{ padding: 22 }}>
        <span className="eyebrow">Readiness</span>
        <div style={{ marginTop: 12, padding: '20px 14px', textAlign: 'center', border: '1px dashed var(--rule)', borderRadius: 3 }}>
          <div className="display" style={{ fontSize: 18, color: 'var(--ink)' }}>Connect a device</div>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '6px 0 14px' }}>Whoop, Oura, Garmin, Apple Health…</p>
          <button className="btn btn-primary" style={{ fontSize: 12 }}>Connect →</button>
        </div>
      </div>
    );
  }
  // Connected
  const ringColor = b.recovery >= 75 ? 'var(--c-met)' : b.recovery >= 50 ? 'var(--c-partial)' : 'var(--c-missed)';
  const ago = lastSync ? Math.max(0, Math.round((Date.now() - lastSync) / 60000)) : null;
  return (
    <div className="panel" style={{ padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8 }}>
        <span className="eyebrow">Readiness</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-mute)' }}>
            {syncing ? 'syncing…' : `${b.device} · ${ago != null ? `${ago}m ago` : 'just now'}`}
          </span>
          <button
            onClick={syncNow}
            title="Pull latest from device"
            className="btn btn-ghost btn-icon"
            style={{ width: 24, height: 24, padding: 0, color: 'var(--ink-soft)' }}
            disabled={syncing}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
              className={syncing ? 'spin' : ''}>
              <path d="M14 8a6 6 0 1 1-1.76-4.24M14 3v3.5h-3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
      {/* Recovery ring */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', width: 76, height: 76 }}>
          <svg width="76" height="76" viewBox="0 0 76 76" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="38" cy="38" r="32" stroke="var(--linen-deep)" strokeWidth="6" fill="none" />
            <circle cx="38" cy="38" r="32" stroke={ringColor} strokeWidth="6" fill="none"
              strokeDasharray={2 * Math.PI * 32}
              strokeDashoffset={2 * Math.PI * 32 * (1 - b.recovery / 100)}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(.22,.7,.4,1), stroke 300ms' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <span className="display" style={{ fontSize: 22, lineHeight: 1, color: 'var(--ink)' }}>{b.recovery}</span>
            <span className="eyebrow" style={{ fontSize: 8, marginTop: 2 }}>recov</span>
          </div>
        </div>
        <div style={{ flex: 1, fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>
            {b.recovery >= 75 ? 'Green to train.' : b.recovery >= 50 ? 'Train moderately.' : 'Recovery first.'}
          </strong> {b.recovery >= 75 ? 'HRV is up, sleep was strong.' : b.recovery >= 50 ? 'Body is asking for steady work, not intensity.' : 'Sleep & easy spin today.'}
        </div>
      </div>
      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--rule-soft)' }}>
        <Stat label="HRV" value={b.hrv} unit="ms" delta="+4" />
        <Stat label="Resting HR" value={b.rhr} unit="bpm" delta="−2" />
        <Stat label="Sleep" value={b.sleepHours} unit="h" delta={`${b.sleepScore}%`} />
        <Stat label="Strain" value={b.strain} unit="" delta="yest." />
      </div>
      {/* 7-day mini */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--rule-soft)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="eyebrow" style={{ fontSize: 9 }}>Recovery · 7 days</span>
        </div>
        <div className="bar-row" style={{ height: 32 }}>
          {b.trend7.map((v, i) => (
            <div key={i} style={{
              height: `${v}%`,
              background: v >= 75 ? 'var(--c-met)' : v >= 50 ? 'var(--c-partial)' : 'var(--c-missed)',
              opacity: i === b.trend7.length - 1 ? 1 : 0.5,
              transition: 'height 400ms ease',
            }}></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, delta }) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 9 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 3 }}>
        <span className="display" style={{ fontSize: 18, color: 'var(--ink)' }}>{value}</span>
        {unit && <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{unit}</span>}
      </div>
      {delta && <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-mute)', marginTop: 2 }}>{delta}</div>}
    </div>
  );
}

// ─── Daily detail drawer ─────────────────────────────────────────────────
function WorkoutDetail({ workout, onClose, onAddComment, onAddVoiceMemo, onMarkComplete }) {
  const [newComment, setNewComment] = useState1('');
  const [recording, setRecording] = useState1(false);
  const [recordTime, setRecordTime] = useState1(0);
  const recRef = useRef1(null);

  const comments = workout.comments || [];
  const memos = workout.voiceMemos || [];

  useEffect1(() => {
    if (recording) {
      recRef.current = setInterval(() => setRecordTime(t => t + 1), 1000);
    } else {
      clearInterval(recRef.current);
    }
    return () => clearInterval(recRef.current);
  }, [recording]);

  function startRec() { setRecording(true); setRecordTime(0); }
  function stopRecAndSend() {
    onAddVoiceMemo(recordTime || 8);
    setRecording(false); setRecordTime(0);
  }
  function discard() { setRecording(false); setRecordTime(0); }

  function addComment() {
    if (!newComment.trim()) return;
    onAddComment(newComment.trim());
    setNewComment('');
  }

  const planned = workout.planned || {};
  const actual = workout.actual;
  const isDone = workout.status === 'met' || workout.status === 'partial';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--parchment)',
        width: 'min(720px, 92vw)',
        maxHeight: '90vh',
        overflow: 'auto',
        borderRadius: 4,
        border: '1px solid var(--rule)',
        animation: 'slide-up 200ms ease',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--rule-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <SportGlyph sport={workout.sport} size={28} />
              <span className="eyebrow">{SPORT_LABEL[workout.sport]} · {fmtDate(workout.date, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
              <CompliancePill status={workout.status} value={workout.compliance} />
            </div>
            <h2 className="display" style={{ fontSize: 26, margin: 0, letterSpacing: '-0.02em' }}>{workout.title}</h2>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '24px 28px' }}>
          {/* Planned vs Actual */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginBottom: 24, border: '1px solid var(--rule-soft)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ padding: 18, borderRight: '1px solid var(--rule-soft)', background: 'var(--linen)' }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Planned</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {planned.duration && <Field label="Duration" value={planned.duration} />}
                {planned.distance && <Field label="Distance" value={planned.distance} />}
                {planned.tss && <Field label="TSS" value={planned.tss} />}
              </div>
            </div>
            <div style={{ padding: 18, background: actual ? 'var(--olive-wash)' : 'var(--parchment)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span className="eyebrow eyebrow-olive" style={{ color: actual ? 'var(--olive-deep)' : 'var(--ink-mute)' }}>Actual</span>
                {actual?.source && <span className="mono" style={{ fontSize: 9, color: 'var(--olive-deep)', letterSpacing: '0.1em' }}>● {actual.source}</span>}
              </div>
              {actual ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {actual.duration && <Field label="Duration" value={actual.duration} />}
                  {actual.distance && <Field label="Distance" value={actual.distance} />}
                  {actual.tss && <Field label="TSS" value={actual.tss} />}
                  {actual.hr && <Field label="Avg HR" value={`${actual.hr} bpm`} />}
                  {actual.power && <Field label="Avg Power" value={`${actual.power} W`} />}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-mute)', fontFamily: 'var(--mono)' }}>Awaiting completion</p>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
                    Auto-syncs from Strava or Garmin once you finish — no manual entry.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {workout.description && (
            <div style={{ marginBottom: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Workout</div>
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                {workout.description}
              </p>
            </div>
          )}

          {/* Coach note */}
          {workout.coachNote && (
            <div style={{ padding: 18, background: 'var(--terracotta-wash)', border: '1px solid var(--terracotta-soft)', borderLeft: '3px solid var(--terracotta-deep)', marginBottom: 24, borderRadius: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div className="avatar avatar-coach avatar-sm">{COACH.initials}</div>
                <span className="eyebrow eyebrow-terracotta" style={{ fontSize: 9.5 }}>Coach Andes</span>
              </div>
              <p className="display" style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: 'var(--ink)' }}>"{workout.coachNote}"</p>
            </div>
          )}

          {/* Voice memos & comments */}
          <div style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Conversation</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {[...comments, ...memos.map(m => ({ ...m, isMemo: true, author: 'felipe', text: m.transcript, at: m.at || 'just now' }))].map((c, i) => (
                <Comment key={c.id || i} c={c} />
              ))}
              {comments.length === 0 && memos.length === 0 && (
                <p className="mono" style={{ fontSize: 11, color: 'var(--ink-mute)', margin: 0 }}>No comments yet.</p>
              )}
            </div>

            {/* Voice recorder */}
            {recording ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: 'var(--terracotta-wash)', border: '1px solid var(--terracotta-soft)', borderRadius: 3 }}>
                <div className="rec-pulse" style={{ width: 12, height: 12, borderRadius: 999, background: 'var(--terracotta-deep)' }}></div>
                <span className="mono" style={{ fontSize: 13, color: 'var(--terracotta-deep)' }}>
                  Recording · {String(Math.floor(recordTime / 60)).padStart(2, '0')}:{String(recordTime % 60).padStart(2, '0')}
                </span>
                <div className="wave" style={{ flex: 1, color: 'var(--terracotta-deep)', height: 24 }}>
                  {Array.from({ length: 28 }).map((_, i) => (
                    <span key={i} style={{ height: `${30 + Math.sin((recordTime + i) * 0.7) * 30 + Math.random() * 20}%` }}></span>
                  ))}
                </div>
                <button className="btn btn-ghost" onClick={discard}>Discard</button>
                <button className="btn btn-primary" onClick={stopRecAndSend}>Stop &amp; send</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="input"
                  placeholder="Add a comment for your coach…"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addComment()}
                />
                <button className="btn btn-icon" onClick={startRec} title="Voice memo" style={{ color: 'var(--terracotta-deep)' }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="6" y="2" width="4" height="8" rx="2" />
                    <path d="M3 7v1a5 5 0 0 0 10 0V7M8 13v2" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                  </svg>
                </button>
                <button className="btn btn-primary" onClick={addComment}>Send</button>
              </div>
            )}
          </div>

          {/* Mark complete CTA */}
          {!isDone && onMarkComplete && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--rule-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="display" style={{ fontSize: 14, color: 'var(--ink)' }}>Finished this workout?</div>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-mute)', marginTop: 2 }}>
                  We'll pull duration, HR, and power from {actual?.source || 'Strava'} automatically.
                </div>
              </div>
              <button className="btn btn-primary" onClick={onMarkComplete} style={{ fontSize: 13 }}>
                ✓ Mark complete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
      <span className="mono" style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Comment({ c }) {
  const isCoach = c.author === 'coach';
  const [playing, setPlaying] = useState1(false);
  const [progress, setProgress] = useState1(0); // 0..1
  const intRef = useRef1(null);
  const length = c.length || 14;

  useEffect1(() => {
    if (playing) {
      intRef.current = setInterval(() => {
        setProgress(p => {
          const next = p + (1 / (length * 10));
          if (next >= 1) { setPlaying(false); return 0; }
          return next;
        });
      }, 100);
    } else {
      clearInterval(intRef.current);
    }
    return () => clearInterval(intRef.current);
  }, [playing, length]);

  const elapsed = Math.round(length * progress);
  const remain = length - elapsed;
  const totalBars = 22;
  const playedBars = Math.round(progress * totalBars);

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div className={`avatar avatar-sm ${isCoach ? 'avatar-coach' : ''}`}>
        {isCoach ? COACH.initials : ATHLETE.initials}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)' }}>
            {isCoach ? 'Coach Andes' : 'You'}
          </span>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-mute)' }}>{c.at}</span>
          {c.pending && <span className="pending-badge" style={{ fontSize: 8.5 }}>Pending review</span>}
        </div>
        <div style={{
          marginTop: 4,
          padding: c.isMemo ? '8px 12px' : 0,
          background: c.isMemo ? 'var(--linen)' : 'transparent',
          border: c.isMemo ? '1px solid var(--rule-soft)' : 'none',
          borderRadius: 3,
          display: c.isMemo ? 'flex' : 'block',
          alignItems: 'center',
          gap: 8,
        }}>
          {c.isMemo && (
            <>
              <button
                className="btn btn-icon"
                style={{ width: 26, height: 26, padding: 0, color: 'var(--aegean-deep)' }}
                onClick={() => setPlaying(p => !p)}
                title={playing ? 'Pause' : 'Play'}>
                {playing ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                    <rect x="2" y="1" width="2.4" height="8" /><rect x="5.6" y="1" width="2.4" height="8" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                    <path d="M2 1 L9 5 L2 9 Z" />
                  </svg>
                )}
              </button>
              <div className="wave-progress" style={{ color: 'var(--aegean-deep)' }}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setProgress(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
                }}>
                {Array.from({ length: totalBars }).map((_, i) => (
                  <span key={i}
                    className={i < playedBars ? 'played' : ''}
                    style={{ height: `${28 + Math.sin(i * 0.8) * 30 + 26}%` }}></span>
                ))}
              </div>
              <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', minWidth: 32, textAlign: 'right' }}>
                {playing || progress > 0
                  ? `0:${String(elapsed).padStart(2, '0')}`
                  : `0:${String(length).padStart(2, '0')}`}
              </span>
            </>
          )}
          {!c.isMemo && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{c.text}</p>
          )}
        </div>
        {c.isMemo && c.transcript && c.transcript !== '(transcribing…)' && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5, fontStyle: 'italic' }}>"{c.transcript}"</p>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { TodaySnapshot, WeekMosaic, WeekSummary, BiometricsRail, WorkoutDetail });
