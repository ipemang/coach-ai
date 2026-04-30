/* Page 2: Season — 24-week calendar + Periodization blocks (draggable) + Methodology */

const { useState: useState2, useMemo: useMemo2, useRef: useRef2 } = React;

function Season({ onOpenWorkout, density, blockOverrides, onMoveBlock }) {
  const [hoverWeek, setHoverWeek] = useState2(null);

  // Apply block overrides — re-order if order is set
  const blocks = useMemo2(() => {
    const withOrder = SEASON_BLOCKS.map((b, i) => ({
      ...b,
      order: blockOverrides[b.id]?.order ?? i,
    }));
    withOrder.sort((a, b) => a.order - b.order);
    // Recompute start dates after re-ordering — keep season locked to Jan 5
    let cursor = parseLocalDate('2026-01-05');
    return withOrder.map(b => {
      const start = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      const next = new Date(cursor);
      next.setDate(cursor.getDate() + b.weeks * 7);
      cursor = next;
      return { ...b, start };
    });
  }, [blockOverrides]);

  // Build 28 weeks starting Jan 5, 2026 (Mon)
  const weeks = useMemo2(() => {
    const start = parseLocalDate('2026-01-05');
    return Array.from({ length: 28 }, (_, i) => {
      const ws = new Date(start);
      ws.setDate(start.getDate() + i * 7);
      const days = Array.from({ length: 7 }, (_, d) => {
        const dt = new Date(ws);
        dt.setDate(ws.getDate() + d);
        const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), da = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${da}`;
      });
      return { idx: i, start: ws, days };
    });
  }, []);

  function blockForWeek(weekStart) {
    return blocks.find(b => {
      const bs = parseLocalDate(b.start);
      const be = parseLocalDate(b.start);
      be.setDate(bs.getDate() + b.weeks * 7);
      return weekStart >= bs && weekStart < be;
    });
  }

  function dayCell(date) {
    const list = SEASON_DATA[date] || [];
    if (list.length === 0) return { status: 'empty', sport: null, count: 0 };
    const w = list[0];
    let comp = w.compliance;
    if (w.status === 'planned') return { status: 'planned', sport: w.sport, count: list.length };
    return { status: w.status, sport: w.sport, count: list.length, compliance: comp };
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
      {/* LEFT: Season calendar */}
      <div>
        {/* Periodization block strip — draggable */}
        <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
          <div className="sec-h">
            <div>
              <span className="eyebrow">Season</span>
              <h2 style={{ marginTop: 4 }}>Road to Lake Placid</h2>
              <p className="mono" style={{ marginTop: 4, fontSize: 10.5, color: 'var(--ink-mute)' }}>
                Drag a block to re-sequence the season. Coach Andes reviews changes.
              </p>
            </div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
              Jan 5 — Jul 26 · 28 weeks
            </span>
          </div>
          <DraggableBlockBar blocks={blocks} onMove={onMoveBlock} />
          {/* Phase labels under */}
          <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
            {blocks.map(b => (
              <div key={b.id} style={{ flex: b.weeks, fontSize: 10, color: 'var(--ink-mute)', fontFamily: 'var(--mono)', textAlign: 'left' }}>
                {fmtDate(b.start, { month: 'short', day: 'numeric' })}
              </div>
            ))}
          </div>
        </div>

        {/* Calendar weeks */}
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '60px 80px repeat(7, 1fr) 70px',
            background: 'var(--linen)',
            borderBottom: '1px solid var(--rule)',
            padding: '8px 14px',
          }}>
            <span className="eyebrow" style={{ fontSize: 9 }}>Wk</span>
            <span className="eyebrow" style={{ fontSize: 9 }}>Phase</span>
            {['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d => (
              <span key={d} className="eyebrow" style={{ fontSize: 9, textAlign: 'center' }}>{d}</span>
            ))}
            <span className="eyebrow" style={{ fontSize: 9, textAlign: 'right' }}>Comp</span>
          </div>
          <div style={{ maxHeight: 560, overflowY: 'auto' }}>
            {weeks.map((wk, i) => {
              const block = blockForWeek(wk.start);
              const cells = wk.days.map(dayCell);
              const completed = cells.filter(c => c.status === 'met' || c.status === 'partial' || c.status === 'missed');
              const wkComp = completed.length
                ? Math.round(completed.reduce((s, c) => s + (c.compliance || 0), 0) / completed.length * 100)
                : null;
              const todayD = parseLocalDate('2026-04-27');
              const isCurrent = wk.start <= todayD && todayD < new Date(wk.start.getTime() + 7 * 86400000);
              return (
                <div key={wk.idx}
                  onMouseEnter={() => setHoverWeek(wk.idx)}
                  onMouseLeave={() => setHoverWeek(null)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 80px repeat(7, 1fr) 70px',
                    padding: '6px 14px',
                    borderBottom: '1px solid var(--rule-soft)',
                    background: isCurrent ? 'var(--aegean-wash)' : (hoverWeek === wk.idx ? 'var(--linen)' : 'transparent'),
                    alignItems: 'center',
                    gap: 4,
                  }}>
                  <span className="mono" style={{ fontSize: 11, color: isCurrent ? 'var(--ink)' : 'var(--ink-mute)', fontWeight: isCurrent ? 600 : 400 }}>
                    W{wk.idx + 1}
                  </span>
                  <div>
                    <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-mute)' }}>
                      {wk.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    {block && (
                      <div className="mono" style={{ fontSize: 9, color: `var(--${block.color}-deep)`, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 1 }}>
                        {block.phase}
                      </div>
                    )}
                  </div>
                  {cells.map((cell, di) => {
                    const date = wk.days[di];
                    const list = SEASON_DATA[date] || [];
                    const w = list[0];
                    return (
                      <div key={di}
                        onClick={() => w && onOpenWorkout(w)}
                        style={{
                          height: 38,
                          margin: '0 1px',
                          background:
                            cell.status === 'met' ? 'var(--c-met-bg)' :
                            cell.status === 'partial' ? 'var(--c-partial-bg)' :
                            cell.status === 'missed' ? 'var(--c-missed-bg)' :
                            cell.status === 'planned' ? 'var(--linen)' :
                            'transparent',
                          border: '1px solid',
                          borderColor:
                            cell.status === 'met' ? 'var(--c-met-border)' :
                            cell.status === 'partial' ? 'var(--c-partial-border)' :
                            cell.status === 'missed' ? 'var(--c-missed-border)' :
                            cell.status === 'planned' ? 'var(--rule-soft)' :
                            'transparent',
                          borderRadius: 2,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexDirection: 'column',
                          cursor: w ? 'pointer' : 'default',
                          position: 'relative',
                        }}>
                        {cell.sport && (
                          <span style={{
                            fontFamily: 'var(--display)',
                            fontSize: 14,
                            color:
                              cell.status === 'met' ? 'var(--c-met)' :
                              cell.status === 'partial' ? 'var(--c-partial)' :
                              cell.status === 'missed' ? 'var(--c-missed)' :
                              'var(--ink-soft)',
                          }}>
                            {SPORT_GLYPHS[cell.sport]}
                          </span>
                        )}
                        {cell.count > 1 && (
                          <span className="mono" style={{ fontSize: 8, color: 'var(--ink-mute)', position: 'absolute', top: 1, right: 3 }}>
                            +{cell.count - 1}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <span className="mono" style={{ fontSize: 11, color: wkComp != null ? (wkComp >= 85 ? 'var(--c-met)' : wkComp >= 50 ? 'var(--c-partial)' : 'var(--c-missed)') : 'var(--ink-faint)', textAlign: 'right' }}>
                    {wkComp != null ? `${wkComp}%` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Compliance legend */}
        <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--ink-mute)' }}>
          <span><span className="dot dot-met"></span> Met (≥85%)</span>
          <span><span className="dot dot-partial"></span> Partial (50–85%)</span>
          <span><span className="dot dot-missed"></span> Missed (&lt;50%)</span>
          <span><span className="dot dot-empty"></span> Empty</span>
        </div>
      </div>

      {/* RIGHT: Methodology only (coach profile moved to Profile tab) */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="panel" style={{ padding: 22 }}>
          <span className="eyebrow">Methodology</span>
          <h3 className="display" style={{ fontSize: 18, margin: '6px 0 14px' }}>How we train</h3>
          <div className="pullquote" style={{ marginBottom: 16, fontSize: 15 }}>
            "{COACH.philosophy}"
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {METHODOLOGY.map((m, i) => (
              <div key={m.id}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>0{i + 1}</span>
                  <h4 className="display" style={{ fontSize: 14, margin: 0, color: 'var(--ink)' }}>{m.title}</h4>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6, paddingLeft: 24 }}>
                  {m.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

// Draggable block bar — drag any block left/right to reorder.
function DraggableBlockBar({ blocks, onMove }) {
  const [dragId, setDragId] = useState2(null);
  const [overId, setOverId] = useState2(null);
  const [overSide, setOverSide] = useState2('before');

  function handleDrop(targetId) {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const order = blocks.map(b => b.id);
    const fromIdx = order.indexOf(dragId);
    const toIdx = order.indexOf(targetId);
    order.splice(fromIdx, 1);
    let insertIdx = order.indexOf(targetId);
    if (overSide === 'after') insertIdx += 1;
    order.splice(insertIdx, 0, dragId);
    // Push order updates for every block
    order.forEach((id, i) => onMove(id, i));
    setDragId(null);
    setOverId(null);
  }

  const colorMap = {
    aegean: { bg: 'var(--aegean-wash)', fg: 'var(--aegean-deep)', bd: 'var(--aegean-soft)' },
    olive: { bg: 'var(--olive-wash)', fg: 'var(--olive-deep)', bd: 'var(--olive-soft)' },
    terracotta: { bg: 'var(--terracotta-wash)', fg: 'var(--terracotta-deep)', bd: 'var(--terracotta-soft)' },
    amber: { bg: 'var(--amber-wash)', fg: 'var(--amber-deep)', bd: 'var(--amber-soft)' },
  };

  return (
    <div style={{ display: 'flex', gap: 2, height: 44, marginTop: 8 }}>
      {blocks.map(b => {
        const k = colorMap[b.color];
        const isDrag = dragId === b.id;
        const isOver = overId === b.id;
        return (
          <div key={b.id}
            draggable
            onDragStart={(e) => { setDragId(b.id); e.dataTransfer.effectAllowed = 'move'; }}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            onDragOver={(e) => {
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const mid = rect.left + rect.width / 2;
              setOverId(b.id);
              setOverSide(e.clientX < mid ? 'before' : 'after');
            }}
            onDragLeave={() => setOverId(prev => prev === b.id ? null : prev)}
            onDrop={(e) => { e.preventDefault(); handleDrop(b.id); }}
            className={`season-block${isDrag ? ' dragging' : ''}${isOver && !isDrag ? (overSide === 'before' ? ' drop-before' : ' drop-after') : ''}`}
            title={`${b.name} · ${b.weeks} weeks · drag to reorder`}
            style={{
              flex: b.weeks,
              background: k.bg,
              border: `1px solid ${k.bd}`,
              borderTop: b.current ? `3px solid ${k.fg}` : `1px solid ${k.bd}`,
              padding: '6px 10px',
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: k.fg,
              cursor: 'grab',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              overflow: 'hidden',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              borderRadius: 2,
              gap: 4,
            }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
              <svg width="9" height="13" viewBox="0 0 9 13" fill="currentColor" style={{ opacity: 0.5, flexShrink: 0 }}>
                <circle cx="2" cy="2" r="1" /><circle cx="7" cy="2" r="1" />
                <circle cx="2" cy="6.5" r="1" /><circle cx="7" cy="6.5" r="1" />
                <circle cx="2" cy="11" r="1" /><circle cx="7" cy="11" r="1" />
              </svg>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
            </span>
            {b.weeks >= 3 && <span style={{ opacity: 0.55, marginLeft: 4 }}>{b.weeks}w</span>}
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { Season });
