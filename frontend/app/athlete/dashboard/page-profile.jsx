/* Page 3: Profile — athlete overview + AI weekly report + Coach + Memory log */

const { useState: useState3 } = React;

// Helper: cadence badge color
function CadenceBadge({ cadence }) {
  const map = {
    weekly: { label: 'Weekly', bg: 'var(--aegean-wash)', fg: 'var(--aegean-deep)', bd: 'var(--aegean-soft)' },
    monthly: { label: 'Monthly', bg: 'var(--olive-wash)', fg: 'var(--olive-deep)', bd: 'var(--olive-soft)' },
    block: { label: 'Block', bg: 'var(--terracotta-wash)', fg: 'var(--terracotta-deep)', bd: 'var(--terracotta-soft)' },
  };
  const k = map[cadence] || map.weekly;
  return (
    <span className="mono" style={{
      fontSize: 9,
      padding: '2px 7px',
      background: k.bg,
      color: k.fg,
      border: `1px solid ${k.bd}`,
      borderRadius: 2,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
    }}>{k.label}</span>
  );
}

function Profile({ tab, onTab, memory }) {
  const r = WEEKLY_REPORT;
  const activeTab = tab || 'report';
  const setActiveTab = onTab || (() => {});
  const [reportExpanded, setReportExpanded] = useState3(false);
  const [openPastReport, setOpenPastReport] = useState3(null);

  // WhatsApp deeplink — strips non-digits and prefixes wa.me
  const waNumber = COACH.whatsapp.replace(/[^\d]/g, '');
  const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent("Hey Coach — quick question about this week.")}`;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>
      {/* Left: Athlete card */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="panel" style={{ padding: 24 }}>
          <div className="placeholder-stripe" style={{ width: 80, height: 80, borderRadius: 999, marginBottom: 14 }}>
            {ATHLETE.initials}
          </div>
          <div className="display" style={{ fontSize: 22, margin: '0 0 2px', color: 'var(--ink)' }}>{ATHLETE.fullName}</div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 18 }}>
            {ATHLETE.type} · Age {ATHLETE.age}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 18, borderTop: '1px solid var(--rule-soft)' }}>
            <PRow label="Goal event" value={ATHLETE.goal} />
            <PRow label="Race date" value="July 26, 2026" />
            <PRow label="Weeks out" value={`${ATHLETE.weeksOut}`} />
            <PRow label="Coach" value={COACH.name} />
          </div>
        </div>

        <div className="panel" style={{ padding: 22 }}>
          <span className="eyebrow">Performance markers</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
            <BigStat label="FTP" value={ATHLETE.ftp} unit="W" />
            <BigStat label="Threshold pace" value={ATHLETE.thresholdPace} />
            <BigStat label="CSS pace" value={ATHLETE.cssPace} />
          </div>
        </div>

        <div className="panel" style={{ padding: 22, background: 'var(--aegean-wash)', borderColor: 'var(--aegean-soft)' }}>
          <span className="eyebrow eyebrow-aegean">AI Profile</span>
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.65 }}>
            {AI_PROFILE}
          </p>
        </div>
      </aside>

      {/* Right: Tabs */}
      <main>
        <div className="toptabs" style={{ marginBottom: 20 }}>
          <button className={`toptab${activeTab === 'report' ? ' active' : ''}`} onClick={() => setActiveTab('report')}>Reports</button>
          <button className={`toptab${activeTab === 'coach' ? ' active' : ''}`} onClick={() => setActiveTab('coach')}>Coach</button>
          <button className={`toptab${activeTab === 'memory' ? ' active' : ''}`} onClick={() => setActiveTab('memory')}>Memory</button>
          <button className={`toptab${activeTab === 'files' ? ' active' : ''}`} onClick={() => setActiveTab('files')}>Files</button>
        </div>

        {activeTab === 'report' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Hero report */}
            <div className="panel" style={{ padding: '32px 36px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="eyebrow">Week of {fmtDate(r.weekOf, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                  <CadenceBadge cadence="weekly" />
                </div>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--olive-deep)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>● {r.status}</span>
              </div>
              <h1 className="display" style={{ fontSize: 38, margin: '0 0 24px', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
                Strong block. Hold the volume.
              </h1>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid var(--rule-soft)' }}>
                <BigStat label="Hours trained" value={`${r.hours}`} unit={`/ ${r.hoursPlanned}h`} large />
                <BigStat label="Compliance" value={`${Math.round(r.compliance * 100)}%`} large />
                <BigStat label="Sessions" value="6/7" large />
              </div>
              <div style={{ display: 'flex', gap: 14, marginBottom: 28, alignItems: 'flex-start' }}>
                <div className="avatar avatar-coach avatar-lg" style={{ width: 44, height: 44, fontSize: 16 }}>{COACH.initials}</div>
                <div style={{ flex: 1 }}>
                  <div className="eyebrow eyebrow-terracotta" style={{ fontSize: 9.5, marginBottom: 6 }}>From Coach Andes</div>
                  {r.fromCoach.split('\n\n').map((p, i) => (
                    <p key={i} className="display" style={{ margin: i ? '14px 0 0' : 0, fontSize: 16, lineHeight: 1.6, color: 'var(--ink)' }}>{p}</p>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: reportExpanded ? 28 : 0 }}>
                <div>
                  <span className="eyebrow eyebrow-olive" style={{ fontSize: 9.5 }}>Highlights</span>
                  <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {r.highlights.map((h, i) => (
                      <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
                        <span style={{ color: 'var(--olive-deep)', fontFamily: 'var(--mono)', fontSize: 11, marginTop: 2 }}>+</span>{h}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="eyebrow eyebrow-terracotta" style={{ fontSize: 9.5 }}>Watchouts</span>
                  <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {r.watchouts.map((h, i) => (
                      <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
                        <span style={{ color: 'var(--terracotta-deep)', fontFamily: 'var(--mono)', fontSize: 11, marginTop: 2 }}>!</span>{h}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Expand/collapse full report */}
              {reportExpanded && r.fullReport && (
                <div style={{ marginTop: 8, paddingTop: 28, borderTop: '1px solid var(--rule-soft)' }}>
                  <span className="eyebrow">The full read</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 14 }}>
                    {r.fullReport.map((sec, i) => (
                      <div key={i}>
                        <h3 className="display" style={{ fontSize: 17, margin: '0 0 6px', color: 'var(--ink)', letterSpacing: '-0.01em' }}>
                          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginRight: 8, letterSpacing: '0.12em' }}>{String(i + 1).padStart(2, '0')}</span>
                          {sec.heading}
                        </h3>
                        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.7 }}>{sec.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Toggle button */}
              <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--rule-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-mute)' }}>
                  {reportExpanded ? 'Full report — drafted by AI, signed by Coach Andes.' : `${r.fullReport?.length || 0} sections of detail available.`}
                </span>
                <button className="btn" onClick={() => setReportExpanded(v => !v)}>
                  {reportExpanded ? '↑ Collapse' : '↓ Expand full report'}
                </button>
              </div>
            </div>

            {/* By sport */}
            <div className="panel" style={{ padding: 24 }}>
              <span className="eyebrow">Compliance by sport</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                {Object.entries(r.bySport).map(([sport, value]) => (
                  <div key={sport} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 50px', alignItems: 'center', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SportGlyph sport={sport} size={20} />
                      <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{SPORT_LABEL[sport]}</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--linen-deep)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${value * 100}%`, background: value >= 0.85 ? 'var(--c-met)' : value >= 0.5 ? 'var(--c-partial)' : 'var(--c-missed)' }}></div>
                    </div>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--ink)', textAlign: 'right' }}>{Math.round(value * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Previous reports */}
            <div className="panel" style={{ padding: 28 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="eyebrow">Previous reports</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{(PAST_REPORTS || []).length} archived</span>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '0 0 16px', lineHeight: 1.5 }}>
                Coach Andes ships {COACH.reportCadence === 'weekly' ? 'weekly' : COACH.reportCadence === 'monthly' ? 'monthly' : 'block-based'} reports — change the cadence in <span className="mono" style={{ color: 'var(--ink)' }}>Settings → Coaches</span>.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(PAST_REPORTS || []).map((p, i) => (
                  <div key={p.id}
                    onClick={() => setOpenPastReport(p)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '110px 70px 1fr 70px 24px',
                      gap: 18,
                      alignItems: 'center',
                      padding: '14px 0',
                      borderTop: i ? '1px solid var(--rule-soft)' : 'none',
                      cursor: 'pointer',
                    }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
                      {fmtDate(p.weekOf, { month: 'short', day: 'numeric' })}
                    </span>
                    <CadenceBadge cadence={p.cadence} />
                    <div>
                      <div className="display" style={{ fontSize: 14.5, color: 'var(--ink)', marginBottom: 2 }}>{p.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.summary}</div>
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: p.compliance >= 0.85 ? 'var(--c-met)' : p.compliance >= 0.5 ? 'var(--c-partial)' : 'var(--c-missed)', textAlign: 'right' }}>
                      {Math.round(p.compliance * 100)}%
                    </span>
                    <span style={{ color: 'var(--ink-faint)', textAlign: 'right' }}>›</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'coach' && (
          <div className="panel" style={{ padding: '32px 36px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 24 }}>
              <div className="avatar avatar-coach" style={{ width: 88, height: 88, fontSize: 30 }}>{COACH.initials}</div>
              <div style={{ flex: 1 }}>
                <span className="eyebrow eyebrow-terracotta">Your coach</span>
                <h2 className="display" style={{ fontSize: 32, margin: '4px 0 4px', letterSpacing: '-0.02em' }}>{COACH.name}</h2>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                  {COACH.title} · Active since Jan 2025
                </div>
              </div>
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary"
                 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.149-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                </svg>
                WhatsApp
              </a>
            </div>
            <p style={{ margin: '0 0 22px', fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.7 }}>{COACH.bio}</p>
            <div className="pullquote" style={{ fontSize: 22, marginBottom: 18 }}>"{COACH.philosophy}"</div>
            <div style={{ display: 'flex', gap: 28, padding: '14px 18px', background: 'var(--linen)', borderRadius: 3, marginBottom: 28, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>WhatsApp</span>
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: 13, color: 'var(--ink)', textDecoration: 'none' }}>{COACH.whatsappLabel}</a>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Email</span>
                <span className="mono" style={{ fontSize: 13, color: 'var(--ink)' }}>{COACH.email}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Report cadence</span>
                <span className="mono" style={{ fontSize: 13, color: 'var(--ink)', textTransform: 'capitalize' }}>{COACH.reportCadence}{COACH.reportCadence !== 'off' ? ` · ${COACH.reportDay}s` : ''}</span>
              </div>
            </div>
            <div style={{ paddingTop: 22, borderTop: '1px solid var(--rule-soft)' }}>
              <span className="eyebrow">How we train together</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 14 }}>
                {METHODOLOGY.map((m, i) => (
                  <div key={m.id}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>0{i + 1}</span>
                      <h4 className="display" style={{ fontSize: 15, margin: 0, color: 'var(--ink)' }}>{m.title}</h4>
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.65, paddingLeft: 22 }}>{m.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'memory' && (
          <div className="panel" style={{ padding: 28 }}>
            <span className="eyebrow">Athlete memory</span>
            <h2 className="display" style={{ fontSize: 22, margin: '6px 0 6px' }}>What Coach Andes knows about you</h2>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 20px', lineHeight: 1.6 }}>
              An append-only log of everything you've shared, completed, and rescheduled — sent to <span className="mono">coach.ai</span> as context for every weekly report. <span style={{ color: 'var(--ink-mute)' }}>You can clear individual entries in Settings.</span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {(memory || []).slice().reverse().map((m, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 90px 1fr', gap: 16, padding: '12px 0', borderTop: i ? '1px solid var(--rule-soft)' : 'none', alignItems: 'baseline' }}>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-mute)' }}>
                    {new Date(m.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className="mono" style={{ fontSize: 9.5, padding: '2px 6px', background: 'var(--linen-deep)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.1em', borderRadius: 2, justifySelf: 'start' }}>
                    {m.kind}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{m.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="panel" style={{ padding: 28 }}>
            <span className="eyebrow">Shared files</span>
            <p style={{ margin: '6px 0 16px', fontSize: 12.5, color: 'var(--ink-soft)' }}>Files you and Coach Andes share. Visible to both.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { name: 'Lake Placid bike course profile.pdf', size: '2.1 MB', from: 'coach', when: 'Apr 22' },
                { name: 'Race nutrition plan v3.pdf', size: '440 KB', from: 'coach', when: 'Apr 18' },
                { name: 'Bloodwork — March.pdf', size: '180 KB', from: 'felipe', when: 'Mar 31' },
                { name: 'FTP test results.csv', size: '12 KB', from: 'felipe', when: 'Mar 15' },
              ].map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', border: '1px solid var(--rule-soft)', borderRadius: 3, background: 'var(--linen)' }}>
                  <div className="placeholder-stripe" style={{ width: 32, height: 40, borderRadius: 2, fontSize: 8 }}>PDF</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--ink)' }}>{f.name}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 2 }}>
                      {f.size} · {f.from === 'coach' ? 'From Coach Andes' : 'You uploaded'} · {f.when}
                    </div>
                  </div>
                  <button className="btn btn-ghost">Open</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Past report detail modal */}
      {openPastReport && (
        <div className="modal-backdrop" onClick={() => setOpenPastReport(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--parchment)',
            width: 'min(720px, 92vw)',
            maxHeight: '90vh',
            overflow: 'auto',
            borderRadius: 4,
            border: '1px solid var(--rule)',
            animation: 'slide-up 200ms ease',
          }}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--rule-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span className="eyebrow">Week of {fmtDate(openPastReport.weekOf, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                  <CadenceBadge cadence={openPastReport.cadence} />
                </div>
                <h2 className="display" style={{ fontSize: 26, margin: 0, letterSpacing: '-0.02em' }}>{openPastReport.title}</h2>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setOpenPastReport(null)}>×</button>
            </div>
            <div style={{ padding: '24px 32px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid var(--rule-soft)' }}>
                <BigStat label="Hours" value={`${openPastReport.hours}`} unit={`/ ${openPastReport.hoursPlanned}h`} />
                <BigStat label="Compliance" value={`${Math.round(openPastReport.compliance * 100)}%`} />
                <BigStat label="Cadence" value={openPastReport.cadence} />
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div className="avatar avatar-coach avatar-lg" style={{ width: 40, height: 40, fontSize: 14 }}>{COACH.initials}</div>
                <div style={{ flex: 1 }}>
                  <div className="eyebrow eyebrow-terracotta" style={{ fontSize: 9.5, marginBottom: 6 }}>From Coach Andes</div>
                  <p className="display" style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, color: 'var(--ink)' }}>{openPastReport.summary}</p>
                </div>
              </div>
              <p className="mono" style={{ marginTop: 24, fontSize: 10.5, color: 'var(--ink-mute)' }}>
                Archived report · read-only.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PRow({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function BigStat({ label, value, unit, large }) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 9.5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 4, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
        <span className="display" style={{ fontSize: large ? 32 : 20, color: 'var(--ink)', lineHeight: 1 }}>{value}</span>
        {unit && <span className="mono" style={{ fontSize: large ? 13 : 11, color: 'var(--ink-mute)' }}>{unit}</span>}
      </div>
    </div>
  );
}

Object.assign(window, { Profile, BigStat });
