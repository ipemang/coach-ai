/* Shared components: TopNav, WorkoutCard, BiometricsRail, ComplianceBar, etc. */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─── Persistent app state + memory log ─────────────────────────────────
// Single source of truth, persisted to localStorage so comments,
// voice memos, dragged workouts, completions, etc. survive reloads.
// Every meaningful action also appends a line to the athlete memory log
// for coach.ai to read.
const STATE_KEY = 'andes:state:v1';

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveState(s) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {}
}

function useAppState() {
  const [state, setState] = useState(() => {
    const persisted = loadState();
    return persisted || {
      // workout overrides keyed by workout id
      // { [id]: { date?, comments?, voiceMemos?, status?, actual?, compliance? } }
      workouts: {},
      // season block overrides — re-ordering, date shifts
      blocks: {},
      // memory log — append-only stream visible to coach.ai
      memory: [
        { at: Date.now() - 86400000 * 2, kind: 'system', text: 'Athlete profile linked to Coach Andes.' },
      ],
      // last refresh timestamp per device
      lastSync: { whoop: Date.now() - 1000 * 60 * 14, strava: Date.now() - 1000 * 60 * 32 },
      // Pending changes count surfaced in top nav
      pendingCount: 2,
    };
  });

  useEffect(() => { saveState(state); }, [state]);

  const update = useCallback((fn) => setState(prev => fn(prev) || prev), []);

  const logMemory = useCallback((kind, text, meta) => {
    setState(prev => ({
      ...prev,
      memory: [...prev.memory, { at: Date.now(), kind, text, meta: meta || null }],
    }));
  }, []);

  return [state, update, logMemory, setState];
}

// Apply persisted overrides to a static workout list
function mergeWorkouts(base, overrides) {
  return base.map(w => {
    const o = overrides[w.id];
    if (!o) return w;
    return {
      ...w,
      ...o,
      planned: w.planned,
      comments: o.comments ?? w.comments,
      voiceMemos: o.voiceMemos ?? w.voiceMemos,
      actual: o.actual ?? w.actual,
    };
  });
}

// ─── Toast / celebration ───────────────────────────────────────────────
function Confetti({ show, onDone }) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [show, onDone]);
  if (!show) return null;
  const pieces = Array.from({ length: 36 }, (_, i) => i);
  const colors = ['var(--c-met)', 'var(--terracotta-deep)', 'var(--aegean-deep)', 'var(--olive-deep)', 'var(--amber-deep)'];
  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden',
    }}>
      {pieces.map(i => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.4;
        const dur = 1.6 + Math.random() * 0.9;
        const rot = Math.random() * 720;
        const col = colors[i % colors.length];
        const shape = i % 3;
        return (
          <span key={i} style={{
            position: 'absolute',
            left: `${left}%`, top: '-20px',
            width: 8, height: shape === 0 ? 12 : 8,
            background: col,
            borderRadius: shape === 1 ? 999 : 1,
            transform: `rotate(${rot}deg)`,
            animation: `confetti-fall ${dur}s cubic-bezier(.22,.7,.4,1) ${delay}s forwards`,
            opacity: 0.92,
          }} />
        );
      })}
    </div>
  );
}

function Toast({ show, title, body, onDone }) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [show, onDone]);
  if (!show) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
      zIndex: 10000,
      background: 'var(--ink)',
      color: 'var(--parchment)',
      padding: '16px 22px',
      borderRadius: 4,
      maxWidth: 420,
      boxShadow: '0 16px 48px -12px rgba(0,0,0,0.35)',
      animation: 'toast-in 280ms cubic-bezier(.22,.7,.4,1)',
    }}>
      <div className="display" style={{ fontSize: 17, marginBottom: 4, letterSpacing: '-0.01em' }}>{title}</div>
      {body && <div style={{ fontSize: 13, opacity: 0.82, lineHeight: 1.5 }}>{body}</div>}
    </div>
  );
}

// ─── User menu (top-right) ─────────────────────────────────────────────
function UserMenu({ onNav, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '4px 10px 4px 4px',
          background: open ? 'var(--linen-deep)' : 'transparent',
          border: '1px solid', borderColor: open ? 'var(--rule)' : 'transparent',
          borderRadius: 999, cursor: 'pointer',
          transition: 'background 140ms, border-color 140ms',
        }}>
        <div className="avatar avatar-sm" style={{ width: 28, height: 28, fontSize: 11 }}>{ATHLETE.initials}</div>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{ATHLETE.fullName}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--ink-mute)', transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 160ms' }}>
          <path d="M2 4l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 280,
          background: 'var(--parchment)',
          border: '1px solid var(--rule)',
          borderRadius: 4,
          boxShadow: '0 16px 40px -12px rgba(0,0,0,0.18)',
          padding: 6,
          animation: 'fade-down 160ms ease',
        }}>
          {/* header */}
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--rule-soft)' }}>
            <div className="display" style={{ fontSize: 15, color: 'var(--ink)' }}>{ATHLETE.fullName}</div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-mute)', marginTop: 2 }}>{ATHLETE.email}</div>
          </div>
          {/* nav items */}
          <div style={{ padding: '6px 0' }}>
            {[
              ['Profile', 'profile'],
              ['Settings', 'settings'],
              ['Apps & devices', 'settings:Apps & Devices'],
              ['Notifications', 'settings:Notifications'],
              ['Export data', 'settings:Export data'],
            ].map(([label, target]) => (
              <button key={label} onClick={() => { setOpen(false); onNav(target); }}
                className="menu-item">
                {label}
              </button>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--rule-soft)', padding: '6px 0' }}>
            <button onClick={() => { setOpen(false); onLogout(); }} className="menu-item" style={{ color: 'var(--terracotta-deep)' }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginRight: 8, display: 'inline-block', verticalAlign: '-2px' }}>
                <path d="M9 12l3-4-3-4M12 8H4M4 3v10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Date helpers (local-tz parsing — avoid UTC drift) ──────────────────
function parseLocalDate(d) {
  if (!d) return new Date();
  if (d instanceof Date) return d;
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}
function fmtDate(d, opts) {
  return parseLocalDate(d).toLocaleDateString('en-US', opts);
}

// ─── Brand mark ────────────────────────────────────────────────────────────
function BrandMark() {
  return (
    <div className="brand-mark">
      Andes<span className="dot">.</span>IA
    </div>
  );
}

// ─── Top nav ───────────────────────────────────────────────────────────────
function TopNav({ active, onNav, onRefresh, refreshing, pendingCount, onLogout }) {
  const tabs = [
    { id: 'today', label: 'Today' },
    { id: 'season', label: 'Season' },
    { id: 'profile', label: 'Profile' },
    { id: 'settings', label: 'Settings' },
  ];
  return (
    <header style={{
      borderBottom: '1px solid var(--rule-soft)',
      background: 'oklch(0.985 0.008 75 / 0.85)',
      backdropFilter: 'blur(8px)',
      position: 'sticky', top: 0, zIndex: 20,
    }}>
      <div style={{
        maxWidth: 1440, margin: '0 auto',
        padding: '0 32px',
        height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <BrandMark />
          <nav style={{ display: 'flex', gap: 4 }}>
            {tabs.map(t => (
              <button key={t.id}
                className={`toptab${active === t.id ? ' active' : ''}`}
                onClick={() => onNav(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {pendingCount > 0 && (
            <span className="pending-badge" title="Pending coach review">
              <span className="dot-pending"></span>
              {pendingCount} pending
            </span>
          )}
          <button className="btn btn-ghost btn-icon" onClick={onRefresh} title="Refresh from coach">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
              style={{ transition: 'transform 600ms', transform: refreshing ? 'rotate(360deg)' : 'rotate(0)' }}>
              <path d="M14 8a6 6 0 1 1-1.76-4.24M14 3v3.5h-3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="btn btn-ghost btn-icon" title="Notifications">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 6.5a5 5 0 0 1 10 0V10l1.5 2H1.5L3 10V6.5zM6 13a2 2 0 0 0 4 0" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div style={{ width: 1, height: 22, background: 'var(--rule-soft)' }}></div>
          <UserMenu onNav={onNav} onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}

// ─── Sport glyph ──────────────────────────────────────────────────────────
function SportGlyph({ sport, size = 24 }) {
  const glyph = SPORT_GLYPHS[sport] || '·';
  return (
    <span className="sport-chip" style={{ width: size, height: size, fontSize: size * 0.6, fontFamily: 'var(--display)', color: 'var(--ink-soft)' }}>
      {glyph}
    </span>
  );
}

// ─── Compliance utilities ────────────────────────────────────────────────
function complianceFromStatus(status, value) {
  if (status === 'planned') return { cls: 'planned', label: 'Planned' };
  if (status === 'empty') return { cls: 'empty', label: 'No data' };
  if (status === 'met' || (value != null && value >= 0.85)) return { cls: 'met', label: 'Met' };
  if (status === 'partial' || (value != null && value >= 0.5)) return { cls: 'partial', label: 'Partial' };
  return { cls: 'missed', label: 'Missed' };
}

// ─── Workout card (mosaic cell) ──────────────────────────────────────────
function WorkoutCard({ w, compact, onClick, draggable, onDragStart, onDragOver, onDrop, isDragOver }) {
  const c = complianceFromStatus(w.status, w.compliance);
  const tint = `tint-${w.sport}`;
  const planned = w.planned || {};
  const actual = w.actual;
  return (
    <div
      className={`lift ${tint}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      style={{
        display: 'flex',
        gap: 0,
        padding: 0,
        border: '1px solid',
        borderRadius: 3,
        cursor: 'pointer',
        position: 'relative',
        outline: isDragOver ? '2px solid var(--ink)' : 'none',
        outlineOffset: 2,
      }}>
      <div className={`rail rail-${c.cls}`}></div>
      <div style={{ padding: compact ? '8px 10px' : '10px 12px', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <SportGlyph sport={w.sport} size={20} />
          <span className="eyebrow" style={{ fontSize: 9.5, color: 'var(--ink-mute)' }}>
            {SPORT_LABEL[w.sport]}
          </span>
          {w.coachNote && (
            <span title="Coach note" style={{
              marginLeft: 'auto', fontSize: 10, color: 'var(--terracotta-deep)',
              fontFamily: 'var(--mono)', display: 'inline-flex', alignItems: 'center', gap: 3,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--terracotta-deep)' }}></span>
              MA
            </span>
          )}
        </div>
        <div className="display" style={{ fontSize: compact ? 13 : 14.5, color: 'var(--ink)', lineHeight: 1.25, marginBottom: 6 }}>
          {w.title}
        </div>
        {!compact && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11.5, color: 'var(--ink-soft)' }}>
            {planned.duration && <span className="mono">{actual?.duration || planned.duration}</span>}
            {planned.distance && <span className="mono">{actual?.distance || planned.distance}</span>}
            {planned.tss && <span className="mono" style={{ color: 'var(--ink-mute)' }}>{actual?.tss || planned.tss} TSS</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Compliance pill ──────────────────────────────────────────────────────
function CompliancePill({ status, value, labels }) {
  const c = complianceFromStatus(status, value);
  const labelMap = { met: labels?.met || 'Met', partial: labels?.partial || 'Partial', missed: labels?.missed || 'Missed', empty: labels?.empty || 'Empty', planned: 'Planned' };
  const colorMap = {
    met: { bg: 'var(--c-met-bg)', fg: 'var(--c-met)', bd: 'var(--c-met-border)' },
    partial: { bg: 'var(--c-partial-bg)', fg: 'var(--c-partial)', bd: 'var(--c-partial-border)' },
    missed: { bg: 'var(--c-missed-bg)', fg: 'var(--c-missed)', bd: 'var(--c-missed-border)' },
    empty: { bg: 'var(--c-empty-bg)', fg: 'var(--ink-mute)', bd: 'var(--rule-soft)' },
    planned: { bg: 'var(--linen)', fg: 'var(--ink-soft)', bd: 'var(--rule-soft)' },
  };
  const k = colorMap[c.cls];
  return (
    <span className="mono" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase',
      background: k.bg, color: k.fg, border: `1px solid ${k.bd}`, borderRadius: 2,
    }}>
      <span className={`dot dot-${c.cls}`}></span>
      {labelMap[c.cls]}
      {value != null && status !== 'planned' && status !== 'empty' && (
        <span style={{ opacity: 0.6 }}>· {Math.round(value * 100)}%</span>
      )}
    </span>
  );
}

// ─── Day strip header (Mon, Apr 27) ──────────────────────────────────────
function DayHeader({ date, isToday, dayDate }) {
  const d = parseLocalDate(date);
  const dow = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const num = d.getDate();
  return (
    <div style={{
      padding: '10px 4px 8px',
      borderBottom: isToday ? '2px solid var(--ink)' : '1px solid var(--rule-soft)',
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
    }}>
      <span className="eyebrow" style={{ fontSize: 9.5, color: isToday ? 'var(--ink)' : 'var(--ink-mute)', fontWeight: isToday ? 600 : 400 }}>
        {dow}
      </span>
      <span className="display" style={{ fontSize: 17, color: isToday ? 'var(--ink)' : 'var(--ink-soft)' }}>{num}</span>
    </div>
  );
}

Object.assign(window, {
  BrandMark, TopNav, SportGlyph, WorkoutCard, CompliancePill,
  DayHeader, complianceFromStatus, parseLocalDate, fmtDate,
  useAppState, mergeWorkouts, Confetti, Toast, UserMenu,
});
