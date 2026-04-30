/* Page 4: Settings — TrainingPeaks-inspired sidebar + form panels */

const { useState: useState4 } = React;

const SETTINGS_NAV = [
  { group: 'Account', items: ['Profile', 'Coaches', 'Notifications'] },
  { group: 'Training', items: ['Calendar', 'Zones', 'Equipment', 'Layout'] },
  { group: 'Data', items: ['Apps & Devices', 'Export data'] },
  { group: 'About', items: ['Help', 'Privacy', 'Terms'] },
];

function Settings({ tweaks, setTweak, section: sectionProp, onSection, onLogout }) {
  const [internalSection, setInternalSection] = useState4('Profile');
  const section = sectionProp || internalSection;
  const setSection = (s) => { setInternalSection(s); onSection && onSection(s); };

  return (
    <div className="panel" style={{ display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: 640, padding: 0, overflow: 'hidden', background: 'var(--parchment)' }}>
      {/* Sidebar */}
      <aside style={{ borderRight: '1px solid var(--rule-soft)', padding: '28px 0', background: 'var(--linen)' }}>
        <div style={{ padding: '0 22px 18px' }}>
          <span className="eyebrow">Account settings</span>
        </div>
        {SETTINGS_NAV.map(g => (
          <div key={g.group} style={{ marginBottom: 14 }}>
            <div style={{ padding: '4px 22px', fontSize: 9.5, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
              {g.group}
            </div>
            {g.items.map(it => (
              <button key={it}
                onClick={() => setSection(it)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '7px 22px',
                  fontSize: 13,
                  fontFamily: 'var(--body)',
                  color: section === it ? 'var(--ink)' : 'var(--ink-soft)',
                  background: section === it ? 'var(--linen-deep)' : 'transparent',
                  borderLeft: section === it ? '2px solid var(--ink)' : '2px solid transparent',
                  border: 'none',
                  borderLeftStyle: 'solid',
                  cursor: 'pointer',
                  fontWeight: section === it ? 500 : 400,
                }}>
                {it}
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* Content */}
      <div style={{ padding: '32px 40px', overflowY: 'auto', maxHeight: '78vh' }}>
        <div className="display" style={{ fontSize: 28, color: 'var(--ink)', marginBottom: 6 }}>{section}</div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-mute)', marginBottom: 28 }}>
          Changes save to your profile and sync to Coach Andes' dashboard.
        </div>

        {section === 'Profile' && <ProfileSettings onLogout={onLogout} />}
        {section === 'Calendar' && <CalendarSettings tweaks={tweaks} setTweak={setTweak} />}
        {section === 'Coaches' && <CoachesSettings />}
        {section === 'Apps & Devices' && <DevicesSettings />}
        {section === 'Zones' && <ZonesSettings />}
        {section === 'Equipment' && <EquipmentSettings />}
        {section === 'Layout' && <LayoutSettings tweaks={tweaks} setTweak={setTweak} />}
        {section === 'Notifications' && <NotificationsSettings />}
        {section === 'Export data' && <ExportSettings />}
        {(section === 'Help' || section === 'Privacy' || section === 'Terms') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {['Terms of Use', 'Privacy Policy', 'HIPAA', 'Sources & Citations'].map(l => (
              <a key={l} href="#" style={{ fontSize: 14, color: 'var(--ink)', textDecoration: 'none', padding: '12px 16px', border: '1px solid var(--rule-soft)', borderRadius: 3, background: 'var(--linen)', display: 'flex', justifyContent: 'space-between' }}>
                {l} <span style={{ color: 'var(--ink-faint)' }}>↗</span>
              </a>
            ))}
          </div>
        )}

        <div style={{ marginTop: 36, paddingTop: 20, borderTop: '1px solid var(--rule-soft)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn">Save</button>
          <button className="btn btn-primary">Save & close</button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, children, sub }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24, alignItems: 'center', padding: '10px 0' }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{label}</div>
        {sub && <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SectionTitle({ children }) {
  return <div className="display" style={{ fontSize: 16, color: 'var(--ink)', margin: '20px 0 8px', paddingTop: 18, borderTop: '1px solid var(--rule-soft)' }}>{children}</div>;
}

function ProfileSettings({ onLogout }) {
  return (
    <div>
      <FieldRow label="Full name"><input className="input" defaultValue={ATHLETE.fullName} /></FieldRow>
      <FieldRow label="Email"><input className="input" defaultValue={ATHLETE.email} /></FieldRow>
      <FieldRow label="Athlete type">
        <select className="select" defaultValue="Triathlete">
          <option>Triathlete</option><option>Runner</option><option>Cyclist</option><option>Swimmer</option>
        </select>
      </FieldRow>
      <FieldRow label="Age"><input className="input" defaultValue={ATHLETE.age} type="number" style={{ maxWidth: 100 }} /></FieldRow>
      <FieldRow label="Goal event"><input className="input" defaultValue={ATHLETE.goal} /></FieldRow>
      <FieldRow label="Goal date"><input className="input" defaultValue="2026-07-26" type="date" style={{ maxWidth: 200 }} /></FieldRow>

      <SectionTitle>Photo</SectionTitle>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div className="placeholder-stripe" style={{ width: 84, height: 84, borderRadius: 999 }}>{ATHLETE.initials}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn">Upload photo</button>
          <button className="btn btn-ghost">Remove</button>
        </div>
      </div>

      <SectionTitle>Session</SectionTitle>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: 16, border: '1px solid var(--rule-soft)', background: 'var(--linen)', borderRadius: 3 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>Sign out of all devices</div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-mute)', marginTop: 2 }}>You'll need to sign in again on web and iOS.</div>
        </div>
        <button className="btn" onClick={onLogout} style={{ color: 'var(--terracotta-deep)', borderColor: 'var(--terracotta-soft)' }}>Sign out</button>
      </div>
    </div>
  );
}

function CalendarSettings({ tweaks, setTweak }) {
  return (
    <div>
      <FieldRow label="Week starts on" sub="Affects all calendar views">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <button key={d}
              onClick={() => setTweak('weekStart', d)}
              className="btn"
              style={{
                background: tweaks.weekStart === d ? 'var(--ink)' : 'var(--linen)',
                color: tweaks.weekStart === d ? 'var(--parchment)' : 'var(--ink)',
                borderColor: tweaks.weekStart === d ? 'var(--ink)' : 'var(--rule)',
              }}>{d}</button>
          ))}
        </div>
      </FieldRow>
      <FieldRow label="Date format">
        <select className="select" style={{ maxWidth: 200 }} defaultValue="MM/DD/YY"><option>MM/DD/YY</option><option>DD/MM/YY</option><option>YYYY-MM-DD</option></select>
      </FieldRow>
      <FieldRow label="Time zone">
        <select className="select" style={{ maxWidth: 280 }} defaultValue="America/New_York (GMT−4)">
          <option>America/New_York (GMT−4)</option><option>America/Los_Angeles (GMT−7)</option><option>Europe/London (GMT+1)</option>
        </select>
      </FieldRow>
      <FieldRow label="Units">
        <select className="select" style={{ maxWidth: 160 }} defaultValue="Imperial"><option>Imperial</option><option>Metric</option></select>
      </FieldRow>
    </div>
  );
}

function CoachesSettings() {
  const [cadence, setCadence] = useState4(COACH.reportCadence);
  const [reportDay, setReportDay] = useState4(COACH.reportDay);
  const waNumber = COACH.whatsapp.replace(/[^\d]/g, '');
  const waUrl = `https://wa.me/${waNumber}`;
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 16px' }}>
        Coaches see everything in your dashboard — workouts, comments, voice memos, biometrics. They can edit your plan; you'll see changes flagged for review.
      </p>
      <div style={{ padding: 20, border: '1px solid var(--rule-soft)', background: 'var(--linen)', borderRadius: 3 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div className="avatar avatar-coach" style={{ width: 48, height: 48, fontSize: 17 }}>{COACH.initials}</div>
          <div style={{ flex: 1 }}>
            <div className="display" style={{ fontSize: 17, color: 'var(--ink)' }}>{COACH.name}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{COACH.title} · Active since Jan 2025</div>
          </div>
          <span className="mono" style={{ fontSize: 10, padding: '4px 10px', background: 'var(--olive-wash)', color: 'var(--olive-deep)', border: '1px solid var(--olive-soft)', borderRadius: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Primary</span>
        </div>
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--rule-soft)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn"
             style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'var(--olive-deep)', borderColor: 'var(--olive-soft)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.149-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
            </svg>
            WhatsApp · {COACH.whatsappLabel}
          </a>
          <button className="btn btn-ghost">View philosophy</button>
          <button className="btn btn-ghost" style={{ color: 'var(--terracotta-deep)' }}>Disconnect</button>
        </div>
      </div>

      <SectionTitle>Reports from {COACH.name}</SectionTitle>
      <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '-8px 0 14px', lineHeight: 1.5 }}>
        Your coach decides whether to publish reports and how often. Drafted by AI from your week, signed off by Coach Andes before you see them.
      </p>
      <FieldRow label="Cadence" sub="How often Coach Andes publishes a written report.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, maxWidth: 460 }}>
          {[
            { v: 'weekly', label: 'Weekly', sub: 'Every Monday' },
            { v: 'monthly', label: 'Monthly', sub: '1st of month' },
            { v: 'block', label: 'Per block', sub: 'End of phase' },
            { v: 'off', label: 'Off', sub: 'No reports' },
          ].map(opt => (
            <button key={opt.v}
              onClick={() => setCadence(opt.v)}
              className="btn"
              style={{
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '10px 12px',
                background: cadence === opt.v ? 'var(--aegean-wash)' : 'var(--linen)',
                borderColor: cadence === opt.v ? 'var(--aegean-deep)' : 'var(--rule-soft)',
                color: cadence === opt.v ? 'var(--aegean-deep)' : 'var(--ink)',
                gap: 2,
              }}>
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>{opt.label}</span>
              <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{opt.sub}</span>
            </button>
          ))}
        </div>
      </FieldRow>
      {cadence === 'weekly' && (
        <FieldRow label="Delivery day">
          <select className="select" value={reportDay} onChange={e => setReportDay(e.target.value)} style={{ maxWidth: 200 }}>
            {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => <option key={d}>{d}</option>)}
          </select>
        </FieldRow>
      )}
      <FieldRow label="Notify athlete on publish">
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" defaultChecked style={{ accentColor: 'var(--aegean-deep)' }} />
          Email + push notification when a new report is ready
        </label>
      </FieldRow>

      <button className="btn" style={{ marginTop: 16 }}>+ Invite a coach</button>
    </div>
  );
}

function DevicesSettings() {
  const devices = [
    { name: 'Whoop', logo: 'W', connected: true },
    { name: 'Oura', logo: 'O', connected: false },
    { name: 'Garmin', logo: 'G', connected: false },
    { name: 'Apple Health', logo: '', connected: false },
    { name: 'Strava', logo: 'S', connected: true },
    { name: 'Zwift', logo: 'Z', connected: false },
  ];
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 16px' }}>
        Connected devices feed into your readiness rail and are reviewed alongside workout data.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {devices.map(d => (
          <div key={d.name} style={{ padding: 14, border: '1px solid var(--rule-soft)', background: 'var(--linen)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="placeholder-stripe" style={{ width: 36, height: 36, borderRadius: 6, fontSize: 14, color: 'var(--ink)' }}>{d.logo}</div>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{d.name}</span>
            {d.connected ? (
              <button className="btn btn-ghost" style={{ color: 'var(--olive-deep)' }}>● Connected</button>
            ) : (
              <button className="btn">Connect</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ZonesSettings() {
  const zones = [
    { name: 'Z1 · Recovery', power: '0–155', hr: '<128' },
    { name: 'Z2 · Endurance', power: '155–210', hr: '128–145' },
    { name: 'Z3 · Tempo', power: '210–235', hr: '145–157' },
    { name: 'Z4 · Threshold', power: '235–260', hr: '157–170' },
    { name: 'Z5 · VO₂ max', power: '260–295', hr: '170–178' },
    { name: 'Z6 · Anaerobic', power: '>295', hr: '>178' },
  ];
  return (
    <div>
      <FieldRow label="FTP" sub="Set or auto-detect from last test"><input className="input" defaultValue={ATHLETE.ftp} type="number" style={{ maxWidth: 140 }} /> W</FieldRow>
      <FieldRow label="Threshold HR"><input className="input" defaultValue="170" type="number" style={{ maxWidth: 140 }} /> bpm</FieldRow>
      <SectionTitle>Cycling zones</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {zones.map((z, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: 12, padding: '8px 12px', border: '1px solid var(--rule-soft)', borderRadius: 2, background: i % 2 ? 'var(--parchment)' : 'var(--linen)' }}>
            <span style={{ fontSize: 13, color: 'var(--ink)' }}>{z.name}</span>
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{z.power} W</span>
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{z.hr} bpm</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EquipmentSettings() {
  const [bikes, setBikes] = useState4([
    { id: 'b1', name: 'Cannondale SuperSix Evo', brand: 'Cannondale', model: 'SuperSix Evo Hi-Mod', wheels: 'DT Swiss ARC 1100', crank: '172.5', purchased: '2024-03-12', startDistance: 0, distance: 3037, notes: 'Race bike. Replace chain at 5000 mi.', isDefault: true, retired: false },
    { id: 'b2', name: 'Specialized Tarmac SL7', brand: 'Specialized', model: 'Tarmac SL7 Comp', wheels: 'Roval Alpinist', crank: '172.5', purchased: '2022-07-04', startDistance: 0, distance: 11240, notes: 'Training bike — rain machine.', isDefault: false, retired: false },
  ]);
  const [shoes, setShoes] = useState4([
    { id: 's1', name: 'Brooks Hyperion Tempo', brand: 'Brooks', model: 'Hyperion Tempo', purchased: '2026-02-14', startDistance: 0, maxDistance: 500, distance: 152, notes: 'Tempo + race-pace days.', isDefault: true, retired: false },
    { id: 's2', name: 'Saucony Endorphin Speed 4', brand: 'Saucony', model: 'Endorphin Speed 4', purchased: '2025-11-03', startDistance: 0, maxDistance: 600, distance: 273, notes: 'Long runs + everyday miles.', isDefault: false, retired: false },
    { id: 's3', name: 'Hoka Bondi 8', brand: 'Hoka', model: 'Bondi 8', purchased: '2025-04-22', startDistance: 0, maxDistance: 500, distance: 487, notes: 'Recovery only. Almost done.', isDefault: false, retired: false },
  ]);
  const [pools, setPools] = useState4([
    { id: 'p1', name: 'Local YMCA · 25m', length: 25, units: 'Meters', notes: 'Lanes 4–6 lap-only AM.', isDefault: true, retired: false },
    { id: 'p2', name: 'University Aquatic · 50m', length: 50, units: 'Meters', notes: 'Open lap swim 6–7 PM weekdays.', isDefault: false, retired: false },
    { id: 'p3', name: 'Hotel pool · 20yd', length: 20, units: 'Yards', notes: 'Travel — short course.', isDefault: false, retired: false },
  ]);

  const [addingBike, setAddingBike] = useState4(false);
  const [addingShoes, setAddingShoes] = useState4(false);
  const [addingPool, setAddingPool] = useState4(false);

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 18px' }}>
        Track gear by sport. Mileage and pool distance auto-tally from completed workouts. Mark a default to attach it automatically.
      </p>

      <SectionTitle>Bikes</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bikes.map(b => (
          <EquipmentCard key={b.id} kind="bike" item={b}
            onUpdate={(next) => setBikes(prev => prev.map(x => x.id === b.id ? next : x))}
            onDelete={() => setBikes(prev => prev.filter(x => x.id !== b.id))}
            onSetDefault={() => setBikes(prev => prev.map(x => ({ ...x, isDefault: x.id === b.id })))} />
        ))}
        {addingBike ? (
          <BikeForm
            onSave={(b) => { setBikes(prev => [...prev, { id: 'b' + Date.now(), distance: 0, ...b }]); setAddingBike(false); }}
            onCancel={() => setAddingBike(false)} />
        ) : (
          <button className="btn" onClick={() => setAddingBike(true)} style={{ marginTop: 4, alignSelf: 'flex-start' }}>+ Add bike</button>
        )}
      </div>

      <SectionTitle>Shoes</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {shoes.map(s => (
          <EquipmentCard key={s.id} kind="shoes" item={s}
            onUpdate={(next) => setShoes(prev => prev.map(x => x.id === s.id ? next : x))}
            onDelete={() => setShoes(prev => prev.filter(x => x.id !== s.id))}
            onSetDefault={() => setShoes(prev => prev.map(x => ({ ...x, isDefault: x.id === s.id })))} />
        ))}
        {addingShoes ? (
          <ShoesForm
            onSave={(s) => { setShoes(prev => [...prev, { id: 's' + Date.now(), distance: 0, ...s }]); setAddingShoes(false); }}
            onCancel={() => setAddingShoes(false)} />
        ) : (
          <button className="btn" onClick={() => setAddingShoes(true)} style={{ marginTop: 4, alignSelf: 'flex-start' }}>+ Add shoes</button>
        )}
      </div>

      <SectionTitle>Pools</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {pools.map(p => (
          <EquipmentCard key={p.id} kind="pool" item={p}
            onUpdate={(next) => setPools(prev => prev.map(x => x.id === p.id ? next : x))}
            onDelete={() => setPools(prev => prev.filter(x => x.id !== p.id))}
            onSetDefault={() => setPools(prev => prev.map(x => ({ ...x, isDefault: x.id === p.id })))} />
        ))}
        {addingPool ? (
          <PoolForm
            onSave={(p) => { setPools(prev => [...prev, { id: 'p' + Date.now(), ...p }]); setAddingPool(false); }}
            onCancel={() => setAddingPool(false)} />
        ) : (
          <button className="btn" onClick={() => setAddingPool(true)} style={{ marginTop: 4, alignSelf: 'flex-start' }}>+ Add pool</button>
        )}
      </div>
    </div>
  );
}

// One row that expands to edit. Compact closed; full form open.
function EquipmentCard({ kind, item, onUpdate, onDelete, onSetDefault }) {
  const [open, setOpen] = useState4(false);
  const [draft, setDraft] = useState4(item);
  React.useEffect(() => { setDraft(item); }, [item]);

  const glyph = kind === 'bike' ? '◐' : kind === 'shoes' ? '↗' : '≈';
  const meta = kind === 'pool'
    ? `${item.length} ${item.units?.toLowerCase() || 'm'}`
    : kind === 'bike'
      ? `${(item.distance || 0).toLocaleString()} mi`
      : `${item.distance || 0} / ${item.maxDistance || 500} mi`;

  // Wear ratio for shoes (drives a thin progress strip)
  const wearPct = kind === 'shoes' && item.maxDistance
    ? Math.min(100, Math.round((item.distance / item.maxDistance) * 100))
    : null;
  const wearColor = wearPct == null ? null
    : wearPct >= 90 ? 'var(--c-missed)'
    : wearPct >= 70 ? 'var(--c-partial)'
    : 'var(--olive-deep)';

  function commit() {
    onUpdate({ ...draft });
    setOpen(false);
  }

  return (
    <div style={{
      border: '1px solid var(--rule-soft)',
      borderRadius: 3,
      background: open ? 'var(--parchment)' : 'var(--linen)',
      overflow: 'hidden',
      opacity: item.retired ? 0.55 : 1,
    }}>
      {/* Closed row */}
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer' }}>
        <span style={{
          width: 18, color: 'var(--ink-mute)', fontFamily: 'var(--mono)', fontSize: 11,
          transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms',
        }}>›</span>
        <span style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--ink-soft)', width: 22, textAlign: 'center' }}>{glyph}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500 }}>{item.name}</span>
            {item.isDefault && (
              <span className="mono" style={{ fontSize: 9, padding: '1px 6px', background: 'var(--aegean-wash)', color: 'var(--aegean-deep)', border: '1px solid var(--aegean-soft)', borderRadius: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Default</span>
            )}
            {item.retired && (
              <span className="mono" style={{ fontSize: 9, padding: '1px 6px', background: 'var(--linen-deep)', color: 'var(--ink-mute)', borderRadius: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Retired</span>
            )}
          </div>
          {wearPct != null && (
            <div style={{ marginTop: 5, height: 3, background: 'var(--linen-deep)', borderRadius: 999, overflow: 'hidden', maxWidth: 240 }}>
              <div style={{ height: '100%', width: `${wearPct}%`, background: wearColor, transition: 'width 200ms' }}></div>
            </div>
          )}
        </div>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-soft)', textAlign: 'right' }}>{meta}</span>
      </div>

      {/* Expanded form */}
      {open && (
        <div style={{ padding: '14px 18px 18px 52px', borderTop: '1px solid var(--rule-soft)' }}>
          {kind === 'bike' && <BikeFields draft={draft} onChange={setDraft} />}
          {kind === 'shoes' && <ShoesFields draft={draft} onChange={setDraft} />}
          {kind === 'pool' && <PoolFields draft={draft} onChange={setDraft} />}

          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--rule-soft)', flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink)' }}>
              <input type="checkbox" checked={draft.isDefault || false}
                onChange={(e) => { if (e.target.checked) { onSetDefault(); setDraft(d => ({ ...d, isDefault: true })); } else { setDraft(d => ({ ...d, isDefault: false })); } }}
                style={{ accentColor: 'var(--aegean-deep)' }} />
              Default
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink)' }}>
              <input type="checkbox" checked={draft.retired || false}
                onChange={(e) => setDraft(d => ({ ...d, retired: e.target.checked }))}
                style={{ accentColor: 'var(--ink-mute)' }} />
              Retired
            </label>
            <div style={{ flex: 1 }}></div>
            <button className="btn btn-ghost" onClick={onDelete} style={{ color: 'var(--terracotta-deep)' }}>Remove</button>
            <button className="btn btn-ghost" onClick={() => { setDraft(item); setOpen(false); }}>Cancel</button>
            <button className="btn btn-primary" onClick={commit}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Per-kind field groups ───────────────────────────────────────────
function EqGrid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 18px' }}>{children}</div>;
}
function EqField({ label, children, full }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: full ? '1 / -1' : 'auto' }}>
      <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{label}</span>
      {children}
    </label>
  );
}

function BikeFields({ draft, onChange }) {
  const set = (k, v) => onChange(d => ({ ...d, [k]: v }));
  return (
    <EqGrid>
      <EqField label="Name" full><input className="input" value={draft.name || ''} onChange={e => set('name', e.target.value)} placeholder="e.g. Cannondale SuperSix Evo" /></EqField>
      <EqField label="Brand"><input className="input" value={draft.brand || ''} onChange={e => set('brand', e.target.value)} placeholder="Cannondale" /></EqField>
      <EqField label="Model"><input className="input" value={draft.model || ''} onChange={e => set('model', e.target.value)} placeholder="SuperSix Evo Hi-Mod" /></EqField>
      <EqField label="Wheels"><input className="input" value={draft.wheels || ''} onChange={e => set('wheels', e.target.value)} placeholder="DT Swiss ARC 1100" /></EqField>
      <EqField label="Crank length (mm)">
        <select className="select" value={draft.crank || '172.5'} onChange={e => set('crank', e.target.value)}>
          {['165','167.5','170','172.5','175','177.5','180'].map(v => <option key={v}>{v}</option>)}
        </select>
      </EqField>
      <EqField label="Purchase date"><input className="input" type="date" value={draft.purchased || ''} onChange={e => set('purchased', e.target.value)} /></EqField>
      <EqField label="Start distance (mi)"><input className="input" type="number" value={draft.startDistance ?? 0} onChange={e => set('startDistance', Number(e.target.value))} /></EqField>
      <EqField label="Notes" full><textarea className="input" rows="2" value={draft.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Anything you want to remember about this bike."></textarea></EqField>
    </EqGrid>
  );
}

function ShoesFields({ draft, onChange }) {
  const set = (k, v) => onChange(d => ({ ...d, [k]: v }));
  return (
    <EqGrid>
      <EqField label="Name" full><input className="input" value={draft.name || ''} onChange={e => set('name', e.target.value)} placeholder="e.g. Brooks Hyperion Tempo" /></EqField>
      <EqField label="Brand"><input className="input" value={draft.brand || ''} onChange={e => set('brand', e.target.value)} placeholder="Brooks" /></EqField>
      <EqField label="Model"><input className="input" value={draft.model || ''} onChange={e => set('model', e.target.value)} placeholder="Hyperion Tempo" /></EqField>
      <EqField label="Purchase date"><input className="input" type="date" value={draft.purchased || ''} onChange={e => set('purchased', e.target.value)} /></EqField>
      <EqField label="Start distance (mi)"><input className="input" type="number" value={draft.startDistance ?? 0} onChange={e => set('startDistance', Number(e.target.value))} /></EqField>
      <EqField label="Replace at (mi)"><input className="input" type="number" value={draft.maxDistance ?? 500} onChange={e => set('maxDistance', Number(e.target.value))} placeholder="500" /></EqField>
      <EqField label="Notes" full><textarea className="input" rows="2" value={draft.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Tempo days, race-day, recovery..."></textarea></EqField>
    </EqGrid>
  );
}

function PoolFields({ draft, onChange }) {
  const set = (k, v) => onChange(d => ({ ...d, [k]: v }));
  return (
    <EqGrid>
      <EqField label="Name" full><input className="input" value={draft.name || ''} onChange={e => set('name', e.target.value)} placeholder="e.g. Local YMCA · 25m" /></EqField>
      <EqField label="Length"><input className="input" type="number" value={draft.length ?? ''} onChange={e => set('length', Number(e.target.value))} placeholder="25" /></EqField>
      <EqField label="Units">
        <select className="select" value={draft.units || 'Meters'} onChange={e => set('units', e.target.value)}>
          <option>Meters</option><option>Yards</option>
        </select>
      </EqField>
      <EqField label="Notes" full><textarea className="input" rows="2" value={draft.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Open hours, lane setup, anything to remember."></textarea></EqField>
    </EqGrid>
  );
}

// ─── Add forms (used inline) ─────────────────────────────────────────
function AddShell({ title, children, onSave, onCancel, canSave }) {
  return (
    <div style={{ marginTop: 6, padding: '16px 18px', border: '1px dashed var(--aegean-deep)', background: 'var(--aegean-wash)', borderRadius: 3 }}>
      <div className="eyebrow eyebrow-aegean" style={{ marginBottom: 12 }}>{title}</div>
      {children}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={onSave} disabled={!canSave} style={{ opacity: canSave ? 1 : 0.5 }}>Save</button>
      </div>
    </div>
  );
}

function BikeForm({ onSave, onCancel }) {
  const [draft, setDraft] = useState4({ name: '', brand: '', model: '', wheels: '', crank: '172.5', purchased: '', startDistance: 0, notes: '', isDefault: false, retired: false });
  return (
    <AddShell title="New bike" canSave={!!draft.name?.trim()} onCancel={onCancel} onSave={() => onSave(draft)}>
      <BikeFields draft={draft} onChange={(fn) => setDraft(prev => typeof fn === 'function' ? fn(prev) : fn)} />
    </AddShell>
  );
}
function ShoesForm({ onSave, onCancel }) {
  const [draft, setDraft] = useState4({ name: '', brand: '', model: '', purchased: '', startDistance: 0, maxDistance: 500, notes: '', isDefault: false, retired: false });
  return (
    <AddShell title="New shoes" canSave={!!draft.name?.trim()} onCancel={onCancel} onSave={() => onSave(draft)}>
      <ShoesFields draft={draft} onChange={(fn) => setDraft(prev => typeof fn === 'function' ? fn(prev) : fn)} />
    </AddShell>
  );
}
function PoolForm({ onSave, onCancel }) {
  const [draft, setDraft] = useState4({ name: '', length: 25, units: 'Meters', notes: '', isDefault: false, retired: false });
  return (
    <AddShell title="New pool" canSave={!!draft.name?.trim() && draft.length > 0} onCancel={onCancel} onSave={() => onSave(draft)}>
      <PoolFields draft={draft} onChange={(fn) => setDraft(prev => typeof fn === 'function' ? fn(prev) : fn)} />
    </AddShell>
  );
}

function LayoutSettings({ tweaks, setTweak }) {
  return (
    <div>
      <FieldRow label="Density" sub="Comfy = more breathing room. Compact = denser data.">
        <div style={{ display: 'flex', gap: 6 }}>
          {['comfy','compact'].map(d => (
            <button key={d}
              onClick={() => setTweak('density', d)}
              className="btn"
              style={{
                background: tweaks.density === d ? 'var(--ink)' : 'var(--linen)',
                color: tweaks.density === d ? 'var(--parchment)' : 'var(--ink)',
                borderColor: tweaks.density === d ? 'var(--ink)' : 'var(--rule)',
                textTransform: 'capitalize',
              }}>{d}</button>
          ))}
        </div>
      </FieldRow>
      <FieldRow label="Show readiness rail" sub="Hide if you don't have a connected device.">
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={tweaks.showBiometrics} onChange={(e) => setTweak('showBiometrics', e.target.checked)} />
          <span style={{ fontSize: 13 }}>Show on Today page</span>
        </label>
      </FieldRow>
    </div>
  );
}

function NotificationsSettings() {
  return (
    <div>
      {[
        ['Coach edits your plan', true],
        ['New coach note on a workout', true],
        ['Pending change is reviewed', true],
        ['Weekly report is published', true],
        ['Missed workout reminders', false],
        ['Compliance summary on Sundays', true],
      ].map(([label, on]) => (
        <FieldRow key={label} label={label}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" defaultChecked={on} />
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-mute)' }}>Push · Email</span>
          </label>
        </FieldRow>
      ))}
    </div>
  );
}

function SubscriptionSettings() { return null; }

function ExportSettings() {
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Download your full training history as CSV or .FIT.</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn">Export CSV</button>
        <button className="btn">Export .FIT</button>
      </div>
    </div>
  );
}

Object.assign(window, { Settings });
