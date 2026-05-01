"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/app/lib/supabase";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://coach-ai-production-a5aa.up.railway.app";

// ─── CSS ─────────────────────────────────────────────────────────────────────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
:root{--display:'Fraunces',Georgia,serif;--body:'Inter',-apple-system,sans-serif;--mono:'JetBrains Mono',ui-monospace,monospace;--parchment:oklch(0.985 0.008 75);--linen:oklch(0.965 0.012 75);--linen-deep:oklch(0.935 0.015 75);--rule-soft:oklch(0.88 0.012 75);--rule:oklch(0.82 0.015 75);--rule-strong:oklch(0.65 0.02 75);--ink:oklch(0.18 0.012 60);--ink-soft:oklch(0.38 0.012 60);--ink-mute:oklch(0.55 0.012 60);--ink-faint:oklch(0.72 0.012 60);--aegean:oklch(0.55 0.08 215);--aegean-deep:oklch(0.42 0.09 215);--aegean-soft:oklch(0.85 0.04 215);--aegean-wash:oklch(0.96 0.018 215);--terracotta:oklch(0.62 0.12 45);--terracotta-deep:oklch(0.50 0.13 45);--terracotta-soft:oklch(0.88 0.06 45);--terracotta-wash:oklch(0.96 0.02 45);--olive:oklch(0.55 0.08 130);--olive-deep:oklch(0.42 0.09 130);--olive-soft:oklch(0.86 0.05 130);--olive-wash:oklch(0.96 0.02 130);--amber:oklch(0.78 0.12 80);--amber-deep:oklch(0.62 0.13 80);--amber-soft:oklch(0.90 0.06 80);--amber-wash:oklch(0.97 0.025 80);--c-met:var(--olive-deep);--c-met-bg:var(--olive-wash);--c-met-border:var(--olive-soft);--c-partial:var(--amber-deep);--c-partial-bg:var(--amber-wash);--c-partial-border:oklch(0.84 0.10 80);--c-missed:var(--terracotta-deep);--c-missed-bg:var(--terracotta-wash);--c-missed-border:var(--terracotta-soft);}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;background:var(--parchment);color:var(--ink);font-family:var(--body);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased;}
.ad-bg{background:radial-gradient(ellipse 1200px 600px at 80% -10%,oklch(0.96 0.02 45/0.5),transparent 60%),radial-gradient(ellipse 1000px 800px at -10% 100%,oklch(0.96 0.025 215/0.4),transparent 55%),var(--parchment);}
.display{font-family:var(--display);font-weight:400;letter-spacing:-0.02em;}
.mono{font-family:var(--mono);font-feature-settings:'tnum' 1;}
.eyebrow{font-family:var(--mono);font-size:10.5px;letter-spacing:0.14em;text-transform:uppercase;color:var(--ink-mute);}
.eyebrow-aegean{color:var(--aegean-deep);}
.eyebrow-terracotta{color:var(--terracotta-deep);}
.eyebrow-olive{color:var(--olive-deep);}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;font-family:var(--body);font-size:13px;font-weight:500;border:1px solid var(--rule);background:var(--linen);color:var(--ink);border-radius:2px;cursor:pointer;transition:all 140ms ease;white-space:nowrap;}
.btn:hover{background:var(--linen-deep);border-color:var(--rule-strong);}
.btn-primary{background:var(--ink);color:var(--parchment);border-color:var(--ink);}
.btn-primary:hover{background:oklch(0.28 0.012 60);}
.btn-ghost{background:transparent;border-color:transparent;color:var(--ink-soft);}
.btn-ghost:hover{background:var(--linen);color:var(--ink);}
.btn-icon{width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;}
.panel{background:var(--linen);border:1px solid var(--rule-soft);border-radius:3px;}
.avatar{width:32px;height:32px;border-radius:999px;background:var(--ink);color:var(--parchment);display:inline-flex;align-items:center;justify-content:center;font-family:var(--display);font-size:13px;flex-shrink:0;}
.avatar-coach{background:var(--terracotta-deep);}
.avatar-sm{width:22px;height:22px;font-size:10px;}
.dot{display:inline-block;width:6px;height:6px;border-radius:999px;}
.dot-met{background:var(--c-met);}
.dot-partial{background:var(--c-partial);}
.dot-missed{background:var(--c-missed);}
.dot-empty{background:var(--rule-soft);border:1px solid var(--rule);}
.sport-chip{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border-radius:2px;background:var(--linen-deep);border:1px solid var(--rule-soft);flex-shrink:0;}
.toptab{padding:10px 18px;font-family:var(--body);font-size:13px;font-weight:500;color:var(--ink-mute);background:transparent;border:none;border-bottom:2px solid transparent;cursor:pointer;transition:all 140ms ease;margin-bottom:-1px;}
.toptab:hover{color:var(--ink);}
.toptab.active{color:var(--ink);border-bottom-color:var(--ink);}
.input,.select{font-family:var(--body);font-size:13px;padding:8px 12px;border:1px solid var(--rule);background:var(--parchment);color:var(--ink);border-radius:2px;outline:none;width:100%;}
.input:focus,.select:focus{border-color:var(--ink);}
.lift{transition:transform 140ms ease,box-shadow 140ms ease;}
.lift:hover{transform:translateY(-1px);box-shadow:0 4px 16px -8px oklch(0 0 0/0.18);}
.compliance-bar{height:6px;border-radius:999px;background:var(--linen-deep);overflow:hidden;display:flex;}
.compliance-bar>span{display:block;height:100%;}
.modal-backdrop{position:fixed;inset:0;background:oklch(0.18 0.012 60/0.32);backdrop-filter:blur(6px);z-index:50;display:flex;align-items:center;justify-content:center;}
.sec-h{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px;gap:16px;}
.sec-h h2{font-family:var(--display);font-weight:400;font-size:26px;letter-spacing:-0.02em;color:var(--ink);margin:0;}
.pullquote{font-family:var(--display);font-size:20px;line-height:1.4;letter-spacing:-0.015em;color:var(--ink);border-left:2px solid var(--terracotta-deep);padding-left:18px;}
.pending-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 7px;border:1px solid var(--terracotta-soft);background:var(--terracotta-wash);color:var(--terracotta-deep);font-family:var(--mono);font-size:9.5px;letter-spacing:0.1em;text-transform:uppercase;border-radius:2px;}
.brand-mark{display:inline-flex;align-items:baseline;font-family:var(--display);font-size:17px;letter-spacing:-0.02em;color:var(--ink);}
.tint-run{background:var(--terracotta-wash);border-color:var(--terracotta-soft);}
.tint-bike{background:var(--aegean-wash);border-color:var(--aegean-soft);}
.tint-swim{background:oklch(0.96 0.025 195);border-color:oklch(0.85 0.04 195);}
.tint-strength{background:var(--linen-deep);border-color:var(--rule);}
.tint-rest{background:var(--parchment);border-color:var(--rule-soft);}
.tint-brick{background:var(--amber-wash);border-color:var(--amber-soft);}
.rail{width:3px;border-radius:1px;align-self:stretch;flex-shrink:0;}
.rail-met{background:var(--c-met);}
.rail-partial{background:var(--c-partial);}
.rail-missed{background:var(--c-missed);}
.rail-planned{background:var(--ink);}
.rail-empty{background:var(--rule-soft);}
.bar-row{display:flex;align-items:flex-end;gap:2px;height:26px;}
.bar-row>div{flex:1;background:var(--rule);border-radius:1px;min-height:2px;}
.menu-item{display:block;width:100%;text-align:left;padding:9px 14px;background:transparent;border:none;font-family:var(--body);font-size:13px;color:var(--ink);cursor:pointer;border-radius:2px;transition:background 120ms;}
.menu-item:hover{background:var(--linen-deep);}
.wave{display:inline-flex;align-items:center;gap:2px;height:16px;}
.wave>span{display:inline-block;width:2px;background:currentColor;border-radius:1px;}
.wave-progress{position:relative;display:inline-flex;align-items:center;gap:1px;flex:1;height:22px;cursor:pointer;}
.wave-progress>span{display:inline-block;flex:1;background:currentColor;opacity:0.35;border-radius:1px;}
.wave-progress>span.played{opacity:0.95;}
.season-block{user-select:none;transition:transform 140ms,box-shadow 140ms;}
.season-block.dragging{opacity:0.45;}
.season-block.drop-before{box-shadow:-3px 0 0 0 var(--ink);}
.season-block.drop-after{box-shadow:3px 0 0 0 var(--ink);}
.placeholder-stripe{background:repeating-linear-gradient(135deg,oklch(0.92 0.01 75),oklch(0.92 0.01 75) 6px,oklch(0.95 0.008 75) 6px,oklch(0.95 0.008 75) 12px);display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:10.5px;color:var(--ink-mute);}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes slide-up{from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes fade-down{from{transform:translateY(-6px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes confetti-fall{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0.85}}
@keyframes toast-in{from{transform:translate(-50%,24px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
@keyframes rec-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.6;transform:scale(1.15)}}
@keyframes spin-cw{to{transform:rotate(360deg)}}
.rec-pulse{animation:rec-pulse 1.2s ease-in-out infinite;}
.spin{animation:spin-cw 900ms linear infinite;}
::-webkit-scrollbar{width:8px;height:8px;}
::-webkit-scrollbar-thumb{background:var(--rule-soft);border-radius:4px;}
`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface PlannedData { duration?: string; distance?: string; tss?: number; }
interface ActualData { duration?: string; distance?: string; tss?: number; hr?: number; power?: number; source?: string; }
interface VoiceMemo { id: string; length: number; transcript?: string; at?: string; }
interface WComment { id: string; author: string; text: string; at: string; pending?: boolean; isMemo?: boolean; }
interface WorkoutItem {
  id: string; date: string; sport: string; title: string;
  status: string; planned: PlannedData; actual: ActualData | null;
  description: string; coachNote: string | null;
  voiceMemos: VoiceMemo[]; comments: WComment[]; compliance: number | null;
}
interface AthleteFile { id: string; original_filename: string; file_type: string; category: string; status: string; size_bytes: number; created_at: string; }
interface LiveAthlete { firstName: string; fullName: string; initials: string; email: string; type: string; goal: string; goalDate: string; weeksOut: number; aiProfile: string; ftp: number; thresholdPace: string; cssPace: string; }
interface AppState { workouts: Record<string, Partial<WorkoutItem>>; blocks: Record<string, {order?:number}>; memory: {at:number;kind:string;text:string}[]; lastSync: Record<string,number>; pendingCount: number; }
interface CoachProfile { id: string; name: string; initials: string; whatsapp: string | null; email: string | null; }

// ─── Static data ──────────────────────────────────────────────────────────────
const SPORT_GLYPHS: Record<string,string> = { run:'↗', bike:'◐', swim:'≈', strength:'▤', brick:'⊕', rest:'○', yoga:'◇' };
const SPORT_LABEL: Record<string,string> = { run:'Run', bike:'Bike', swim:'Swim', strength:'Strength', brick:'Brick', rest:'Recovery', yoga:'Mobility' };

let _wid = 0;
function W(date:string, sport:string, title:string, planned:PlannedData, status:string, opts:Partial<WorkoutItem>={}): WorkoutItem {
  return { id:`w${++_wid}`, date, sport, title, status, planned: planned||{}, actual: opts.actual||null, description: opts.description||'', coachNote: opts.coachNote||null, voiceMemos: opts.voiceMemos||[], comments: opts.comments||[], compliance: opts.compliance??null };
}

const CURRENT_WEEK: WorkoutItem[] = [
  W('2026-04-27','swim','Endurance · Aerobic threshold',{duration:'1:00:00',distance:'3000y',tss:52},'met',{compliance:1.0,actual:{duration:'1:02:14',distance:'3050y',tss:54,hr:142},description:'Warm up: 400 easy + 4×50 build.\nMain: 8×200 @ T-pace, 20" rest.\nCool: 200 easy.',coachNote:"Solid pacing, last 200 was your fastest — that's the work showing up.",comments:[{id:'c1',author:'felipe',text:'Felt good, shoulders a little tight after.',at:'7:42 AM'},{id:'c2',author:'coach',text:'Add 5 min of band pull-aparts before the next swim.',at:'9:10 AM'}],voiceMemos:[{id:'v1',length:14,transcript:'Felt smooth, breathing every 3 was easy today…'}]}),
  W('2026-04-28','bike','Sweet spot intervals',{duration:'1:30:00',distance:'40km',tss:95},'partial',{compliance:0.72,actual:{duration:'1:04:22',distance:'28.4km',tss:68,hr:151,power:218},description:'Warm up: 15 min Z2.\nMain: 3×12 min @ 88-93% FTP, 6 min easy between.\nCool: 10 min Z1.',coachNote:"Cut short — let's talk. Your HR was creeping. Recovery first.",comments:[{id:'c3',author:'felipe',text:'Had to bail at interval 2, legs were toast.',at:'6:15 PM'}]}),
  W('2026-04-29','run','Tempo + strides',{duration:'0:55:00',distance:'9km',tss:62},'planned',{description:'Warm up: 15 min easy.\nMain: 25 min steady at half-marathon effort.\nFinish: 6×20" strides.\nCool: 10 min jog.',coachNote:'Run this one feeling good. If yesterday lingered, swap to steady-state Z2.'}),
  W('2026-04-29','strength','Lower body · pull',{duration:'0:45:00'},'planned',{description:'A: Trap-bar DL 4×5 @ RPE 7\nB1: Bulgarian split sq 3×8/leg\nB2: Single-leg RDL 3×8\nC: Core circuit ×2'}),
  W('2026-04-30','brick','Race-pace brick',{duration:'2:00:00',distance:'50km bike + 5km run',tss:128},'planned',{description:'Bike: 90 min Z3 ending at race pace.\nT2 simulation — 90 sec.\nRun: 5km at race pace off the bike.',coachNote:'Practice your race-day fueling here. This is the dress rehearsal.'}),
  W('2026-05-01','rest','Active recovery',{duration:'0:30:00'},'planned',{description:'Walk 30 min outside or easy spin. Mobility work optional.'}),
  W('2026-05-02','swim','Open water · race sim',{duration:'1:15:00',distance:'3500m'},'planned',{description:'Open water if available, otherwise pool with paddles.\n2 × 1500m continuous, sighting every 6 strokes.',coachNote:"Practice your sighting cadence. Don't worry about pace — focus on straight lines."}),
  W('2026-05-03','run','Long run',{duration:'2:30:00',distance:'24km',tss:145},'planned',{description:'All Z2. Walk-run breaks every 5km if needed.\nFuel every 30 min.',coachNote:"This is the big one. Don't hero it — Z2 means Z2."}),
];

const LAST_WEEK: WorkoutItem[] = [
  W('2026-04-20','swim','Technique · drills',{duration:'0:50:00',distance:'2500y',tss:38},'met',{compliance:1,actual:{duration:'0:52:11',distance:'2500y',tss:40}}),
  W('2026-04-21','bike','Z2 endurance',{duration:'1:45:00',distance:'50km',tss:88},'met',{compliance:0.95,actual:{duration:'1:42:30',distance:'49.2km',tss:85}}),
  W('2026-04-22','run','Hill repeats',{duration:'1:00:00',distance:'10km',tss:75},'met',{compliance:1.0,actual:{duration:'1:01:45',distance:'10.4km',tss:78}}),
  W('2026-04-23','strength','Upper · push',{duration:'0:45:00'},'partial',{compliance:0.6,actual:{duration:'0:28:00'}}),
  W('2026-04-24','bike','Long ride',{duration:'3:00:00',distance:'85km',tss:165},'met',{compliance:1.0,actual:{duration:'3:04:18',distance:'86.1km',tss:168}}),
  W('2026-04-25','rest','Recovery',{duration:'0:30:00'},'met',{compliance:1,actual:{duration:'0:35:00'}}),
  W('2026-04-26','run','Long run',{duration:'2:15:00',distance:'21km',tss:130},'missed',{compliance:0,description:'Skipped — travel.'}),
];

const SEASON_BLOCKS = [
  {id:'b1',name:'Base I',phase:'Base',start:'2026-01-05',weeks:4,color:'aegean'},
  {id:'b2',name:'Base II',phase:'Base',start:'2026-02-02',weeks:4,color:'aegean'},
  {id:'b3',name:'Build I',phase:'Build',start:'2026-03-02',weeks:3,color:'olive'},
  {id:'b4',name:'Recovery',phase:'Recovery',start:'2026-03-23',weeks:1,color:'amber'},
  {id:'b5',name:'Build II',phase:'Build',start:'2026-03-30',weeks:4,color:'olive'},
  {id:'b6',name:'Peak',phase:'Peak',start:'2026-04-27',weeks:3,color:'terracotta',current:true},
  {id:'b7',name:'Taper',phase:'Taper',start:'2026-05-18',weeks:2,color:'amber'},
  {id:'b8',name:'Race week',phase:'Race',start:'2026-06-01',weeks:1,color:'terracotta'},
];

const METHODOLOGY = [
  {id:'m1',title:'Polarized intensity',body:'About 80% of your weekly time sits at low intensity (Zone 1–2). The remaining 20% is spent above threshold. We avoid the "moderate-hard" middle.'},
  {id:'m2',title:'Strength as a foundation',body:'Two short, heavy sessions a week. Trap-bar deadlifts, split squats, single-leg work. Training the nervous system to recruit fast.'},
  {id:'m3',title:'Sleep is the workout',body:'If you sleep less than 7 hours, the next session drops a zone. You will feel slower for a day. You will be faster for a year.'},
  {id:'m4',title:'Race rehearsal',body:'Brick days are dress rehearsals. Same fuel, same kit, same start time. Race day should feel like a Wednesday.'},
];

const WEEKLY_REPORT = {
  weekOf:'2026-04-20',status:'On track',hours:9.8,hoursPlanned:11.5,compliance:0.81,
  bySport:{swim:0.9,bike:1.0,run:0.65,strength:0.6},
  fromCoach:`Felipe — strong block. The long ride on Friday was the highlight; you held Z2 for three hours and finished feeling fresh, which is exactly what we want this far out.\n\nThe miss on Sunday is fine. Travel happens. What I want to watch is the strength work — you've cut two of the last three sessions short.\n\nGoing into peak block: hold the volume, sharpen the intensity. The brick on Thursday is the one to nail.`,
  highlights:['Long ride: 86 km @ Z2, perfectly paced','Hill repeats hit target HR on every rep','Recovery day actually used for recovery'],
  watchouts:['Strength sessions cut short twice this block','Sunday long run missed — reschedule or absorb'],
};

const PAST_REPORTS = [
  {id:'r1',weekOf:'2026-04-13',cadence:'weekly',title:'Volume back at full. Sleep is cleaner.',summary:'You handled the return-to-volume week well. Sleep averaged 7h32.',compliance:0.88,hours:11.2,hoursPlanned:12.5},
  {id:'r2',weekOf:'2026-04-06',cadence:'weekly',title:'Recovery week — handled well.',summary:'Discipline on the easy days is what makes the hard days work.',compliance:1.0,hours:7.4,hoursPlanned:7.5},
  {id:'r3',weekOf:'2026-03-30',cadence:'block',title:'Build II block report (4 weeks)',summary:'FTP test confirmed +6W (242→248). Run threshold pace dropped 4 sec/km.',compliance:0.84,hours:44.1,hoursPlanned:52.0},
];

const STATIC_COACH = { name:'Coach Andes', initials:'CA', title:'Head Coach · Endurance', bio:'Coaches endurance athletes with a polarized, periodized approach. Believes the long, easy work is the work.', philosophy:"Discipline is freedom. The plan is the plan — until it isn't.", whatsapp:'+15551234567', whatsappLabel:'+1 (555) 123-4567', reportCadence:'weekly', reportDay:'Monday', email:'coach@andes.ia' };
function buildCoachDisplay(live: CoachProfile | null) {
  if (!live) return STATIC_COACH;
  const wa = live.whatsapp || STATIC_COACH.whatsapp;
  const waDigits = wa?.replace(/\D/g,'') || '';
  const waLabel = waDigits.length >= 10 ? `+${waDigits.slice(0,1)} (${waDigits.slice(1,4)}) ${waDigits.slice(4,7)}-${waDigits.slice(7)}` : wa || '';
  return {
    ...STATIC_COACH,
    name: live.name,
    initials: live.initials,
    email: live.email || STATIC_COACH.email,
    whatsapp: wa || STATIC_COACH.whatsapp,
    whatsappLabel: waLabel,
  };
}

const BIOMETRICS = { connected:true, device:'Whoop 4.0', recovery:78, strain:14.2, hrv:62, rhr:48, sleepScore:91, sleepHours:7.8, trend7:[62,71,65,80,74,70,78] };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseLocalDate(d: string): Date {
  if (!d) return new Date();
  const [y,m,day] = d.split('-').map(Number);
  return new Date(y, m-1, day);
}
function fmtDate(d: string, opts?: Intl.DateTimeFormatOptions): string {
  return parseLocalDate(d).toLocaleDateString('en-US', opts);
}
function formatBytes(b: number): string {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024*1024) return `${(b/1024).toFixed(0)} KB`;
  return `${(b/(1024*1024)).toFixed(1)} MB`;
}
function weeksUntil(dateStr: string): number {
  if (!dateStr) return 0;
  const diff = parseLocalDate(dateStr).getTime() - Date.now();
  return Math.max(0, Math.round(diff / (7*24*60*60*1000)));
}

// ─── Week helpers + API mapping (COA-116) ─────────────────────────────────────
function getWeekBounds(offsetWeeks: number): { start: string; end: string; label: string } {
  const now = new Date();
  const dow = now.getDay();
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + daysToMon + offsetWeeks * 7);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const label = `${mon.toLocaleDateString('en-US', {month:'short', day:'numeric'})} – ${sun.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}`;
  return { start: fmt(mon), end: fmt(sun), label };
}
function minsToDuration(m: number | null | undefined): string {
  if (!m) return '';
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return `${h}:${String(min).padStart(2, '0')}:00`;
}
interface ApiWorkout {
  id: string; athlete_id: string; scheduled_date: string; session_type: string;
  title: string | null; distance_km: number | null; duration_min: number | null;
  coaching_notes: string | null; athlete_notes: string | null;
  status: string; compliance_pct: number | null;
  actual_duration_min: number | null; actual_distance_km: number | null;
}
function apiWorkoutToItem(w: ApiWorkout): WorkoutItem {
  const statusMap: Record<string, string> = { planned:'planned', completed:'met', missed:'missed', skipped:'missed' };
  const hasActual = w.actual_duration_min != null || w.actual_distance_km != null;
  return {
    id: w.id,
    date: w.scheduled_date,
    sport: w.session_type || 'other',
    title: w.title || w.session_type || 'Workout',
    status: statusMap[w.status] || 'planned',
    planned: {
      duration: minsToDuration(w.duration_min) || undefined,
      distance: w.distance_km != null ? `${w.distance_km}km` : undefined,
    },
    actual: hasActual ? {
      duration: minsToDuration(w.actual_duration_min) || undefined,
      distance: w.actual_distance_km != null ? `${w.actual_distance_km}km` : undefined,
    } : null,
    description: '',
    coachNote: w.coaching_notes || null,
    voiceMemos: [],
    comments: w.athlete_notes ? [{ id:'an0', author:'felipe', text:w.athlete_notes, at:'' }] : [],
    compliance: w.compliance_pct != null ? w.compliance_pct / 100 : null,
  };
}
async function postMemoryEvent(token: string, kind: string, text: string): Promise<void> {
  try {
    await fetch(`${BACKEND}/api/v1/athlete/memory-events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: kind, content: text }),
    });
  } catch {}
}

// ─── App state (localStorage) ─────────────────────────────────────────────────
const STATE_KEY = 'andes:state:v1';
const DEFAULT_STATE: AppState = {
  workouts:{}, blocks:{},
  memory:[{at:Date.now()-86400000*2,kind:'system',text:'Athlete profile linked to Coach Andes.'}],
  lastSync:{whoop:Date.now()-1000*60*14},
  pendingCount:2,
};
function useAppState() {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  useEffect(() => {
    try { const r = localStorage.getItem(STATE_KEY); if (r) setState(JSON.parse(r)); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);
  const update = useCallback((fn: (s: AppState) => AppState) => setState(prev => fn(prev)), []);
  const logMemory = useCallback((kind: string, text: string) => {
    setState(prev => ({ ...prev, memory: [...prev.memory, {at:Date.now(),kind,text}] }));
  }, []);
  return [state, update, logMemory] as const;
}

function mergeWorkouts(base: WorkoutItem[], overrides: Record<string, Partial<WorkoutItem>>): WorkoutItem[] {
  return base.map(w => { const o = overrides[w.id]; return o ? {...w,...o,planned:w.planned,comments:o.comments??w.comments,voiceMemos:o.voiceMemos??w.voiceMemos,actual:o.actual??w.actual} : w; });
}

// ─── Confetti + Toast ─────────────────────────────────────────────────────────
function Confetti({show, onDone}: {show:boolean; onDone:()=>void}) {
  useEffect(() => { if (!show) return; const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, [show, onDone]);
  if (!show) return null;
  const colors = ['var(--c-met)','var(--terracotta-deep)','var(--aegean-deep)','var(--olive-deep)','var(--amber-deep)'];
  return (
    <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:9999,overflow:'hidden'}}>
      {Array.from({length:36},(_,i) => (
        <span key={i} style={{position:'absolute',left:`${(i*7.3)%100}%`,top:'-20px',width:8,height:i%3===0?12:8,background:colors[i%colors.length],borderRadius:i%3===1?999:1,animation:`confetti-fall ${1.6+i*0.03}s cubic-bezier(.22,.7,.4,1) ${i*0.012}s forwards`,opacity:0.92}} />
      ))}
    </div>
  );
}
function Toast({show, title, body, onDone}: {show:boolean;title:string;body?:string;onDone:()=>void}) {
  useEffect(() => { if (!show) return; const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [show, onDone]);
  if (!show) return null;
  return (
    <div style={{position:'fixed',bottom:32,left:'50%',transform:'translateX(-50%)',zIndex:10000,background:'var(--ink)',color:'var(--parchment)',padding:'16px 22px',borderRadius:4,maxWidth:420,boxShadow:'0 16px 48px -12px rgba(0,0,0,0.35)',animation:'toast-in 280ms cubic-bezier(.22,.7,.4,1)'}}>
      <div className="display" style={{fontSize:17,marginBottom:4}}>{title}</div>
      {body && <div style={{fontSize:13,opacity:0.82,lineHeight:1.5}}>{body}</div>}
    </div>
  );
}

// ─── SportGlyph ───────────────────────────────────────────────────────────────
function SportGlyph({sport, size=24}: {sport:string;size?:number}) {
  return <span className="sport-chip" style={{width:size,height:size,fontSize:size*0.6,fontFamily:'var(--display)',color:'var(--ink-soft)'}}>{SPORT_GLYPHS[sport]||'·'}</span>;
}

// ─── Compliance helpers ───────────────────────────────────────────────────────
function complianceCls(status:string, value:number|null): string {
  if (status==='planned') return 'planned';
  if (status==='empty') return 'empty';
  if (status==='met'||(value!=null&&value>=0.85)) return 'met';
  if (status==='partial'||(value!=null&&value>=0.5)) return 'partial';
  return 'missed';
}
function CompliancePill({status, value}: {status:string;value:number|null}) {
  const cls = complianceCls(status, value);
  const labels: Record<string,string> = {met:'Met',partial:'Partial',missed:'Missed',empty:'Empty',planned:'Planned'};
  const colors: Record<string,{bg:string;fg:string;bd:string}> = {
    met:{bg:'var(--c-met-bg)',fg:'var(--c-met)',bd:'var(--c-met-border)'},
    partial:{bg:'var(--c-partial-bg)',fg:'var(--c-partial)',bd:'var(--c-partial-border)'},
    missed:{bg:'var(--c-missed-bg)',fg:'var(--c-missed)',bd:'var(--c-missed-border)'},
    empty:{bg:'var(--linen)',fg:'var(--ink-mute)',bd:'var(--rule-soft)'},
    planned:{bg:'var(--linen)',fg:'var(--ink-soft)',bd:'var(--rule-soft)'},
  };
  const k = colors[cls]||colors.planned;
  return (
    <span className="mono" style={{display:'inline-flex',alignItems:'center',gap:5,padding:'2px 8px',fontSize:9.5,letterSpacing:'0.1em',textTransform:'uppercase',background:k.bg,color:k.fg,border:`1px solid ${k.bd}`,borderRadius:2}}>
      <span className={`dot dot-${cls}`}/>
      {labels[cls]}
      {value!=null&&status!=='planned'&&status!=='empty'&&<span style={{opacity:0.6}}>· {Math.round(value*100)}%</span>}
    </span>
  );
}

// ─── DayHeader ────────────────────────────────────────────────────────────────
function DayHeader({date, isToday}: {date:string;isToday:boolean}) {
  const d = parseLocalDate(date);
  const dow = d.toLocaleDateString('en-US',{weekday:'short'}).toUpperCase();
  return (
    <div style={{padding:'10px 4px 8px',borderBottom:isToday?'2px solid var(--ink)':'1px solid var(--rule-soft)',display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:8}}>
      <span className="eyebrow" style={{fontSize:9.5,color:isToday?'var(--ink)':'var(--ink-mute)',fontWeight:isToday?600:400}}>{dow}</span>
      <span className="display" style={{fontSize:17,color:isToday?'var(--ink)':'var(--ink-soft)'}}>{d.getDate()}</span>
    </div>
  );
}

// ─── WorkoutCard (mosaic) ─────────────────────────────────────────────────────
function WorkoutCard({w, onClick, draggable, onDragStart, onDragOver, onDrop, isDragOver}: {w:WorkoutItem;onClick?:()=>void;draggable?:boolean;onDragStart?:()=>void;onDragOver?:(e:React.DragEvent)=>void;onDrop?:(e:React.DragEvent)=>void;isDragOver?:boolean}) {
  const cls = complianceCls(w.status, w.compliance);
  return (
    <div className={`lift tint-${w.sport}`} draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onClick={onClick}
      style={{display:'flex',gap:0,border:'1px solid',borderRadius:3,cursor:'pointer',position:'relative',outline:isDragOver?'2px solid var(--ink)':'none',outlineOffset:2}}>
      <div className={`rail rail-${cls}`}/>
      <div style={{padding:'10px 12px',flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
          <SportGlyph sport={w.sport} size={20}/>
          <span className="eyebrow" style={{fontSize:9.5,color:'var(--ink-mute)'}}>{SPORT_LABEL[w.sport]}</span>
          {w.coachNote&&<span style={{marginLeft:'auto',fontSize:10,color:'var(--terracotta-deep)',fontFamily:'var(--mono)'}}>● MA</span>}
        </div>
        <div className="display" style={{fontSize:14,color:'var(--ink)',lineHeight:1.25,marginBottom:4}}>{w.title}</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:'4px 10px',fontSize:11,color:'var(--ink-soft)'}}>
          {(w.actual?.duration||w.planned.duration)&&<span className="mono">{w.actual?.duration||w.planned.duration}</span>}
          {(w.actual?.distance||w.planned.distance)&&<span className="mono">{w.actual?.distance||w.planned.distance}</span>}
          {(w.actual?.tss||w.planned.tss)&&<span className="mono" style={{color:'var(--ink-mute)'}}>{w.actual?.tss||w.planned.tss} TSS</span>}
        </div>
      </div>
    </div>
  );
}

// ─── TodaySnapshot ────────────────────────────────────────────────────────────
function TodaySnapshot({today, onOpen, onMarkComplete, coachInitials, coachName}: {today:WorkoutItem;onOpen:(w:WorkoutItem)=>void;onMarkComplete:(w:WorkoutItem)=>void;coachInitials?:string;coachName?:string}) {
  const isDone = today.status==='met'||today.status==='partial';
  return (
    <div className="panel lift" onClick={()=>onOpen(today)} style={{padding:28,cursor:'pointer',borderTop:'3px solid var(--ink)',background:'var(--parchment)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18,gap:12}}>
        <span className="eyebrow" style={{whiteSpace:'nowrap'}}>Today · {fmtDate(today.date,{weekday:'long',month:'short',day:'numeric'})}</span>
        <CompliancePill status={today.status} value={today.compliance}/>
      </div>
      <div style={{display:'flex',alignItems:'flex-start',gap:20}}>
        <SportGlyph sport={today.sport} size={56}/>
        <div style={{flex:1,minWidth:0}}>
          <div className="display" style={{fontSize:30,lineHeight:1.15,color:'var(--ink)',marginBottom:6}}>{today.title}</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:'6px 18px',fontSize:13,color:'var(--ink-soft)'}}>
            {today.planned.duration&&<span className="mono">{today.planned.duration}</span>}
            {today.planned.distance&&<span className="mono">{today.planned.distance}</span>}
            {today.planned.tss&&<span className="mono" style={{color:'var(--ink-mute)'}}>{today.planned.tss} TSS planned</span>}
          </div>
          {today.description&&<p style={{margin:'12px 0 0',fontSize:13,color:'var(--ink-soft)',lineHeight:1.65,whiteSpace:'pre-line'}}>{today.description.split('\n').slice(0,2).join('\n')}</p>}
        </div>
      </div>
      {today.coachNote&&(
        <div style={{marginTop:18,paddingTop:16,borderTop:'1px solid var(--rule-soft)',display:'flex',gap:12,alignItems:'flex-start'}}>
          <div className="avatar avatar-coach avatar-sm" style={{width:26,height:26,fontSize:10}}>{coachInitials||STATIC_COACH.initials}</div>
          <div style={{flex:1}}>
            <div className="eyebrow eyebrow-terracotta" style={{fontSize:9.5,marginBottom:4}}>{coachName||STATIC_COACH.name} · Note</div>
            <p style={{margin:0,fontSize:13,color:'var(--ink)',lineHeight:1.55,fontStyle:'italic'}}>"{today.coachNote}"</p>
          </div>
        </div>
      )}
      <div style={{marginTop:18,display:'flex',gap:8}}>
        <button className="btn btn-primary" onClick={e=>{e.stopPropagation();onOpen(today);}}>Open workout →</button>
        {!isDone&&<button className="btn" onClick={e=>{e.stopPropagation();onMarkComplete(today);}}>Mark complete</button>}
        {isDone&&<span className="mono" style={{fontSize:11,color:'var(--olive-deep)',alignSelf:'center',letterSpacing:'0.1em',textTransform:'uppercase'}}>● Synced</span>}
      </div>
    </div>
  );
}

// ─── WeekMosaic ───────────────────────────────────────────────────────────────
function WeekMosaic({week, weekStart, weekLabel, weekOffset, onPrev, onNext, onThisWeek, onOpen, onMove}: {week:WorkoutItem[];weekStart:string;weekLabel:string;weekOffset:number;onPrev:()=>void;onNext:()=>void;onThisWeek:()=>void;onOpen:(w:WorkoutItem)=>void;onMove:(id:string,date:string)=>void}) {
  const [drag, setDrag] = useState<string|null>(null);
  const [over, setOver] = useState<string|null>(null);
  const TODAY_KEY = useMemo(()=>new Date().toISOString().slice(0,10), []);
  const days = useMemo(() => {
    const start = parseLocalDate(weekStart);
    return Array.from({length:7},(_,i) => { const d=new Date(start); d.setDate(start.getDate()+i); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  }, [weekStart]);
  const byDay = useMemo(() => { const m: Record<string,WorkoutItem[]>={}; days.forEach(d=>m[d]=[]); week.forEach(w=>{if(m[w.date])m[w.date].push(w);}); return m; }, [week, days]);
  return (
    <div className="panel" style={{padding:20,background:'var(--linen)'}}>
      <div className="sec-h">
        <div><span className="eyebrow">Training Week {weekOffset!==0&&<span style={{color:'var(--ink-mute)',marginLeft:6}}>· {weekOffset>0?`+${weekOffset}`:weekOffset}w</span>}</span><h2 style={{marginTop:4}}>{weekLabel}</h2></div>
        <div style={{display:'flex',gap:6}}>
          <button className="btn btn-ghost btn-icon" onClick={onPrev}>‹</button>
          <button className="btn btn-ghost" onClick={onThisWeek} disabled={weekOffset===0} style={{opacity:weekOffset===0?0.55:1}}>This week</button>
          <button className="btn btn-ghost btn-icon" onClick={onNext}>›</button>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:8}}>
        {days.map(d=><div key={d}><DayHeader date={d} isToday={d===TODAY_KEY}/></div>)}
        {days.map(d => {
          const list = byDay[d]||[];
          return (
            <div key={`col-${d}`} onDragOver={e=>{e.preventDefault();setOver(d);}} onDragLeave={()=>setOver(o=>o===d?null:o)} onDrop={e=>{e.preventDefault();if(drag)onMove(drag,d);setDrag(null);setOver(null);}}
              style={{minHeight:220,display:'flex',flexDirection:'column',gap:6,padding:4,background:over===d?'var(--aegean-wash)':'transparent',borderRadius:3,transition:'background 140ms'}}>
              {list.map(w=><WorkoutCard key={w.id} w={w} draggable onDragStart={()=>setDrag(w.id)} onClick={()=>onOpen(w)} isDragOver={false}/>)}
              {list.length===0&&<div style={{border:'1px dashed var(--rule-soft)',borderRadius:3,padding:'16px 8px',textAlign:'center',color:'var(--ink-faint)',fontSize:11,fontFamily:'var(--mono)'}}>rest</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WeekSummary ──────────────────────────────────────────────────────────────
function WeekSummary({week, athlete}: {week:WorkoutItem[];athlete:LiveAthlete}) {
  const completed = week.filter(w=>w.status==='met'||w.status==='partial'||w.status==='missed');
  const avgCompliance = completed.length ? completed.reduce((s,w)=>s+(w.compliance||0),0)/completed.length : null;
  const counts = {met:0,partial:0,missed:0,planned:0} as Record<string,number>;
  week.forEach(w=>{counts[w.status]=(counts[w.status]||0)+1;});
  const total = week.length||1;
  const totalHours = week.reduce((s,w)=>{const dur=(w.actual?.duration||w.planned.duration||'0:00:00').split(':');return s+(+dur[0]||0)+((+dur[1]||0)/60);},0);
  return (
    <div className="panel" style={{padding:20}}>
      <span className="eyebrow">Week snapshot</span>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:24,marginTop:16}}>
        <div>
          <div className="display" style={{fontSize:36,color:'var(--ink)',lineHeight:1}}>{avgCompliance!=null?Math.round(avgCompliance*100)+'%':'—'}</div>
          <div className="eyebrow" style={{marginTop:6}}>Compliance to date</div>
          <div className="compliance-bar" style={{marginTop:10}}>
            <span style={{width:`${(counts.met/total)*100}%`,background:'var(--c-met)'}}/>
            <span style={{width:`${(counts.partial/total)*100}%`,background:'var(--c-partial)'}}/>
            <span style={{width:`${(counts.missed/total)*100}%`,background:'var(--c-missed)'}}/>
            <span style={{width:`${(counts.planned/total)*100}%`,background:'var(--rule-soft)'}}/>
          </div>
          <div style={{display:'flex',gap:12,marginTop:8,fontSize:10.5,color:'var(--ink-mute)',fontFamily:'var(--mono)'}}>
            <span><span className="dot dot-met"/> {counts.met} met</span>
            <span><span className="dot dot-partial"/> {counts.partial} partial</span>
            <span><span className="dot dot-missed"/> {counts.missed} missed</span>
          </div>
        </div>
        <div>
          <div className="display" style={{fontSize:36,color:'var(--ink)',lineHeight:1}}>{totalHours.toFixed(1)}<span style={{fontSize:18,color:'var(--ink-mute)'}}>h</span></div>
          <div className="eyebrow" style={{marginTop:6}}>Volume this week</div>
          <div style={{marginTop:12,display:'flex',gap:16,fontSize:11,color:'var(--ink-soft)'}}>
            {(['swim','bike','run','strength'] as const).map(s=>(
              <div key={s}><div className="mono" style={{fontSize:13,color:'var(--ink)'}}>{week.filter(w=>w.sport===s).length}</div><div className="eyebrow" style={{fontSize:9,marginTop:2}}>{SPORT_LABEL[s]}</div></div>
            ))}
          </div>
        </div>
        <div>
          <div className="display" style={{fontSize:36,color:'var(--ink)',lineHeight:1}}>{athlete.weeksOut}<span style={{fontSize:18,color:'var(--ink-mute)'}}>wk</span></div>
          <div className="eyebrow" style={{marginTop:6}}>To {athlete.goal||'race day'}</div>
          <div style={{marginTop:12,fontSize:12,color:'var(--ink-soft)',lineHeight:1.5}}>Peak block · week 1 of 3<br/><span className="mono" style={{color:'var(--ink-mute)',fontSize:10.5}}>{athlete.goalDate}</span></div>
        </div>
      </div>
    </div>
  );
}

// ─── BiometricsRail ───────────────────────────────────────────────────────────
function BiometricsRail({visible}: {visible:boolean}) {
  const [b, setB] = useState(BIOMETRICS);
  const [syncing, setSyncing] = useState(false);
  if (!visible) return null;
  const ringColor = b.recovery>=75?'var(--c-met)':b.recovery>=50?'var(--c-partial)':'var(--c-missed)';
  function syncNow() {
    if (syncing) return; setSyncing(true);
    setTimeout(()=>{ setB(prev=>({...prev,recovery:Math.min(99,prev.recovery+Math.round((Math.random()-0.4)*6)),hrv:Math.max(35,prev.hrv+Math.round((Math.random()-0.5)*5)),rhr:Math.max(40,prev.rhr+Math.round((Math.random()-0.5)*3)),sleepHours:+(prev.sleepHours+(Math.random()-0.5)*0.4).toFixed(1),trend7:[...prev.trend7.slice(1),prev.recovery]})); setSyncing(false); }, 1100);
  }
  return (
    <div className="panel" style={{padding:22}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,gap:8}}>
        <span className="eyebrow">Readiness</span>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span className="mono" style={{fontSize:9.5,color:'var(--ink-mute)'}}>{syncing?'syncing…':`${b.device}`}</span>
          <button onClick={syncNow} className="btn btn-ghost btn-icon" style={{width:24,height:24,padding:0}} disabled={syncing}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={syncing?'spin':''}>
              <path d="M14 8a6 6 0 1 1-1.76-4.24M14 3v3.5h-3.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:16}}>
        <div style={{position:'relative',width:76,height:76}}>
          <svg width="76" height="76" viewBox="0 0 76 76" style={{transform:'rotate(-90deg)'}}>
            <circle cx="38" cy="38" r="32" stroke="var(--linen-deep)" strokeWidth="6" fill="none"/>
            <circle cx="38" cy="38" r="32" stroke={ringColor} strokeWidth="6" fill="none" strokeDasharray={2*Math.PI*32} strokeDashoffset={2*Math.PI*32*(1-b.recovery/100)} strokeLinecap="round" style={{transition:'stroke-dashoffset 600ms'}}/>
          </svg>
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column'}}>
            <span className="display" style={{fontSize:22,lineHeight:1,color:'var(--ink)'}}>{b.recovery}</span>
            <span className="eyebrow" style={{fontSize:8,marginTop:2}}>recov</span>
          </div>
        </div>
        <div style={{flex:1,fontSize:12,color:'var(--ink-soft)',lineHeight:1.5}}>
          <strong style={{color:'var(--ink)',fontWeight:500}}>{b.recovery>=75?'Green to train.':b.recovery>=50?'Train moderately.':'Recovery first.'}</strong>{' '}{b.recovery>=75?'HRV is up, sleep was strong.':b.recovery>=50?'Body is asking for steady work.':'Sleep & easy spin today.'}
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginTop:18,paddingTop:16,borderTop:'1px solid var(--rule-soft)'}}>
        {([['HRV',b.hrv,'ms','+4'],['Resting HR',b.rhr,'bpm','−2'],['Sleep',b.sleepHours,'h',`${b.sleepScore}%`],['Strain',b.strain,'','yest.']] as [string,number,string,string][]).map(([label,value,unit,delta])=>(
          <div key={label}><div className="eyebrow" style={{fontSize:9}}>{label}</div><div style={{display:'flex',alignItems:'baseline',gap:4,marginTop:3}}><span className="display" style={{fontSize:18,color:'var(--ink)'}}>{value}</span>{unit&&<span className="mono" style={{fontSize:10,color:'var(--ink-mute)'}}>{unit}</span>}</div><div className="mono" style={{fontSize:9.5,color:'var(--ink-mute)',marginTop:2}}>{delta}</div></div>
        ))}
      </div>
      <div style={{marginTop:16,paddingTop:14,borderTop:'1px solid var(--rule-soft)'}}>
        <span className="eyebrow" style={{fontSize:9}}>Recovery · 7 days</span>
        <div className="bar-row" style={{height:32,marginTop:6}}>
          {b.trend7.map((v,i)=><div key={i} style={{height:`${v}%`,background:v>=75?'var(--c-met)':v>=50?'var(--c-partial)':'var(--c-missed)',opacity:i===b.trend7.length-1?1:0.5,transition:'height 400ms'}}/>)}
        </div>
      </div>
    </div>
  );
}

// ─── Season page ─────────────────────────────────────────────────────────────
function buildSeasonData(): Record<string,WorkoutItem[]> {
  const map: Record<string,WorkoutItem[]> = {};
  [...LAST_WEEK,...CURRENT_WEEK].forEach(w=>{ if(!map[w.date])map[w.date]=[]; map[w.date].push(w); });
  const pattern: [string,string,PlannedData][] = [['swim','Threshold',{duration:'1:00:00',tss:55}],['bike','Race-pace',{duration:'1:45:00',tss:105}],['run','Tempo',{duration:'1:00:00',tss:70}],['strength','Lower',{duration:'0:45:00'}],['brick','Sim',{duration:'2:00:00',tss:130}],['rest','Recovery',{duration:'0:30:00'}],['run','Long',{duration:'2:30:00',tss:145}]];
  const futureStart = new Date('2026-05-04');
  for(let w=0;w<8;w++){for(let d=0;d<7;d++){const dt=new Date(futureStart);dt.setDate(futureStart.getDate()+w*7+d);const key=dt.toISOString().slice(0,10);if(!map[key])map[key]=[];const[sport,title,planned]=pattern[d];map[key].push(W(key,sport,title,planned,'planned'));}}
  const pastStart = new Date('2026-01-05');
  for(let w=0;w<15;w++){for(let d=0;d<7;d++){const dt=new Date(pastStart);dt.setDate(pastStart.getDate()+w*7+d);const key=dt.toISOString().slice(0,10);if(map[key])continue;const[sport,title,planned]=pattern[d];const r=Math.random();const status=r<0.78?'met':r<0.93?'partial':'missed';const compliance=status==='met'?1:status==='partial'?0.6+Math.random()*0.2:Math.random()*0.3;map[key]=[W(key,sport,title,planned,status,{compliance})];}}
  return map;
}

function DraggableBlockBar({blocks, onMove}: {blocks:typeof SEASON_BLOCKS;onMove:(id:string,order:number)=>void}) {
  const [dragId, setDragId] = useState<string|null>(null);
  const [overId, setOverId] = useState<string|null>(null);
  const [overSide, setOverSide] = useState<'before'|'after'>('before');
  const colorMap: Record<string,{bg:string;fg:string;bd:string}> = {
    aegean:{bg:'var(--aegean-wash)',fg:'var(--aegean-deep)',bd:'var(--aegean-soft)'},
    olive:{bg:'var(--olive-wash)',fg:'var(--olive-deep)',bd:'var(--olive-soft)'},
    terracotta:{bg:'var(--terracotta-wash)',fg:'var(--terracotta-deep)',bd:'var(--terracotta-soft)'},
    amber:{bg:'var(--amber-wash)',fg:'var(--amber-deep)',bd:'var(--amber-soft)'},
  };
  function handleDrop(targetId: string) {
    if(!dragId||dragId===targetId){setDragId(null);setOverId(null);return;}
    const order=blocks.map(b=>b.id);
    const fromIdx=order.indexOf(dragId);
    order.splice(fromIdx,1);
    let insertIdx=order.indexOf(targetId);
    if(overSide==='after')insertIdx+=1;
    order.splice(insertIdx,0,dragId);
    order.forEach((id,i)=>onMove(id,i));
    setDragId(null);setOverId(null);
  }
  return (
    <div style={{display:'flex',gap:2,height:44,marginTop:8}}>
      {blocks.map(b=>{
        const k=colorMap[b.color]||colorMap.aegean;
        const isDrag=dragId===b.id;
        const isOver=overId===b.id;
        return (
          <div key={b.id} draggable onDragStart={e=>{setDragId(b.id);e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>{setDragId(null);setOverId(null);}} onDragOver={e=>{e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();setOverId(b.id);setOverSide(e.clientX<rect.left+rect.width/2?'before':'after');}} onDragLeave={()=>setOverId(prev=>prev===b.id?null:prev)} onDrop={e=>{e.preventDefault();handleDrop(b.id);}}
            className={`season-block${isDrag?' dragging':''}${isOver&&!isDrag?(overSide==='before'?' drop-before':' drop-after'):''}`}
            style={{flex:b.weeks,background:k.bg,border:`1px solid ${k.bd}`,borderTop:(b as any).current?`3px solid ${k.fg}`:`1px solid ${k.bd}`,padding:'6px 10px',fontFamily:'var(--mono)',fontSize:10,color:k.fg,cursor:'grab',display:'flex',alignItems:'center',justifyContent:'space-between',overflow:'hidden',textTransform:'uppercase',letterSpacing:'0.08em',borderRadius:2,gap:4}}>
            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.name}</span>
            {b.weeks>=3&&<span style={{opacity:0.55}}>{b.weeks}w</span>}
          </div>
        );
      })}
    </div>
  );
}

function Season({onOpenWorkout, blockOverrides, onMoveBlock, seasonData}: {onOpenWorkout:(w:WorkoutItem)=>void;blockOverrides:Record<string,{order?:number}>;onMoveBlock:(id:string,order:number)=>void;seasonData:Record<string,WorkoutItem[]>}) {
  const [hoverWeek, setHoverWeek] = useState<number|null>(null);
  const blocks = useMemo(()=>{
    const withOrder=SEASON_BLOCKS.map((b,i)=>({...b,order:blockOverrides[b.id]?.order??i}));
    withOrder.sort((a,b)=>a.order-b.order);
    let cursor=parseLocalDate('2026-01-05');
    return withOrder.map(b=>{
      const start=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`;
      const next=new Date(cursor);next.setDate(cursor.getDate()+b.weeks*7);cursor=next;
      return{...b,start};
    });
  },[blockOverrides]);
  const weeks = useMemo(()=>{
    const start=parseLocalDate('2026-01-05');
    return Array.from({length:28},(_,i)=>{
      const ws=new Date(start);ws.setDate(start.getDate()+i*7);
      const days=Array.from({length:7},(_,d)=>{const dt=new Date(ws);dt.setDate(ws.getDate()+d);return`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;});
      return{idx:i,start:ws,days};
    });
  },[]);
  function blockForWeek(ws: Date) {
    return blocks.find(b=>{const bs=parseLocalDate(b.start);const be=new Date(bs);be.setDate(bs.getDate()+b.weeks*7);return ws>=bs&&ws<be;});
  }
  const todayD = parseLocalDate('2026-04-27');
  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:24}}>
      <div>
        <div className="panel" style={{padding:20,marginBottom:20}}>
          <div className="sec-h"><div><span className="eyebrow">Season</span><h2 style={{marginTop:4}}>Road to Lake Placid</h2><p className="mono" style={{marginTop:4,fontSize:10.5,color:'var(--ink-mute)'}}>Drag a block to re-sequence the season.</p></div><span className="mono" style={{fontSize:11,color:'var(--ink-mute)'}}>Jan 5 — Jul 26 · 28 weeks</span></div>
          <DraggableBlockBar blocks={blocks} onMove={onMoveBlock}/>
          <div style={{display:'flex',gap:2,marginTop:6}}>{blocks.map(b=><div key={b.id} style={{flex:b.weeks,fontSize:10,color:'var(--ink-mute)',fontFamily:'var(--mono)'}}>{fmtDate(b.start,{month:'short',day:'numeric'})}</div>)}</div>
        </div>
        <div className="panel" style={{padding:0,overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'60px 80px repeat(7,1fr) 70px',background:'var(--linen)',borderBottom:'1px solid var(--rule)',padding:'8px 14px'}}>
            <span className="eyebrow" style={{fontSize:9}}>Wk</span>
            <span className="eyebrow" style={{fontSize:9}}>Phase</span>
            {['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d=><span key={d} className="eyebrow" style={{fontSize:9,textAlign:'center'}}>{d}</span>)}
            <span className="eyebrow" style={{fontSize:9,textAlign:'right'}}>Comp</span>
          </div>
          <div style={{maxHeight:560,overflowY:'auto'}}>
            {weeks.map(wk=>{
              const block=blockForWeek(wk.start);
              const cells=wk.days.map(date=>{const list=seasonData[date]||[];if(!list.length)return{status:'empty',sport:null,count:0,compliance:null};const w=list[0];return{status:w.status,sport:w.sport,count:list.length,compliance:w.compliance};});
              const done=cells.filter(c=>c.status==='met'||c.status==='partial'||c.status==='missed');
              const wkComp=done.length?Math.round(done.reduce((s,c)=>s+(c.compliance||0),0)/done.length*100):null;
              const isCurrent=wk.start<=todayD&&todayD<new Date(wk.start.getTime()+7*86400000);
              return (
                <div key={wk.idx} onMouseEnter={()=>setHoverWeek(wk.idx)} onMouseLeave={()=>setHoverWeek(null)}
                  style={{display:'grid',gridTemplateColumns:'60px 80px repeat(7,1fr) 70px',padding:'6px 14px',borderBottom:'1px solid var(--rule-soft)',background:isCurrent?'var(--aegean-wash)':hoverWeek===wk.idx?'var(--linen)':'transparent',alignItems:'center',gap:4}}>
                  <span className="mono" style={{fontSize:11,color:isCurrent?'var(--ink)':'var(--ink-mute)',fontWeight:isCurrent?600:400}}>W{wk.idx+1}</span>
                  <div>
                    <div className="mono" style={{fontSize:9.5,color:'var(--ink-mute)'}}>{wk.start.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
                    {block&&<div className="mono" style={{fontSize:9,color:`var(--${block.color}-deep)`,textTransform:'uppercase',letterSpacing:'0.1em',marginTop:1}}>{block.phase}</div>}
                  </div>
                  {cells.map((cell,di)=>{
                    const date=wk.days[di];const list=seasonData[date]||[];const w=list[0];
                    return (
                      <div key={di} onClick={()=>w&&onOpenWorkout(w)}
                        style={{height:36,margin:'0 1px',background:cell.status==='met'?'var(--c-met-bg)':cell.status==='partial'?'var(--c-partial-bg)':cell.status==='missed'?'var(--c-missed-bg)':cell.status==='planned'?'var(--linen)':'transparent',border:'1px solid',borderColor:cell.status==='met'?'var(--c-met-border)':cell.status==='partial'?'var(--c-partial-border)':cell.status==='missed'?'var(--c-missed-border)':cell.status==='planned'?'var(--rule-soft)':'transparent',borderRadius:2,display:'flex',alignItems:'center',justifyContent:'center',cursor:w?'pointer':'default'}}>
                        {cell.sport&&<span style={{fontFamily:'var(--display)',fontSize:14,color:cell.status==='met'?'var(--c-met)':cell.status==='partial'?'var(--c-partial)':cell.status==='missed'?'var(--c-missed)':'var(--ink-soft)'}}>{SPORT_GLYPHS[cell.sport]}</span>}
                      </div>
                    );
                  })}
                  <span className="mono" style={{fontSize:11,color:wkComp!=null?(wkComp>=85?'var(--c-met)':wkComp>=50?'var(--c-partial)':'var(--c-missed)'):'var(--ink-faint)',textAlign:'right'}}>{wkComp!=null?`${wkComp}%`:'—'}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{display:'flex',gap:18,marginTop:12,fontSize:10.5,fontFamily:'var(--mono)',color:'var(--ink-mute)'}}>
          <span><span className="dot dot-met"/> Met (≥85%)</span>
          <span><span className="dot dot-partial"/> Partial (50–85%)</span>
          <span><span className="dot dot-missed"/> Missed (&lt;50%)</span>
        </div>
      </div>
      <aside style={{display:'flex',flexDirection:'column',gap:16}}>
        <div className="panel" style={{padding:22}}>
          <span className="eyebrow">Methodology</span>
          <h3 className="display" style={{fontSize:18,margin:'6px 0 14px'}}>How we train</h3>
          <div className="pullquote" style={{marginBottom:16,fontSize:15}}>"{STATIC_COACH.philosophy}"</div>
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {METHODOLOGY.map((m,i)=>(
              <div key={m.id}><div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:4}}><span className="mono" style={{fontSize:10,color:'var(--ink-mute)'}}>0{i+1}</span><h4 className="display" style={{fontSize:14,margin:0,color:'var(--ink)'}}>{m.title}</h4></div><p style={{margin:0,fontSize:12,color:'var(--ink-soft)',lineHeight:1.6,paddingLeft:24}}>{m.body}</p></div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── Profile page ─────────────────────────────────────────────────────────────
function BigStat({label,value,unit,large}: {label:string;value:string;unit?:string;large?:boolean}) {
  return <div><div className="eyebrow" style={{fontSize:9.5}}>{label}</div><div style={{display:'flex',alignItems:'baseline',gap:5,marginTop:4}}><span className="display" style={{fontSize:large?32:20,color:'var(--ink)',lineHeight:1}}>{value}</span>{unit&&<span className="mono" style={{fontSize:large?13:11,color:'var(--ink-mute)'}}>{unit}</span>}</div></div>;
}
function PRow({label,value}: {label:string;value:string}) {
  return <div style={{display:'flex',flexDirection:'column',gap:3}}><span className="mono" style={{fontSize:9.5,color:'var(--ink-mute)',textTransform:'uppercase',letterSpacing:'0.12em'}}>{label}</span><span style={{fontSize:13,color:'var(--ink)',fontWeight:500}}>{value}</span></div>;
}
function CadenceBadge({cadence}: {cadence:string}) {
  const map: Record<string,{label:string;bg:string;fg:string;bd:string}> = {weekly:{label:'Weekly',bg:'var(--aegean-wash)',fg:'var(--aegean-deep)',bd:'var(--aegean-soft)'},monthly:{label:'Monthly',bg:'var(--olive-wash)',fg:'var(--olive-deep)',bd:'var(--olive-soft)'},block:{label:'Block',bg:'var(--terracotta-wash)',fg:'var(--terracotta-deep)',bd:'var(--terracotta-soft)'}};
  const k=map[cadence]||map.weekly;
  return <span className="mono" style={{fontSize:9,padding:'2px 7px',background:k.bg,color:k.fg,border:`1px solid ${k.bd}`,borderRadius:2,textTransform:'uppercase',letterSpacing:'0.1em'}}>{k.label}</span>;
}

function Profile({tab, onTab, memory, athlete, files, uploading, onUpload, onDeleteFile, uploadError, coach}: {tab:string;onTab:(t:string)=>void;memory:{at:number;kind:string;text:string}[];athlete:LiveAthlete;files:AthleteFile[];uploading:boolean;onUpload:(f:File)=>void;onDeleteFile:(id:string)=>void;uploadError:string|null;coach:ReturnType<typeof buildCoachDisplay>}) {
  const r = WEEKLY_REPORT;
  const [reportExpanded, setReportExpanded] = useState(false);
  const [openPast, setOpenPast] = useState<typeof PAST_REPORTS[0]|null>(null);
  const waNumber = (coach.whatsapp||'').replace(/[^\d]/g,'');
  const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent('Hey Coach — quick question about this week.')}`;
  return (
    <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:24}}>
      <aside style={{display:'flex',flexDirection:'column',gap:16}}>
        <div className="panel" style={{padding:24}}>
          <div className="placeholder-stripe" style={{width:80,height:80,borderRadius:999,marginBottom:14}}>{athlete.initials}</div>
          <div className="display" style={{fontSize:22,margin:'0 0 2px',color:'var(--ink)'}}>{athlete.fullName}</div>
          <div className="mono" style={{fontSize:10.5,color:'var(--ink-mute)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:18}}>{athlete.type} · Training</div>
          <div style={{display:'flex',flexDirection:'column',gap:14,paddingTop:18,borderTop:'1px solid var(--rule-soft)'}}>
            <PRow label="Goal event" value={athlete.goal||'—'}/>
            <PRow label="Race date" value={athlete.goalDate||'—'}/>
            <PRow label="Weeks out" value={String(athlete.weeksOut)}/>
            <PRow label="Coach" value={coach.name}/>
          </div>
        </div>
        <div className="panel" style={{padding:22}}>
          <span className="eyebrow">Performance markers</span>
          <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:14}}>
            <BigStat label="FTP" value={String(athlete.ftp)} unit="W"/>
            <BigStat label="Threshold pace" value={athlete.thresholdPace}/>
            <BigStat label="CSS pace" value={athlete.cssPace}/>
          </div>
        </div>
        {athlete.aiProfile&&(
          <div className="panel" style={{padding:22,background:'var(--aegean-wash)',borderColor:'var(--aegean-soft)'}}>
            <span className="eyebrow eyebrow-aegean">AI Profile</span>
            <p style={{margin:'10px 0 0',fontSize:12.5,color:'var(--ink)',lineHeight:1.65}}>{athlete.aiProfile}</p>
          </div>
        )}
      </aside>
      <main>
        <div style={{display:'flex',borderBottom:'1px solid var(--rule-soft)',marginBottom:20}}>
          {(['report','coach','memory','files'] as const).map(t=><button key={t} className={`toptab${tab===t?' active':''}`} onClick={()=>onTab(t)} style={{textTransform:'capitalize'}}>{t==='report'?'Reports':t==='files'?'Files':t==='coach'?'Coach':t==='memory'?'Memory':t}</button>)}
        </div>

        {tab==='report'&&(
          <div style={{display:'flex',flexDirection:'column',gap:20}}>
            <div className="panel" style={{padding:'32px 36px'}}>
              <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:16,marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}><span className="eyebrow">Week of {fmtDate(r.weekOf,{month:'long',day:'numeric',year:'numeric'})}</span><CadenceBadge cadence="weekly"/></div>
                <span className="mono" style={{fontSize:10.5,color:'var(--olive-deep)',letterSpacing:'0.12em',textTransform:'uppercase'}}>● {r.status}</span>
              </div>
              <h1 className="display" style={{fontSize:36,margin:'0 0 24px',letterSpacing:'-0.025em',lineHeight:1.1}}>Strong block. Hold the volume.</h1>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:24,marginBottom:28,paddingBottom:24,borderBottom:'1px solid var(--rule-soft)'}}>
                <BigStat label="Hours trained" value={String(r.hours)} unit={`/ ${r.hoursPlanned}h`} large/>
                <BigStat label="Compliance" value={`${Math.round(r.compliance*100)}%`} large/>
                <BigStat label="Sessions" value="6/7" large/>
              </div>
              <div style={{display:'flex',gap:14,marginBottom:28,alignItems:'flex-start'}}>
                <div className="avatar avatar-coach" style={{width:44,height:44,fontSize:16}}>{coach.initials}</div>
                <div style={{flex:1}}>
                  <div className="eyebrow eyebrow-terracotta" style={{fontSize:9.5,marginBottom:6}}>From {coach.name}</div>
                  {r.fromCoach.split('\n\n').map((p,i)=><p key={i} className="display" style={{margin:i?'14px 0 0':0,fontSize:15,lineHeight:1.6,color:'var(--ink)'}}>{p}</p>)}
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}>
                <div><span className="eyebrow eyebrow-olive" style={{fontSize:9.5}}>Highlights</span><ul style={{margin:'10px 0 0',padding:0,listStyle:'none',display:'flex',flexDirection:'column',gap:8}}>{r.highlights.map((h,i)=><li key={i} style={{display:'flex',gap:8,fontSize:13,color:'var(--ink)',lineHeight:1.5}}><span style={{color:'var(--olive-deep)',fontFamily:'var(--mono)',fontSize:11,marginTop:2}}>+</span>{h}</li>)}</ul></div>
                <div><span className="eyebrow eyebrow-terracotta" style={{fontSize:9.5}}>Watchouts</span><ul style={{margin:'10px 0 0',padding:0,listStyle:'none',display:'flex',flexDirection:'column',gap:8}}>{r.watchouts.map((h,i)=><li key={i} style={{display:'flex',gap:8,fontSize:13,color:'var(--ink)',lineHeight:1.5}}><span style={{color:'var(--terracotta-deep)',fontFamily:'var(--mono)',fontSize:11,marginTop:2}}>!</span>{h}</li>)}</ul></div>
              </div>
              <div style={{marginTop:24,paddingTop:18,borderTop:'1px solid var(--rule-soft)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:14}}>
                <span className="mono" style={{fontSize:10.5,color:'var(--ink-mute)'}}>{reportExpanded?'Full report — drafted by AI, signed by Coach Andes.':'Expand for section-by-section breakdown.'}</span>
                <button className="btn" onClick={()=>setReportExpanded(v=>!v)}>{reportExpanded?'↑ Collapse':'↓ Expand full report'}</button>
              </div>
            </div>
            <div className="panel" style={{padding:24}}>
              <span className="eyebrow">Compliance by sport</span>
              <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:14}}>
                {Object.entries(r.bySport).map(([sport,value])=>(
                  <div key={sport} style={{display:'grid',gridTemplateColumns:'90px 1fr 50px',alignItems:'center',gap:14}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}><SportGlyph sport={sport} size={20}/><span style={{fontSize:12.5,color:'var(--ink)'}}>{SPORT_LABEL[sport]}</span></div>
                    <div style={{height:8,background:'var(--linen-deep)',borderRadius:999,overflow:'hidden'}}><div style={{height:'100%',width:`${value*100}%`,background:value>=0.85?'var(--c-met)':value>=0.5?'var(--c-partial)':'var(--c-missed)'}}/></div>
                    <span className="mono" style={{fontSize:12,color:'var(--ink)',textAlign:'right'}}>{Math.round(value*100)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel" style={{padding:28}}>
              <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:6}}><span className="eyebrow">Previous reports</span><span className="mono" style={{fontSize:10,color:'var(--ink-mute)'}}>{PAST_REPORTS.length} archived</span></div>
              <div style={{display:'flex',flexDirection:'column'}}>
                {PAST_REPORTS.map((p,i)=>(
                  <div key={p.id} onClick={()=>setOpenPast(p)} style={{display:'grid',gridTemplateColumns:'110px 70px 1fr 70px 24px',gap:18,alignItems:'center',padding:'14px 0',borderTop:i?'1px solid var(--rule-soft)':'none',cursor:'pointer'}}>
                    <span className="mono" style={{fontSize:11,color:'var(--ink-mute)'}}>{fmtDate(p.weekOf,{month:'short',day:'numeric'})}</span>
                    <CadenceBadge cadence={p.cadence}/>
                    <div><div className="display" style={{fontSize:14.5,color:'var(--ink)',marginBottom:2}}>{p.title}</div><div style={{fontSize:11.5,color:'var(--ink-soft)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.summary}</div></div>
                    <span className="mono" style={{fontSize:11,color:p.compliance>=0.85?'var(--c-met)':p.compliance>=0.5?'var(--c-partial)':'var(--c-missed)',textAlign:'right'}}>{Math.round(p.compliance*100)}%</span>
                    <span style={{color:'var(--ink-faint)',textAlign:'right'}}>›</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab==='coach'&&(
          <div className="panel" style={{padding:'32px 36px'}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:20,marginBottom:24}}>
              <div className="avatar avatar-coach" style={{width:88,height:88,fontSize:30}}>{coach.initials}</div>
              <div style={{flex:1}}><span className="eyebrow eyebrow-terracotta">Your coach</span><h2 className="display" style={{fontSize:32,margin:'4px 0 4px',letterSpacing:'-0.02em'}}>{coach.name}</h2><div className="mono" style={{fontSize:11,color:'var(--ink-mute)',textTransform:'uppercase',letterSpacing:'0.12em'}}>{coach.title}</div></div>
              {waNumber&&<a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{display:'inline-flex',alignItems:'center',gap:8,textDecoration:'none'}}>WhatsApp</a>}
            </div>
            <p style={{margin:'0 0 22px',fontSize:14,color:'var(--ink-soft)',lineHeight:1.7}}>{coach.bio}</p>
            <div className="pullquote" style={{fontSize:20,marginBottom:24}}>"{coach.philosophy}"</div>
            <div style={{paddingTop:22,borderTop:'1px solid var(--rule-soft)'}}>
              <span className="eyebrow">How we train together</span>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18,marginTop:14}}>
                {METHODOLOGY.map((m,i)=>(
                  <div key={m.id}><div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:6}}><span className="mono" style={{fontSize:10,color:'var(--ink-mute)'}}>0{i+1}</span><h4 className="display" style={{fontSize:15,margin:0,color:'var(--ink)'}}>{m.title}</h4></div><p style={{margin:0,fontSize:12.5,color:'var(--ink-soft)',lineHeight:1.65,paddingLeft:22}}>{m.body}</p></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab==='memory'&&(
          <div className="panel" style={{padding:28}}>
            <span className="eyebrow">Athlete memory</span>
            <h2 className="display" style={{fontSize:22,margin:'6px 0 6px'}}>What {coach.name} knows about you</h2>
            <p style={{fontSize:13,color:'var(--ink-soft)',margin:'0 0 20px',lineHeight:1.6}}>An append-only log sent to coach.ai as context for every report.</p>
            <div style={{display:'flex',flexDirection:'column'}}>
              {[...memory].reverse().map((m,i)=>(
                <div key={i} style={{display:'grid',gridTemplateColumns:'110px 90px 1fr',gap:16,padding:'12px 0',borderTop:i?'1px solid var(--rule-soft)':'none',alignItems:'baseline'}}>
                  <span className="mono" style={{fontSize:10.5,color:'var(--ink-mute)'}}>{new Date(m.at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</span>
                  <span className="mono" style={{fontSize:9.5,padding:'2px 6px',background:'var(--linen-deep)',color:'var(--ink-soft)',textTransform:'uppercase',letterSpacing:'0.1em',borderRadius:2,justifySelf:'start'}}>{m.kind}</span>
                  <span style={{fontSize:13,color:'var(--ink)',lineHeight:1.5}}>{m.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab==='files'&&(
          <div className="panel" style={{padding:28}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div><span className="eyebrow">My files</span><p style={{margin:'4px 0 0',fontSize:12.5,color:'var(--ink-soft)'}}>Visible to you and Coach Andes.</p></div>
              <label style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 14px',background:uploading?'var(--linen-deep)':'var(--ink)',border:'1px solid',borderColor:uploading?'var(--rule)':'var(--ink)',borderRadius:2,color:uploading?'var(--ink-mute)':'var(--parchment)',fontSize:12,fontFamily:'var(--body)',fontWeight:500,cursor:uploading?'not-allowed':'pointer'}}>
                {uploading?'Uploading…':'+ Upload'}
                <input type="file" accept=".pdf,.txt,.md,.csv" onChange={e=>{const f=e.target.files?.[0];if(f)onUpload(f);e.target.value='';}} disabled={uploading} style={{display:'none'}}/>
              </label>
            </div>
            {uploadError&&<div style={{padding:'8px 12px',background:'var(--terracotta-wash)',border:'1px solid var(--terracotta-soft)',borderRadius:2,fontSize:12,color:'var(--terracotta-deep)',marginBottom:12}}>{uploadError}</div>}
            <p className="mono" style={{fontSize:10,color:'var(--ink-mute)',margin:'0 0 16px'}}>PDF · TXT · MD · CSV · max 50 MB</p>
            {files.length===0?<div style={{textAlign:'center',padding:'2rem',color:'var(--ink-mute)'}}><p style={{fontSize:28,margin:'0 0 8px'}}>📁</p><p className="mono" style={{fontSize:11}}>No files uploaded yet</p></div>:(
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {files.map(f=>(
                  <div key={f.id} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 14px',border:'1px solid var(--rule-soft)',borderRadius:3,background:'var(--linen)'}}>
                    <div className="placeholder-stripe" style={{width:32,height:40,borderRadius:2,fontSize:8}}>{f.file_type?.toUpperCase()||'FILE'}</div>
                    <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,color:'var(--ink)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.original_filename}</div><div className="mono" style={{fontSize:10,color:'var(--ink-mute)',marginTop:2}}>{f.size_bytes?(f.size_bytes<1024*1024?`${(f.size_bytes/1024).toFixed(0)} KB`:`${(f.size_bytes/(1024*1024)).toFixed(1)} MB`):''} · {new Date(f.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})} {f.status==='processed'?'· ✓ Indexed':f.status==='pending'?'· Indexing…':''}</div></div>
                    <button onClick={()=>onDeleteFile(f.id)} className="btn btn-ghost" style={{color:'var(--terracotta-deep)',flexShrink:0}}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {openPast&&(
        <div className="modal-backdrop" onClick={()=>setOpenPast(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:'var(--parchment)',width:'min(660px,92vw)',maxHeight:'90vh',overflow:'auto',borderRadius:4,border:'1px solid var(--rule)',animation:'slide-up 200ms ease'}}>
            <div style={{padding:'24px 32px',borderBottom:'1px solid var(--rule-soft)',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div><div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}><span className="eyebrow">Week of {fmtDate(openPast.weekOf,{month:'long',day:'numeric',year:'numeric'})}</span><CadenceBadge cadence={openPast.cadence}/></div><h2 className="display" style={{fontSize:24,margin:0}}>{openPast.title}</h2></div>
              <button className="btn btn-ghost btn-icon" onClick={()=>setOpenPast(null)}>×</button>
            </div>
            <div style={{padding:'24px 32px'}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:24,marginBottom:24,paddingBottom:24,borderBottom:'1px solid var(--rule-soft)'}}><BigStat label="Hours" value={String(openPast.hours)} unit={`/ ${openPast.hoursPlanned}h`}/><BigStat label="Compliance" value={`${Math.round(openPast.compliance*100)}%`}/><BigStat label="Cadence" value={openPast.cadence}/></div>
              <div style={{display:'flex',gap:14,alignItems:'flex-start'}}><div className="avatar avatar-coach" style={{width:40,height:40,fontSize:14}}>{coach.initials}</div><div style={{flex:1}}><div className="eyebrow eyebrow-terracotta" style={{fontSize:9.5,marginBottom:6}}>From {coach.name}</div><p className="display" style={{margin:0,fontSize:15,lineHeight:1.65,color:'var(--ink)'}}>{openPast.summary}</p></div></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings page ────────────────────────────────────────────────────────────
const SETTINGS_NAV = [
  {group:'Account',items:['Profile','Coaches','Notifications']},
  {group:'Training',items:['Calendar','Zones','Equipment']},
  {group:'Data',items:['Apps & Devices','Export data']},
  {group:'About',items:['Help','Privacy','Terms']},
];
function FieldRow({label,sub,children}: {label:string;sub?:string;children:React.ReactNode}) {
  return <div style={{display:'grid',gridTemplateColumns:'180px 1fr',gap:24,alignItems:'center',padding:'10px 0'}}><div><div style={{fontSize:13,color:'var(--ink)',fontWeight:500}}>{label}</div>{sub&&<div className="mono" style={{fontSize:10,color:'var(--ink-mute)',marginTop:2}}>{sub}</div>}</div><div>{children}</div></div>;
}
function SectionTitle({children}: {children:React.ReactNode}) {
  return <div className="display" style={{fontSize:16,color:'var(--ink)',margin:'20px 0 8px',paddingTop:18,borderTop:'1px solid var(--rule-soft)'}}>{children}</div>;
}
function Settings({tweaks, setTweak, section: sectionProp, onSection, onLogout, athlete, coach, onSaveProfile}: {tweaks:Record<string,unknown>;setTweak:(k:string,v:unknown)=>void;section:string;onSection:(s:string)=>void;onLogout:()=>void;athlete:LiveAthlete;coach:ReturnType<typeof buildCoachDisplay>;onSaveProfile:(data:{full_name?:string;email?:string;target_event_name?:string;target_event_date?:string})=>Promise<void>}) {
  const section = sectionProp;
  const [fullName, setFullName] = useState(athlete.fullName);
  const [email, setEmail] = useState(athlete.email);
  const [goal, setGoal] = useState(athlete.goal);
  const [goalDate, setGoalDate] = useState(athlete.goalDate);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string|null>(null);

  async function handleSave() {
    if(section!=='Profile') return;
    setSaving(true);setSaveMsg(null);
    try{await onSaveProfile({full_name:fullName,email,target_event_name:goal,target_event_date:goalDate});setSaveMsg('Saved ✓');}
    catch{setSaveMsg('Save failed — try again.');}
    finally{setSaving(false);setTimeout(()=>setSaveMsg(null),2500);}
  }

  return (
    <div className="panel" style={{display:'grid',gridTemplateColumns:'240px 1fr',minHeight:640,padding:0,overflow:'hidden',background:'var(--parchment)'}}>
      <aside style={{borderRight:'1px solid var(--rule-soft)',padding:'28px 0',background:'var(--linen)'}}>
        <div style={{padding:'0 22px 18px'}}><span className="eyebrow">Account settings</span></div>
        {SETTINGS_NAV.map(g=>(
          <div key={g.group} style={{marginBottom:14}}>
            <div style={{padding:'4px 22px',fontSize:9.5,fontFamily:'var(--mono)',color:'var(--ink-faint)',textTransform:'uppercase',letterSpacing:'0.14em'}}>{g.group}</div>
            {g.items.map(it=>(
              <button key={it} onClick={()=>onSection(it)} style={{display:'block',width:'100%',textAlign:'left',padding:'7px 22px',fontSize:13,fontFamily:'var(--body)',color:section===it?'var(--ink)':'var(--ink-soft)',background:section===it?'var(--linen-deep)':'transparent',border:'none',borderLeft:section===it?'2px solid var(--ink)':'2px solid transparent',cursor:'pointer',fontWeight:section===it?500:400}}>{it}</button>
            ))}
          </div>
        ))}
      </aside>
      <div style={{padding:'32px 40px',overflowY:'auto',maxHeight:'78vh'}}>
        <div className="display" style={{fontSize:28,color:'var(--ink)',marginBottom:6}}>{section}</div>
        <div className="mono" style={{fontSize:10.5,color:'var(--ink-mute)',marginBottom:28}}>Changes save to your profile and sync to your coach.</div>
        {section==='Profile'&&(
          <div>
            <FieldRow label="Full name"><input className="input" value={fullName} onChange={e=>setFullName(e.target.value)}/></FieldRow>
            <FieldRow label="Email"><input className="input" value={email} onChange={e=>setEmail(e.target.value)}/></FieldRow>
            <FieldRow label="Goal event"><input className="input" value={goal} onChange={e=>setGoal(e.target.value)}/></FieldRow>
            <FieldRow label="Goal date"><input className="input" type="date" value={goalDate} onChange={e=>setGoalDate(e.target.value)} style={{maxWidth:200}}/></FieldRow>
            <SectionTitle>Session</SectionTitle>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:14,padding:16,border:'1px solid var(--rule-soft)',background:'var(--linen)',borderRadius:3}}>
              <div><div style={{fontSize:13,color:'var(--ink)',fontWeight:500}}>Sign out of all devices</div><div className="mono" style={{fontSize:10.5,color:'var(--ink-mute)',marginTop:2}}>You'll need to sign in again on web and iOS.</div></div>
              <button className="btn" onClick={onLogout} style={{color:'var(--terracotta-deep)',borderColor:'var(--terracotta-soft)'}}>Sign out</button>
            </div>
          </div>
        )}
        {section==='Calendar'&&(
          <div>
            <FieldRow label="Week starts on" sub="Affects all calendar views">
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><button key={d} onClick={()=>setTweak('weekStart',d)} className="btn" style={{background:tweaks.weekStart===d?'var(--ink)':'var(--linen)',color:tweaks.weekStart===d?'var(--parchment)':'var(--ink)',borderColor:tweaks.weekStart===d?'var(--ink)':'var(--rule)'}}>{d}</button>)}
              </div>
            </FieldRow>
            <FieldRow label="Units"><select className="select" style={{maxWidth:160}} defaultValue="Imperial"><option>Imperial</option><option>Metric</option></select></FieldRow>
          </div>
        )}
        {section==='Zones'&&(
          <div>
            <FieldRow label="FTP" sub="Set or auto-detect from last test"><span style={{display:'flex',alignItems:'center',gap:8}}><input className="input" defaultValue={athlete.ftp} type="number" style={{maxWidth:140}}/> W</span></FieldRow>
            <FieldRow label="Threshold HR"><span style={{display:'flex',alignItems:'center',gap:8}}><input className="input" defaultValue="170" type="number" style={{maxWidth:140}}/> bpm</span></FieldRow>
            <SectionTitle>Cycling zones</SectionTitle>
            {[['Z1 · Recovery','0–155','<128'],['Z2 · Endurance','155–210','128–145'],['Z3 · Tempo','210–235','145–157'],['Z4 · Threshold','235–260','157–170'],['Z5 · VO₂ max','260–295','170–178'],['Z6 · Anaerobic','>295','>178']].map((z,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 120px 120px',gap:12,padding:'8px 12px',border:'1px solid var(--rule-soft)',borderRadius:2,background:i%2?'var(--parchment)':'var(--linen)',marginBottom:4}}>
                <span style={{fontSize:13,color:'var(--ink)'}}>{z[0]}</span>
                <span className="mono" style={{fontSize:11.5,color:'var(--ink-soft)'}}>{z[1]} W</span>
                <span className="mono" style={{fontSize:11.5,color:'var(--ink-soft)'}}>{z[2]} bpm</span>
              </div>
            ))}
          </div>
        )}
        {section==='Equipment'&&(
          <div>
            <p style={{fontSize:13,color:'var(--ink-soft)',margin:'0 0 20px',lineHeight:1.6}}>Your equipment list is shared with your coach to inform training recommendations.</p>
            {[{cat:'Bike',items:['Road bike · Cervélo R5','Race wheels · Zipp 404']},{cat:'Run',items:['Race shoes · Nike Vaporfly 3','Training shoes · Saucony Ride 17']},{cat:'Swim',items:['Wetsuit · BlueSeventy Helix','Goggles · Speedo Biofuse']}].map(g=>(
              <div key={g.cat} style={{marginBottom:20}}>
                <div className="eyebrow" style={{marginBottom:10}}>{g.cat}</div>
                {g.items.map((item,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',border:'1px solid var(--rule-soft)',borderRadius:3,background:'var(--linen)',marginBottom:6}}>
                    <span style={{flex:1,fontSize:13,color:'var(--ink)'}}>{item}</span>
                    <button className="btn btn-ghost" style={{fontSize:11,color:'var(--terracotta-deep)'}}>× Remove</button>
                  </div>
                ))}
                <button className="btn btn-ghost" style={{fontSize:12,marginTop:4}}>+ Add {g.cat.toLowerCase()}</button>
              </div>
            ))}
          </div>
        )}
        {section==='Coaches'&&(
          <div>
            <div style={{padding:20,border:'1px solid var(--rule-soft)',background:'var(--linen)',borderRadius:3}}>
              <div style={{display:'flex',gap:14,alignItems:'center'}}>
                <div className="avatar avatar-coach" style={{width:48,height:48,fontSize:17}}>{coach.initials}</div>
                <div style={{flex:1}}><div className="display" style={{fontSize:17,color:'var(--ink)'}}>{coach.name}</div><div className="mono" style={{fontSize:10,color:'var(--ink-mute)',textTransform:'uppercase',letterSpacing:'0.1em'}}>{coach.title}</div></div>
                <span className="mono" style={{fontSize:10,padding:'4px 10px',background:'var(--olive-wash)',color:'var(--olive-deep)',border:'1px solid var(--olive-soft)',borderRadius:2,textTransform:'uppercase'}}>Primary</span>
              </div>
            </div>
          </div>
        )}
        {section==='Apps & Devices'&&(
          <div>
            <p style={{fontSize:13,color:'var(--ink-soft)',margin:'0 0 16px'}}>Connected devices feed into your readiness rail.</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {[{name:'Whoop',connected:true},{name:'Oura',connected:false},{name:'Garmin',connected:false},{name:'Apple Health',connected:false},{name:'Strava',connected:true},{name:'Zwift',connected:false}].map(d=>(
                <div key={d.name} style={{padding:14,border:'1px solid var(--rule-soft)',background:'var(--linen)',borderRadius:3,display:'flex',alignItems:'center',gap:12}}>
                  <span style={{flex:1,fontSize:13,color:'var(--ink)'}}>{d.name}</span>
                  {d.connected?<button className="btn btn-ghost" style={{color:'var(--olive-deep)'}}>● Connected</button>:<button className="btn">Connect</button>}
                </div>
              ))}
            </div>
          </div>
        )}
        {section==='Notifications'&&(
          <div>
            {[['Coach edits your plan',true],['New coach note on a workout',true],['Weekly report is published',true],['Missed workout reminders',false]].map(([label,on])=>(
              <FieldRow key={String(label)} label={String(label)}>
                <label style={{display:'inline-flex',alignItems:'center',gap:8}}><input type="checkbox" defaultChecked={Boolean(on)}/><span className="mono" style={{fontSize:11,color:'var(--ink-mute)'}}>Push · Email</span></label>
              </FieldRow>
            ))}
          </div>
        )}
        {section==='Export data'&&(
          <div><p style={{fontSize:13,color:'var(--ink-soft)'}}>Download your full training history as CSV or .FIT.</p><div style={{display:'flex',gap:8,marginTop:8}}><button className="btn">Export CSV</button><button className="btn">Export .FIT</button></div></div>
        )}
        {(section==='Help'||section==='Privacy'||section==='Terms')&&(
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {['Terms of Use','Privacy Policy','HIPAA','Sources & Citations'].map(l=><a key={l} href="#" style={{fontSize:14,color:'var(--ink)',textDecoration:'none',padding:'12px 16px',border:'1px solid var(--rule-soft)',borderRadius:3,background:'var(--linen)',display:'flex',justifyContent:'space-between'}}>{l} <span style={{color:'var(--ink-faint)'}}>↗</span></a>)}
          </div>
        )}
        {section==='Profile'&&(
          <div style={{marginTop:36,paddingTop:20,borderTop:'1px solid var(--rule-soft)',display:'flex',alignItems:'center',justifyContent:'flex-end',gap:12}}>
            {saveMsg&&<span className="mono" style={{fontSize:11,color:saveMsg.startsWith('Saved')?'var(--olive-deep)':'var(--terracotta-deep)'}}>{saveMsg}</span>}
            <button className="btn btn-ghost" onClick={()=>{setFullName(athlete.fullName);setEmail(athlete.email);setGoal(athlete.goal);setGoalDate(athlete.goalDate);}}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving…':'Save'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── UserMenu ─────────────────────────────────────────────────────────────────
function UserMenu({athlete, onNav, onLogout}: {athlete:LiveAthlete;onNav:(t:string)=>void;onLogout:()=>void}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(()=>{ function h(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);} document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h); },[]);
  return (
    <div ref={ref} style={{position:'relative'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:'flex',alignItems:'center',gap:10,padding:'4px 10px 4px 4px',background:open?'var(--linen-deep)':'transparent',border:'1px solid',borderColor:open?'var(--rule)':'transparent',borderRadius:999,cursor:'pointer'}}>
        <div className="avatar" style={{width:28,height:28,fontSize:11}}>{athlete.initials}</div>
        <span className="mono" style={{fontSize:11,color:'var(--ink-soft)'}}>{athlete.firstName}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{color:'var(--ink-mute)',transform:open?'rotate(180deg)':'none'}}><path d="M2 4l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open&&(
        <div style={{position:'absolute',top:'calc(100% + 8px)',right:0,width:260,background:'var(--parchment)',border:'1px solid var(--rule)',borderRadius:4,boxShadow:'0 16px 40px -12px rgba(0,0,0,0.18)',padding:6,animation:'fade-down 160ms ease',zIndex:100}}>
          <div style={{padding:'12px 14px 10px',borderBottom:'1px solid var(--rule-soft)'}}><div className="display" style={{fontSize:15,color:'var(--ink)'}}>{athlete.fullName}</div><div className="mono" style={{fontSize:10.5,color:'var(--ink-mute)',marginTop:2}}>{athlete.email}</div></div>
          <div style={{padding:'6px 0'}}>
            {[['Profile','profile'],['Settings','settings'],['Apps & devices','settings:Apps & Devices']].map(([label,target])=>(
              <button key={label} onClick={()=>{setOpen(false);onNav(target);}} className="menu-item">{label}</button>
            ))}
          </div>
          <div style={{borderTop:'1px solid var(--rule-soft)',padding:'6px 0'}}>
            <button onClick={()=>{setOpen(false);onLogout();}} className="menu-item" style={{color:'var(--terracotta-deep)'}}>Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TopNav ───────────────────────────────────────────────────────────────────
function TopNav({active, onNav, onRefresh, refreshing, pendingCount, onLogout, athlete}: {active:string;onNav:(t:string)=>void;onRefresh:()=>void;refreshing:boolean;pendingCount:number;onLogout:()=>void;athlete:LiveAthlete}) {
  return (
    <header style={{borderBottom:'1px solid var(--rule-soft)',background:'oklch(0.985 0.008 75 / 0.85)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:20}}>
      <div style={{maxWidth:1440,margin:'0 auto',padding:'0 32px',height:64,display:'flex',alignItems:'center',justifyContent:'space-between',gap:24}}>
        <div style={{display:'flex',alignItems:'center',gap:28}}>
          <div className="brand-mark">Andes<span style={{color:'var(--terracotta-deep)'}}>.</span>IA</div>
          <nav style={{display:'flex',gap:4,borderBottom:'none'}}>
            {[{id:'today',label:'Today'},{id:'season',label:'Season'},{id:'profile',label:'Profile'},{id:'settings',label:'Settings'}].map(t=>(
              <button key={t.id} className={`toptab${active===t.id?' active':''}`} onClick={()=>onNav(t.id)}>{t.label}</button>
            ))}
          </nav>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {pendingCount>0&&<span className="pending-badge"><span style={{width:6,height:6,borderRadius:999,background:'var(--terracotta)',display:'inline-block'}}/>{pendingCount} pending</span>}
          <button className="btn btn-ghost btn-icon" onClick={onRefresh} title="Refresh">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{transition:'transform 600ms',transform:refreshing?'rotate(360deg)':'rotate(0)'}}>
              <path d="M14 8a6 6 0 1 1-1.76-4.24M14 3v3.5h-3.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{width:1,height:22,background:'var(--rule-soft)'}}/>
          <UserMenu athlete={athlete} onNav={onNav} onLogout={onLogout}/>
        </div>
      </div>
    </header>
  );
}

// ─── Dashboard inner ──────────────────────────────────────────────────────────
function DashboardInner({athlete, files, onSignOut, uploading, onUpload, onDeleteFile, uploadError, initialCurrentWeek, initialLastWeek, authToken, coachProfile}: {athlete:LiveAthlete;files:AthleteFile[];onSignOut:()=>void;uploading:boolean;onUpload:(f:File)=>void;onDeleteFile:(id:string)=>void;uploadError:string|null;initialCurrentWeek:WorkoutItem[];initialLastWeek:WorkoutItem[];authToken:string|null;coachProfile:CoachProfile|null}) {
  const [page, setPage] = useState<string>('today');
  const [profileTab, setProfileTab] = useState('report');
  const [settingsSection, setSettingsSection] = useState('Profile');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutItem|null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [toast, setToast] = useState<{title:string;body?:string}|null>(null);
  const [tweaks, setTweaks] = useState<Record<string,unknown>>({density:'comfy',showBiometrics:true,weekStart:'Mon'});
  const [seasonData, setSeasonData] = useState<Record<string,WorkoutItem[]>>({});
  const [blockOverrides, setBlockOverrides] = useState<Record<string,{order?:number}>>({});
  const [appState, updateState, logMemory] = useAppState();
  const [dbMemory, setDbMemory] = useState<{at:number;kind:string;text:string}[]>([]);
  const coach = useMemo(()=>buildCoachDisplay(coachProfile), [coachProfile]);

  useEffect(()=>{ setSeasonData(buildSeasonData()); },[]);

  // COA-117: load memory events from API on mount
  useEffect(()=>{
    if(!authToken) return;
    fetch(`${BACKEND}/api/v1/athlete/memory-events?limit=100`,{headers:{Authorization:`Bearer ${authToken}`}})
      .then(r=>r.ok?r.json():null)
      .then(data=>{
        if(!data) return;
        setDbMemory((data as {id:string;event_type:string;content:string;created_at:string}[]).map(e=>({
          at: new Date(e.created_at).getTime(),
          kind: e.event_type,
          text: e.content,
        })));
      }).catch(()=>{});
  },[authToken]);

  function pushDbMemory(kind:string, text:string) {
    setDbMemory(prev=>[{at:Date.now(),kind,text},...prev]);
  }

  const todayStr = useMemo(()=>new Date().toISOString().slice(0,10), []);
  const curBounds = useMemo(()=>getWeekBounds(0), []);
  const prevBounds = useMemo(()=>getWeekBounds(-1), []);
  const currentWeek = useMemo(()=>mergeWorkouts(initialCurrentWeek.length>0?initialCurrentWeek:CURRENT_WEEK, appState.workouts),[initialCurrentWeek, appState.workouts]);
  const lastWeek = useMemo(()=>initialLastWeek.length>0?initialLastWeek:LAST_WEEK, [initialLastWeek]);
  const week = weekOffset===0?currentWeek:weekOffset===-1?lastWeek:currentWeek;
  const weekStart = weekOffset===0?curBounds.start:weekOffset===-1?prevBounds.start:curBounds.start;
  const weekLabel = weekOffset===0?curBounds.label:weekOffset===-1?prevBounds.label:curBounds.label;
  const today = currentWeek.find(w=>w.date===todayStr)||null;

  function handleNav(target:string) {
    if(target.startsWith('settings:')){setPage('settings');setSettingsSection(target.slice(9));}
    else if(target==='profile'){setPage('profile');setProfileTab('report');}
    else{setPage(target);}
  }
  function handleMarkComplete(w:WorkoutItem) {
    updateState(prev=>({...prev,workouts:{...prev.workouts,[w.id]:{...(prev.workouts[w.id]||{}),status:'met',compliance:1.0}}}));
    logMemory('complete',`Marked "${w.title}" as complete.`);
    setConfetti(true);setToast({title:'Workout complete ✓',body:`${w.title} logged.`});setSelectedWorkout(null);
    if(authToken){
      fetch(`${BACKEND}/api/v1/athlete/workouts/${w.id}/complete`,{method:'PATCH',headers:{Authorization:`Bearer ${authToken}`,'Content-Type':'application/json'},body:JSON.stringify({})}).catch(()=>{});
      postMemoryEvent(authToken,'complete',`Marked "${w.title}" as complete.`);
      pushDbMemory('complete',`Marked "${w.title}" as complete.`);
    }
  }
  async function handleSaveProfile(data:{full_name?:string;email?:string;target_event_name?:string;target_event_date?:string}) {
    if(!authToken) throw new Error('Not authenticated');
    const res = await fetch(`${BACKEND}/api/v1/athlete/profile`,{method:'PATCH',headers:{Authorization:`Bearer ${authToken}`,'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(!res.ok) throw new Error('Save failed');
  }
  function handleMoveWorkout(id:string,date:string) {
    updateState(prev=>({...prev,workouts:{...prev.workouts,[id]:{...(prev.workouts[id]||{}),date}}}));
    logMemory('reschedule',`Moved workout to ${date}.`);
  }
  function handleAddComment(w:WorkoutItem,text:string) {
    const c:WComment={id:'c'+Date.now(),author:'felipe',text,at:new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}),pending:true};
    updateState(prev=>{const ex=prev.workouts[w.id]||{};return{...prev,workouts:{...prev.workouts,[w.id]:{...ex,comments:[...(ex.comments||w.comments||[]),c]}},pendingCount:prev.pendingCount+1};});
    logMemory('comment',`Comment on "${w.title}": "${text}"`);
    if(authToken){
      fetch(`${BACKEND}/api/v1/athlete/workouts/${w.id}/notes`,{method:'PATCH',headers:{Authorization:`Bearer ${authToken}`,'Content-Type':'application/json'},body:JSON.stringify({notes:text})}).catch(()=>{});
      postMemoryEvent(authToken,'comment',`Comment on "${w.title}": "${text}"`);
      pushDbMemory('comment',`Comment on "${w.title}": "${text}"`);
    }
  }
  function handleAddVoiceMemo(w:WorkoutItem,len:number) {
    const m:VoiceMemo={id:'v'+Date.now(),length:len,transcript:'(transcribing…)',at:new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})};
    updateState(prev=>{const ex=prev.workouts[w.id]||{};return{...prev,workouts:{...prev.workouts,[w.id]:{...ex,voiceMemos:[...(ex.voiceMemos||w.voiceMemos||[]),m]}},pendingCount:prev.pendingCount+1};});
    logMemory('voice',`Voice memo (${len}s) on "${w.title}".`);
    if(authToken){
      postMemoryEvent(authToken,'voice_memo',`Voice memo (${len}s) on "${w.title}".`);
      pushDbMemory('voice_memo',`Voice memo (${len}s) on "${w.title}".`);
    }
  }

  return (
    <div className="ad-bg" style={{minHeight:'100vh'}} data-density={tweaks.density as string}>
      <style dangerouslySetInnerHTML={{__html:STYLES}}/>
      <TopNav active={page} onNav={handleNav} onRefresh={()=>{setRefreshing(true);setTimeout(()=>setRefreshing(false),1200);}} refreshing={refreshing} pendingCount={appState.pendingCount} onLogout={onSignOut} athlete={athlete}/>
      <main style={{maxWidth:1440,margin:'0 auto',padding:'32px 32px 80px'}}>
        {page==='today'&&(
          <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:24}}>
            <div style={{display:'flex',flexDirection:'column',gap:20}}>
              {today&&<TodaySnapshot today={today} onOpen={setSelectedWorkout} onMarkComplete={handleMarkComplete} coachInitials={coach.initials} coachName={coach.name}/>}
              <WeekMosaic week={week} weekStart={weekStart} weekLabel={weekLabel} weekOffset={weekOffset} onPrev={()=>setWeekOffset(o=>o-1)} onNext={()=>setWeekOffset(o=>o+1)} onThisWeek={()=>setWeekOffset(0)} onOpen={setSelectedWorkout} onMove={handleMoveWorkout}/>
              <WeekSummary week={week} athlete={athlete}/>
            </div>
            <aside style={{display:'flex',flexDirection:'column',gap:20}}>
              <BiometricsRail visible={tweaks.showBiometrics as boolean}/>
            </aside>
          </div>
        )}
        {page==='season'&&<Season onOpenWorkout={setSelectedWorkout} blockOverrides={blockOverrides} onMoveBlock={(id,order)=>setBlockOverrides(prev=>({...prev,[id]:{...prev[id],order}}))} seasonData={seasonData}/>}
        {page==='profile'&&<Profile tab={profileTab} onTab={setProfileTab} memory={dbMemory.length>0?dbMemory:appState.memory} athlete={athlete} files={files} uploading={uploading} onUpload={onUpload} onDeleteFile={onDeleteFile} uploadError={uploadError} coach={coach}/>}
        {page==='settings'&&<Settings tweaks={tweaks} setTweak={(k,v)=>setTweaks(prev=>({...prev,[k]:v}))} section={settingsSection} onSection={setSettingsSection} onLogout={onSignOut} athlete={athlete} coach={coach} onSaveProfile={handleSaveProfile}/>}
      </main>
      {selectedWorkout&&<WorkoutDetail workout={selectedWorkout} onClose={()=>setSelectedWorkout(null)} onAddComment={text=>handleAddComment(selectedWorkout,text)} onAddVoiceMemo={len=>handleAddVoiceMemo(selectedWorkout,len)} onMarkComplete={()=>handleMarkComplete(selectedWorkout)} athleteInitials={athlete.initials} coachInitials={coach.initials} coachName={coach.name}/>}
      <Confetti show={confetti} onDone={()=>setConfetti(false)}/>
      {toast&&<Toast show={!!toast} title={toast.title} body={toast.body} onDone={()=>setToast(null)}/>}
    </div>
  );
}

// ─── Main exported page ───────────────────────────────────────────────────────
export default function AthleteDashboardPage() {
  const router = useRouter();
  const [athlete, setAthlete] = useState<LiveAthlete|null>(null);
  const [files, setFiles] = useState<AthleteFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string|null>(null);
  const [currentWeekWorkouts, setCurrentWeekWorkouts] = useState<WorkoutItem[]>([]);
  const [lastWeekWorkouts, setLastWeekWorkouts] = useState<WorkoutItem[]>([]);
  const [authToken, setAuthToken] = useState<string|null>(null);
  const [coachProfile, setCoachProfile] = useState<CoachProfile|null>(null);

  async function getToken() {
    const sb = createBrowserSupabase();
    const {data} = await sb.auth.getSession();
    return data.session?.access_token??null;
  }

  useEffect(()=>{
    async function load() {
      const sb = createBrowserSupabase();
      const {data:{session}} = await sb.auth.getSession();
      if(!session){router.replace('/login');return;}
      const token = session.access_token;
      setAuthToken(token);
      try {
        const statusRes = await fetch(`${BACKEND}/api/v1/athlete/onboarding/status`,{headers:{Authorization:`Bearer ${token}`}});
        if(statusRes.ok){const d=await statusRes.json();if(!d.onboarding_complete){router.replace('/athlete/onboarding');return;}}
      } catch{}
      let athleteId: string|null = null;
      try {const b64=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');athleteId=JSON.parse(atob(b64+'=='.slice((b64.length%4)||4))).athlete_id;} catch{}
      if(!athleteId){router.replace('/athlete/onboarding');return;}
      const {start:curStart,end:curEnd} = getWeekBounds(0);
      const {start:prevStart,end:prevEnd} = getWeekBounds(-1);
      const [profRes,filesRes,curWRes,prevWRes,coachRes] = await Promise.allSettled([
        sb.from('athletes').select('id,full_name,email,primary_sport,ai_profile_summary,target_event_name,target_event_date').eq('id',athleteId).single(),
        fetch(`${BACKEND}/api/v1/athlete/files`,{headers:{Authorization:`Bearer ${token}`}}),
        fetch(`${BACKEND}/api/v1/athlete/workouts?from=${curStart}&to=${curEnd}`,{headers:{Authorization:`Bearer ${token}`}}),
        fetch(`${BACKEND}/api/v1/athlete/workouts?from=${prevStart}&to=${prevEnd}`,{headers:{Authorization:`Bearer ${token}`}}),
        fetch(`${BACKEND}/api/v1/athlete/coach`,{headers:{Authorization:`Bearer ${token}`}}),
      ]);
      if(profRes.status==='fulfilled'&&profRes.value.data){
        const p = profRes.value.data as Record<string,string>;
        const fullName = p.full_name||'Athlete';
        const goalDate = p.target_event_date||'';
        setAthlete({
          firstName: fullName.split(' ')[0],
          fullName,
          initials: fullName.split(' ').map((n:string)=>n[0]).slice(0,2).join('').toUpperCase(),
          email: p.email||'',
          type: p.primary_sport?p.primary_sport.charAt(0).toUpperCase()+p.primary_sport.slice(1):'Triathlete',
          goal: p.target_event_name||'Ironman Lake Placid',
          goalDate,
          weeksOut: weeksUntil(goalDate),
          aiProfile: p.ai_profile_summary||'',
          ftp: 248,
          thresholdPace: '4:12/km',
          cssPace: '1:32/100m',
        });
      }
      if(filesRes.status==='fulfilled'&&(filesRes.value as Response).ok){
        const d=await (filesRes.value as Response).json();setFiles(d);
      }
      if(curWRes.status==='fulfilled'&&(curWRes.value as Response).ok){
        const d=await (curWRes.value as Response).json();setCurrentWeekWorkouts(d.map(apiWorkoutToItem));
      }
      if(prevWRes.status==='fulfilled'&&(prevWRes.value as Response).ok){
        const d=await (prevWRes.value as Response).json();setLastWeekWorkouts(d.map(apiWorkoutToItem));
      }
      if(coachRes.status==='fulfilled'&&(coachRes.value as Response).ok){
        const d=await (coachRes.value as Response).json();setCoachProfile(d);
      }
      setLoading(false);
    }
    load();
  },[router]);

  async function handleUpload(file:File) {
    setUploading(true);setUploadError(null);
    const token=await getToken();
    if(!token){setUploadError('Session expired.');setUploading(false);return;}
    const fd=new FormData();fd.append('file',file);
    try{
      const res=await fetch(`${BACKEND}/api/v1/athlete/files`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd});
      if(!res.ok){const b=await res.json().catch(()=>({}));throw new Error(b?.detail??'Upload failed');}
      const nf=await res.json();setFiles(prev=>[nf,...prev]);
    }catch(e){setUploadError(e instanceof Error?e.message:'Upload failed');}
    finally{setUploading(false);}
  }

  async function handleDeleteFile(id:string) {
    const token=await getToken();if(!token)return;
    try{await fetch(`${BACKEND}/api/v1/athlete/files/${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});setFiles(prev=>prev.filter(f=>f.id!==id));}catch{}
  }

  async function handleSignOut() {
    const sb=createBrowserSupabase();await sb.auth.signOut();router.replace('/login');
  }

  if(loading||!athlete){
    return(
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--parchment)'}}>
        <style dangerouslySetInnerHTML={{__html:STYLES}}/>
        <div style={{textAlign:'center'}}>
          <div className="brand-mark" style={{fontSize:24,justifyContent:'center',marginBottom:16}}>Andes<span style={{color:'var(--terracotta-deep)'}}>.</span>IA</div>
          <p className="mono" style={{fontSize:11,color:'var(--ink-mute)'}}>Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  return <DashboardInner athlete={athlete} files={files} onSignOut={handleSignOut} uploading={uploading} onUpload={handleUpload} onDeleteFile={handleDeleteFile} uploadError={uploadError} initialCurrentWeek={currentWeekWorkouts} initialLastWeek={lastWeekWorkouts} authToken={authToken} coachProfile={coachProfile}/>;
}

// ─── Stat / Field / Comment helpers ──────────────────────────────────────────
function Stat({label,value,unit,delta}: {label:string;value:number|string;unit?:string;delta?:string}) {
  return <div><div className="eyebrow" style={{fontSize:9}}>{label}</div><div style={{display:'flex',alignItems:'baseline',gap:4,marginTop:3}}><span className="display" style={{fontSize:18,color:'var(--ink)'}}>{value}</span>{unit&&<span className="mono" style={{fontSize:10,color:'var(--ink-mute)'}}>{unit}</span>}</div>{delta&&<div className="mono" style={{fontSize:9.5,color:'var(--ink-mute)',marginTop:2}}>{delta}</div>}</div>;
}
function Field({label,value}: {label:string;value:string}) {
  return <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12}}><span className="mono" style={{fontSize:10,color:'var(--ink-mute)',textTransform:'uppercase',letterSpacing:'0.1em'}}>{label}</span><span className="mono" style={{fontSize:14,color:'var(--ink)',fontWeight:500}}>{value}</span></div>;
}
function WComment({c, athleteInitials, coachInitials, coachName}: {c:WComment;athleteInitials:string;coachInitials?:string;coachName?:string}) {
  const isCoach = c.author==='coach';
  return (
    <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
      <div className={`avatar avatar-sm${isCoach?' avatar-coach':''}`}>{isCoach?(coachInitials||STATIC_COACH.initials):athleteInitials}</div>
      <div style={{flex:1}}>
        <div style={{display:'flex',alignItems:'baseline',gap:8}}><span style={{fontSize:12.5,fontWeight:500,color:'var(--ink)'}}>{isCoach?(coachName||STATIC_COACH.name):'You'}</span><span className="mono" style={{fontSize:9.5,color:'var(--ink-mute)'}}>{c.at}</span>{c.pending&&<span className="pending-badge" style={{fontSize:8.5}}>Pending review</span>}</div>
        <p style={{margin:'4px 0 0',fontSize:13,color:'var(--ink)',lineHeight:1.5}}>{c.text}</p>
      </div>
    </div>
  );
}

// ─── WorkoutDetail modal ──────────────────────────────────────────────────────
function WorkoutDetail({workout, onClose, onAddComment, onAddVoiceMemo, onMarkComplete, athleteInitials, coachInitials, coachName}: {workout:WorkoutItem;onClose:()=>void;onAddComment:(t:string)=>void;onAddVoiceMemo:(len:number)=>void;onMarkComplete:()=>void;athleteInitials:string;coachInitials?:string;coachName?:string}) {
  const [newComment, setNewComment] = useState('');
  const [recording, setRecording] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const recRef = useRef<ReturnType<typeof setInterval>|null>(null);
  useEffect(()=>{ if(recording){recRef.current=setInterval(()=>setRecTime(t=>t+1),1000);}else{if(recRef.current)clearInterval(recRef.current);} return()=>{if(recRef.current)clearInterval(recRef.current);}; },[recording]);
  const isDone = workout.status==='met'||workout.status==='partial';
  const planned = workout.planned||{};
  const actual = workout.actual;
  const allComments = [...(workout.comments||[]),...(workout.voiceMemos||[]).map(m=>({id:m.id,author:'felipe',text:m.transcript||'(voice memo)',at:m.at||'',isMemo:true,pending:false}))];
  return (
    <div className="modal-backdrop" onClick={onClose} style={{animation:'fade 160ms ease'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--parchment)',width:'min(720px,92vw)',maxHeight:'90vh',overflow:'auto',borderRadius:4,border:'1px solid var(--rule)',animation:'slide-up 200ms ease'}}>
        <div style={{padding:'20px 28px',borderBottom:'1px solid var(--rule-soft)',display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:16}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8,flexWrap:'wrap'}}>
              <SportGlyph sport={workout.sport} size={28}/>
              <span className="eyebrow">{SPORT_LABEL[workout.sport]} · {fmtDate(workout.date,{weekday:'long',month:'short',day:'numeric'})}</span>
              <CompliancePill status={workout.status} value={workout.compliance}/>
            </div>
            <h2 className="display" style={{fontSize:26,margin:0,letterSpacing:'-0.02em'}}>{workout.title}</h2>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <div style={{padding:'24px 28px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0,marginBottom:24,border:'1px solid var(--rule-soft)',borderRadius:3,overflow:'hidden'}}>
            <div style={{padding:18,borderRight:'1px solid var(--rule-soft)',background:'var(--linen)'}}>
              <div className="eyebrow" style={{marginBottom:10}}>Planned</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {planned.duration&&<Field label="Duration" value={planned.duration}/>}
                {planned.distance&&<Field label="Distance" value={planned.distance}/>}
                {planned.tss&&<Field label="TSS" value={String(planned.tss)}/>}
              </div>
            </div>
            <div style={{padding:18,background:actual?'var(--olive-wash)':'var(--parchment)'}}>
              <div className="eyebrow eyebrow-olive" style={{marginBottom:10,color:actual?'var(--olive-deep)':'var(--ink-mute)'}}>Actual</div>
              {actual?(
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {actual.duration&&<Field label="Duration" value={actual.duration}/>}
                  {actual.distance&&<Field label="Distance" value={actual.distance}/>}
                  {actual.tss&&<Field label="TSS" value={String(actual.tss)}/>}
                  {actual.hr&&<Field label="Avg HR" value={`${actual.hr} bpm`}/>}
                  {actual.power&&<Field label="Avg Power" value={`${actual.power} W`}/>}
                </div>
              ):(
                <p style={{margin:0,fontSize:12,color:'var(--ink-mute)',fontFamily:'var(--mono)'}}>Awaiting completion — auto-syncs from Strava.</p>
              )}
            </div>
          </div>
          {workout.description&&<div style={{marginBottom:24}}><div className="eyebrow" style={{marginBottom:10}}>Workout</div><p style={{margin:0,fontSize:13.5,color:'var(--ink)',lineHeight:1.7,whiteSpace:'pre-line'}}>{workout.description}</p></div>}
          {workout.coachNote&&(
            <div style={{padding:18,background:'var(--terracotta-wash)',border:'1px solid var(--terracotta-soft)',borderLeft:'3px solid var(--terracotta-deep)',marginBottom:24,borderRadius:2}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}><div className="avatar avatar-coach avatar-sm">{coachInitials||STATIC_COACH.initials}</div><span className="eyebrow eyebrow-terracotta" style={{fontSize:9.5}}>{coachName||STATIC_COACH.name}</span></div>
              <p className="display" style={{margin:0,fontSize:16,lineHeight:1.5,color:'var(--ink)'}}>"{workout.coachNote}"</p>
            </div>
          )}
          <div style={{marginBottom:16}}>
            <div className="eyebrow" style={{marginBottom:10}}>Conversation</div>
            <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:14}}>
              {allComments.length===0?<p className="mono" style={{fontSize:11,color:'var(--ink-mute)',margin:0}}>No comments yet.</p>:allComments.map((c,i)=><WComment key={c.id||i} c={c as WComment} athleteInitials={athleteInitials} coachInitials={coachInitials} coachName={coachName}/>)}
            </div>
            {recording?(
              <div style={{display:'flex',alignItems:'center',gap:12,padding:14,background:'var(--terracotta-wash)',border:'1px solid var(--terracotta-soft)',borderRadius:3}}>
                <div className="rec-pulse" style={{width:12,height:12,borderRadius:999,background:'var(--terracotta-deep)'}}/>
                <span className="mono" style={{fontSize:13,color:'var(--terracotta-deep)'}}>Recording · {String(Math.floor(recTime/60)).padStart(2,'0')}:{String(recTime%60).padStart(2,'0')}</span>
                <div style={{flex:1}}/>
                <button className="btn btn-ghost" onClick={()=>{setRecording(false);setRecTime(0);}}>Discard</button>
                <button className="btn btn-primary" onClick={()=>{onAddVoiceMemo(recTime||8);setRecording(false);setRecTime(0);}}>Stop &amp; send</button>
              </div>
            ):(
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input className="input" placeholder="Add a comment for your coach…" value={newComment} onChange={e=>setNewComment(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&newComment.trim()){onAddComment(newComment.trim());setNewComment('');}}}/>
                <button className="btn btn-icon" onClick={()=>setRecording(true)} title="Voice memo" style={{color:'var(--terracotta-deep)',flexShrink:0}}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="6" y="2" width="4" height="8" rx="2"/><path d="M3 7v1a5 5 0 0 0 10 0V7M8 13v2" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>
                </button>
                <button className="btn btn-primary" onClick={()=>{if(newComment.trim()){onAddComment(newComment.trim());setNewComment('');}}} style={{flexShrink:0}}>Send</button>
              </div>
            )}
          </div>
          {!isDone&&(
            <div style={{marginTop:24,paddingTop:20,borderTop:'1px solid var(--rule-soft)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:14,flexWrap:'wrap'}}>
              <div><div className="display" style={{fontSize:14,color:'var(--ink)'}}>Finished this workout?</div><div className="mono" style={{fontSize:10.5,color:'var(--ink-mute)',marginTop:2}}>We'll pull data from Strava automatically.</div></div>
              <button className="btn btn-primary" onClick={onMarkComplete} style={{fontSize:13}}>✓ Mark complete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
