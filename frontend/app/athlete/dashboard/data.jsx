/* Sample triathlon data — Felipe, training for Ironman Lake Placid */

const SPORT_GLYPHS = {
  run: '↗',
  bike: '◐',
  swim: '≈',
  strength: '▤',
  brick: '⊕',
  rest: '○',
  yoga: '◇',
};

const SPORT_LABEL = {
  run: 'Run', bike: 'Bike', swim: 'Swim', strength: 'Strength',
  brick: 'Brick', rest: 'Recovery', yoga: 'Mobility',
};

// Status: planned | met | partial | missed | empty
function W(date, sport, title, planned, status, opts = {}) {
  return {
    id: `${date}-${sport}-${Math.random().toString(36).slice(2, 7)}`,
    date, sport, title, status,
    planned: planned || {},   // { duration, distance, tss }
    actual: opts.actual || null,
    description: opts.description || '',
    coachNote: opts.coachNote || null,
    voiceMemos: opts.voiceMemos || [],
    comments: opts.comments || [],
    compliance: opts.compliance ?? null, // 0..1
  };
}

// Current week — Mon Apr 27 → Sun May 3, 2026
const CURRENT_WEEK = [
  W('2026-04-27', 'swim', 'Endurance · Aerobic threshold',
    { duration: '1:00:00', distance: '3000y', tss: 52 },
    'met',
    {
      compliance: 1.0,
      actual: { duration: '1:02:14', distance: '3050y', tss: 54, hr: 142 },
      description: 'Warm up: 400 easy + 4×50 build.\nMain: 8×200 @ T-pace, 20" rest.\nCool: 200 easy.',
      coachNote: 'Solid pacing, last 200 was your fastest — that\'s the work showing up. Keep it.',
      comments: [
        { id: 'c1', author: 'felipe', text: 'Felt good, shoulders a little tight after.', at: '7:42 AM' },
        { id: 'c2', author: 'coach', text: 'Add 5 min of band pull-aparts before the next swim.', at: '9:10 AM' },
      ],
      voiceMemos: [{ id: 'v1', length: 14, transcript: 'Felt smooth, breathing every 3 was easy today…' }],
    }),

  W('2026-04-28', 'bike', 'Sweet spot intervals',
    { duration: '1:30:00', distance: '40km', tss: 95 },
    'partial',
    {
      compliance: 0.72,
      actual: { duration: '1:04:22', distance: '28.4km', tss: 68, hr: 151, power: 218 },
      description: 'Warm up: 15 min Z2.\nMain: 3×12 min @ 88-93% FTP, 6 min easy between.\nCool: 10 min Z1.',
      coachNote: 'Cut short — let\'s talk. Your HR was creeping. Recovery first; we\'ll redo Thursday.',
      comments: [
        { id: 'c3', author: 'felipe', text: 'Had to bail at interval 2, legs were toast from yesterday.', at: '6:15 PM' },
      ],
    }),

  W('2026-04-29', 'run', 'Tempo + strides',
    { duration: '0:55:00', distance: '9km', tss: 62 },
    'planned',
    {
      description: 'Warm up: 15 min easy.\nMain: 25 min steady at half-marathon effort.\nFinish: 6×20" strides w/ full recovery.\nCool: 10 min jog.',
      coachNote: 'Run this one feeling good. If yesterday lingered, swap the tempo for steady-state Z2.',
    }),
  W('2026-04-29', 'strength', 'Lower body · pull',
    { duration: '0:45:00' },
    'planned',
    { description: 'A: Trap-bar DL 4×5 @ RPE 7\nB1: Bulgarian split sq 3×8/leg\nB2: Single-leg RDL 3×8\nC: Core circuit ×2' }),

  W('2026-04-30', 'brick', 'Race-pace brick',
    { duration: '2:00:00', distance: '50km bike + 5km run', tss: 128 },
    'planned',
    {
      description: 'Bike: 90 min Z3 ending at race pace.\nT2 simulation — 90 sec.\nRun: 5km at race pace off the bike.\nFuel as you would on race day.',
      coachNote: 'Practice your race-day fueling here. This is the dress rehearsal.',
    }),

  W('2026-05-01', 'rest', 'Active recovery',
    { duration: '0:30:00' },
    'planned',
    { description: 'Walk 30 min outside or easy spin. Mobility work optional.' }),

  W('2026-05-02', 'swim', 'Open water · race sim',
    { duration: '1:15:00', distance: '3500m' },
    'planned',
    {
      description: 'Open water if available, otherwise pool with paddles.\n2 × 1500m continuous, sighting every 6 strokes.',
      coachNote: 'Practice your sighting cadence. Don\'t worry about pace — focus on straight lines.',
    }),

  W('2026-05-03', 'run', 'Long run',
    { duration: '2:30:00', distance: '24km', tss: 145 },
    'planned',
    {
      description: 'All Z2. Walk-run breaks every 5km if needed.\nFuel every 30 min. Practice race nutrition.',
      coachNote: 'This is the big one. Don\'t hero it — Z2 means Z2.',
    }),
];

// Last week — for Today snapshot history & week selector
const LAST_WEEK = [
  W('2026-04-20', 'swim', 'Technique · drills', { duration: '0:50:00', distance: '2500y', tss: 38 }, 'met', { compliance: 1, actual: { duration: '0:52:11', distance: '2500y', tss: 40 }, description: 'Drill set + EZ swim.' }),
  W('2026-04-21', 'bike', 'Z2 endurance', { duration: '1:45:00', distance: '50km', tss: 88 }, 'met', { compliance: 0.95, actual: { duration: '1:42:30', distance: '49.2km', tss: 85 } }),
  W('2026-04-22', 'run', 'Hill repeats', { duration: '1:00:00', distance: '10km', tss: 75 }, 'met', { compliance: 1.0, actual: { duration: '1:01:45', distance: '10.4km', tss: 78 } }),
  W('2026-04-23', 'strength', 'Upper · push', { duration: '0:45:00' }, 'partial', { compliance: 0.6, actual: { duration: '0:28:00' } }),
  W('2026-04-24', 'bike', 'Long ride', { duration: '3:00:00', distance: '85km', tss: 165 }, 'met', { compliance: 1.0, actual: { duration: '3:04:18', distance: '86.1km', tss: 168 } }),
  W('2026-04-25', 'rest', 'Recovery', { duration: '0:30:00' }, 'met', { compliance: 1, actual: { duration: '0:35:00' } }),
  W('2026-04-26', 'run', 'Long run', { duration: '2:15:00', distance: '21km', tss: 130 }, 'missed', { compliance: 0, description: 'Skipped — travel.' }),
];

const ATHLETE = {
  firstName: 'Felipe',
  fullName: 'Felipe Deidan',
  initials: 'FD',
  email: 'felipeddeidan@gmail.com',
  type: 'Triathlete',
  age: 26,
  goal: 'Ironman Lake Placid',
  goalDate: '2026-07-26',
  weeksOut: 13,
  ftp: 248,
  thresholdPace: '4:12/km',
  cssPace: '1:32/100m',
};

const COACH = {
  name: 'Marco Andes',
  initials: 'MA',
  title: 'Head Coach · Endurance',
  bio: 'Former pro triathlete (2009–2018). Coaches Ironman athletes with a polarized, periodized approach. Believes the long, easy work is the work.',
  philosophy: 'Discipline is freedom. The plan is the plan — until it isn\'t.',
  whatsapp: '+15551234567',                  // E.164, no formatting
  whatsappLabel: '+1 (555) 123-4567',
  reportCadence: 'weekly',                    // 'weekly' | 'monthly' | 'block' | 'off'
  reportDay: 'Monday',
  email: 'marco@andes.coaching',
};

// Season blocks (Jan → Aug)
const SEASON_BLOCKS = [
  { id: 'b1', name: 'Base I', phase: 'Base', start: '2026-01-05', weeks: 4, focus: 'Aerobic foundation, technique', volume: 12, color: 'aegean' },
  { id: 'b2', name: 'Base II', phase: 'Base', start: '2026-02-02', weeks: 4, focus: 'Volume build, strength', volume: 14, color: 'aegean' },
  { id: 'b3', name: 'Build I', phase: 'Build', start: '2026-03-02', weeks: 3, focus: 'Threshold, sweet spot', volume: 16, color: 'olive' },
  { id: 'b4', name: 'Recovery', phase: 'Recovery', start: '2026-03-23', weeks: 1, focus: 'Adaptation week', volume: 8, color: 'amber' },
  { id: 'b5', name: 'Build II', phase: 'Build', start: '2026-03-30', weeks: 4, focus: 'Race-pace specifics', volume: 18, color: 'olive' },
  { id: 'b6', name: 'Peak', phase: 'Peak', start: '2026-04-27', weeks: 3, focus: 'Race simulation, sharpening', volume: 20, color: 'terracotta', current: true },
  { id: 'b7', name: 'Taper', phase: 'Taper', start: '2026-05-18', weeks: 2, focus: 'Volume drop, intensity hold', volume: 12, color: 'amber' },
  { id: 'b8', name: 'Race week', phase: 'Race', start: '2026-06-01', weeks: 1, focus: 'Sharpen, rest, race', volume: 6, color: 'terracotta' },
];

// Methodology blocks
const METHODOLOGY = [
  {
    id: 'm1',
    title: 'Polarized intensity',
    body: 'About 80% of your weekly time sits at low intensity (Zone 1–2). The remaining 20% is spent above threshold. We avoid the "moderate-hard" middle — it costs recovery without building fitness.',
  },
  {
    id: 'm2',
    title: 'Strength as a foundation',
    body: 'Two short, heavy sessions a week. Trap-bar deadlifts, split squats, single-leg work. We are not training for hypertrophy — we are training the nervous system to recruit fast.',
  },
  {
    id: 'm3',
    title: 'Sleep is the workout',
    body: 'If you sleep less than 7 hours, the next session drops a zone. You will feel slower for a day. You will be faster for a year.',
  },
  {
    id: 'm4',
    title: 'Race rehearsal',
    body: 'Brick days are dress rehearsals. Same fuel, same kit, same start time. Race day should feel like a Wednesday.',
  },
];

// Weekly report (current + last)
const WEEKLY_REPORT = {
  weekOf: '2026-04-20',
  status: 'On track',
  hours: 9.8,
  hoursPlanned: 11.5,
  compliance: 0.81,
  bySport: { swim: 0.9, bike: 1.0, run: 0.65, strength: 0.6 },
  fromCoach: `Felipe — strong block. The long ride on Friday was the highlight; you held Z2 for three hours and finished feeling fresh, which is exactly what we want this far out.

The miss on Sunday is fine. Travel happens. What I want to watch is the strength work — you've cut two of the last three sessions short. That's the foundation we'll lean on in the final eight weeks.

Going into peak block: hold the volume, sharpen the intensity. The brick on Thursday is the one to nail.`,
  highlights: [
    'Long ride: 86 km @ Z2, perfectly paced',
    'Hill repeats hit target HR on every rep',
    'Recovery day actually used for recovery',
  ],
  watchouts: [
    'Strength sessions cut short twice this block',
    'Sunday long run missed — reschedule or absorb',
  ],
  // Long-form report — what Coach Andes/AI writes when expanded
  fullReport: [
    {
      heading: 'The week in one paragraph',
      body: `You completed 9.8 of 11.5 planned hours (81% compliance), entered Peak block in good shape, and held Zone 2 cleanly for the long ride. Sleep averaged 7h12 (up from 6h48 last week), HRV trended up four nights in a row, and resting heart rate dropped from 49 to 46. The two skipped sessions — Sunday long run and Wednesday strength — were both travel-related and not concerning on their own. The pattern of cutting strength short, however, is something to watch as we move toward race-pace work.`,
    },
    {
      heading: 'Swim · 90% compliance',
      body: `Three of three sessions completed. Threshold work on Monday hit target on every rep, and the Friday technique session was clean. Pace held inside CSS+5s for the main sets. Continue with current volume; we'll layer in open-water orientation in two weeks.`,
    },
    {
      heading: 'Bike · 100% compliance',
      body: `The Friday endurance ride (3h12, avg HR 138) was the standout — you reported feeling fresh at the finish, which is exactly the response we want from a Z2-disciplined ride at this stage. Sweet-spot intervals on Tuesday averaged 244W (NP) at 91% of FTP, slightly under target but well-paced. No flags.`,
    },
    {
      heading: 'Run · 65% compliance',
      body: `Tuesday hill repeats and Thursday easy run hit target. Sunday long run missed (travel). The miss is absorbable, but with three weeks of Peak ahead I'd like to bank a 90-minute Z2 effort this Saturday before the brick. Adjust the bike on Saturday accordingly — drop the FTP intervals to endurance.`,
    },
    {
      heading: 'Strength · 60% compliance',
      body: `Two sessions started, one completed in full. Trap-bar deadlift loads stayed at last block's numbers (no progression). This is the third week strength has slipped. We need to protect these — the work shows up in the final 5K of the marathon. If 45 minutes is the constraint, do the 20-minute version, but do it.`,
    },
    {
      heading: 'Biometrics & recovery',
      body: `HRV +12% week-over-week, RHR -3 bpm, sleep efficiency 89%. WHOOP recovery averaged 71%. Body battery is good. You're entering Peak with a tank, not a deficit — that's the point of the recovery week we just finished.`,
    },
    {
      heading: 'The week ahead',
      body: `Peak week 1 of 3. Brick on Thursday is the priority session — same fuel, same kit, same start time as race day. Saturday gets the long Z2 run we missed. I've moved Sunday's run to a 60-min easy spin to protect the strength session on Monday. If anything feels off, voice-memo me on the day, not the next morning.`,
    },
  ],
};

// Past reports — the historical archive
const PAST_REPORTS = [
  {
    id: 'r-20260413',
    weekOf: '2026-04-13',
    cadence: 'weekly',
    title: 'Volume back at full. Sleep is cleaner.',
    summary: 'You handled the return-to-volume week well. Sleep averaged 7h32 — the cleanest stretch all year. Run volume came back without the foot tightness we saw in March.',
    compliance: 0.88,
    hours: 11.2,
    hoursPlanned: 12.5,
  },
  {
    id: 'r-20260406',
    weekOf: '2026-04-06',
    cadence: 'weekly',
    title: 'Recovery week — handled well.',
    summary: 'Discipline on the easy days is what makes the hard days work. You held the line. Resting HR dropped to 46 by Friday.',
    compliance: 1.0,
    hours: 7.4,
    hoursPlanned: 7.5,
  },
  {
    id: 'r-block-build2',
    weekOf: '2026-03-30',
    cadence: 'block',
    title: 'Build II block report (4 weeks)',
    summary: 'Four-week Build II block: race-pace specifics dialed in. FTP test confirmed +6W (242→248). Run threshold pace dropped 4 sec/km. Pattern to watch — strength compliance trending down.',
    compliance: 0.84,
    hours: 44.1,
    hoursPlanned: 52.0,
  },
  {
    id: 'r-20260330',
    weekOf: '2026-03-30',
    cadence: 'weekly',
    title: 'Big-day Saturday set the tone.',
    summary: '5h ride + 30min run brick. Held Z2 throughout. This was the longest aerobic effort of the year and you closed it strong.',
    compliance: 0.92,
    hours: 13.8,
    hoursPlanned: 15.0,
  },
  {
    id: 'r-20260323',
    weekOf: '2026-03-23',
    cadence: 'weekly',
    title: "Travel week. Adapted, didn't panic.",
    summary: 'Three workouts in a hotel gym, two outdoor runs in unfamiliar terrain. The plan adapted to you, not the other way around. That\'s the right instinct.',
    compliance: 0.65,
    hours: 6.2,
    hoursPlanned: 9.5,
  },
  {
    id: 'r-march',
    weekOf: '2026-03-01',
    cadence: 'monthly',
    title: 'March in review',
    summary: 'Strongest month of the build so far. Bike volume up 22% from February with no spike in fatigue. Run threshold pace improved. Watch: two Sunday long runs missed for travel.',
    compliance: 0.86,
    hours: 48.3,
    hoursPlanned: 56.0,
  },
  {
    id: 'r-20260316',
    weekOf: '2026-03-16',
    cadence: 'weekly',
    title: 'Threshold work is starting to land.',
    summary: 'Three threshold sessions, three on-target executions. The middle of the season is where compounding starts to show.',
    compliance: 0.90,
    hours: 12.1,
    hoursPlanned: 13.5,
  },
];

// AI profile
const AI_PROFILE = `Felipe is a 26-year-old triathlete training for his second Ironman. He responds well to structure and clear targets, struggles with mid-week fatigue when work travel piles up, and tends to overcook bike intervals when feeling good. Strongest discipline: swim. Biggest gain available: run economy at threshold pace.`;

// Season-long workouts (sparse — populated for current + adjacent weeks; rest sampled)
function buildSeasonData() {
  const map = {};
  // index current and last week
  [...LAST_WEEK, ...CURRENT_WEEK].forEach(w => {
    if (!map[w.date]) map[w.date] = [];
    map[w.date].push(w);
  });
  // pre-populate planned workouts for the rest of peak block + taper sparingly
  const futurePattern = [
    ['swim', 'Threshold', { duration: '1:00:00', tss: 55 }],
    ['bike', 'Race-pace', { duration: '1:45:00', tss: 105 }],
    ['run', 'Tempo', { duration: '1:00:00', tss: 70 }],
    ['strength', 'Lower', { duration: '0:45:00' }],
    ['brick', 'Sim', { duration: '2:00:00', tss: 130 }],
    ['rest', 'Recovery', { duration: '0:30:00' }],
    ['run', 'Long', { duration: '2:30:00', tss: 145 }],
  ];
  const start = new Date('2026-05-04');
  for (let w = 0; w < 8; w++) {
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + w * 7 + d);
      const key = dt.toISOString().slice(0, 10);
      const [sport, title, planned] = futurePattern[d];
      if (!map[key]) map[key] = [];
      map[key].push(W(key, sport, title, planned, 'planned'));
    }
  }
  // Past weeks (before LAST_WEEK) — fill with mostly-met for compliance heatmap
  const past = new Date('2026-01-05');
  for (let w = 0; w < 15; w++) {
    for (let d = 0; d < 7; d++) {
      const dt = new Date(past);
      dt.setDate(past.getDate() + w * 7 + d);
      const key = dt.toISOString().slice(0, 10);
      if (map[key]) continue;
      const [sport, title, planned] = futurePattern[d];
      // bias toward met, occasionally partial/missed
      const r = Math.random();
      const status = r < 0.78 ? 'met' : r < 0.93 ? 'partial' : 'missed';
      const compliance = status === 'met' ? 1 : status === 'partial' ? 0.6 + Math.random() * 0.2 : Math.random() * 0.3;
      map[key] = [W(key, sport, title, planned, status, { compliance })];
    }
  }
  return map;
}

const SEASON_DATA = buildSeasonData();

// Biometrics — connected device "Whoop" sample (state can flip in tweaks)
const BIOMETRICS = {
  connected: true,
  device: 'Whoop 4.0',
  recovery: 78,        // 0-100
  strain: 14.2,        // 0-21
  hrv: 62,             // ms
  rhr: 48,             // bpm
  sleepScore: 91,
  sleepHours: 7.8,
  trend7: [62, 71, 65, 80, 74, 70, 78], // recovery
};

Object.assign(window, {
  CURRENT_WEEK, LAST_WEEK, SEASON_BLOCKS, SEASON_DATA, METHODOLOGY,
  ATHLETE, COACH, WEEKLY_REPORT, PAST_REPORTS, AI_PROFILE, BIOMETRICS,
  SPORT_GLYPHS, SPORT_LABEL,
});
