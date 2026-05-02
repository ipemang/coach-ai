# Andes.IA — Session Orientation

**Read this file in full before starting any task in this project.**

---

## Project Context

Andes.IA is a B2B SaaS platform for endurance sports coaches (triathlon, running, cycling). The AI augments the coach's workflow — it never replaces the coach. The coach reviews and approves every AI-generated message before it reaches an athlete. Tagline: "Your athletes. Your voice. Your AI."

Founder: Felipe Deidan (Deloitte consultant, triathlete, mountaineer). Test coach: Felipe. Test athlete: Patrick (WhatsApp test account — not a team member).

The product is live on Railway (production). Active development happens in this repo (`~/coach-ai`). The workspace folder (`~/Documents/Claude/Projects/Andes.IA`) is where documents, specs, and deliverables are saved.

---

## File Map

| Path | What it is |
|------|------------|
| `~/coach-ai/backend/` | FastAPI backend (Python) |
| `~/coach-ai/backend/app/main.py` | App entrypoint, all routers registered here |
| `~/coach-ai/backend/app/api/` | All API route files |
| `~/coach-ai/backend/app/api/webhooks.py` | WhatsApp webhook handler + AI decision engine |
| `~/coach-ai/backend/app/api/dashboard.py` | Coach dashboard endpoints |
| `~/coach-ai/backend/app/api/onboard.py` | Coach onboarding flow |
| `~/coach-ai/backend/app/api/athlete_portal.py` | Athlete portal endpoints (COA-74) |
| `~/coach-ai/backend/app/api/workouts.py` | Workout plan endpoints |
| `~/coach-ai/backend/app/api/v1/` | API v1 routes (integrations, invites, payments, race day) |
| `~/coach-ai/backend/app/services/llm_client.py` | Provider-agnostic LLM client (reads LLM_PROVIDER env var) |
| `~/coach-ai/backend/app/services/suggestion_engine.py` | AI reasoning engine — COA-64/65 |
| `~/coach-ai/backend/app/models/checkinsend_log.py` | CheckinSendLog dataclass — used by checkin_scheduler + whatsapp_service |
| `~/coach-ai/backend/supabase/migrations/` | All DB migration SQL files — **production source of truth** |
| `~/coach-ai/backend/alembic/versions/` | Alembic migrations — **local dev only**, not used in production |
| `~/coach-ai/frontend/` | Next.js 14 frontend (App Router) |
| `~/coach-ai/frontend/app/` | Next.js app directory |
| `~/coach-ai/frontend/app/my-plan/` | Athlete portal route (COA-74) |
| `~/coach-ai/frontend/app/dashboard/` | Coach dashboard routes |
| `~/coach-ai/frontend/app/login/` | Coach login |
| `~/coach-ai/frontend/app/signup/` | Coach signup (email + Google OAuth) |
| `~/coach-ai/frontend/app/auth/forgot-password/` | Password reset request |
| `~/coach-ai/frontend/app/auth/reset-password/` | Password reset completion |
| `~/coach-ai/frontend/components/` | Shared React components |
| `~/coach-ai/frontend/components/suggestion-queue.tsx` | Live suggestion queue (COA-65) |
| `~/coach-ai/frontend/components/suggestion-review-modal.tsx` | Review modal (COA-65) |
| `~/coach-ai/frontend/app/lib/types.ts` | Shared TypeScript interfaces |
| `~/coach-ai/SUPABASE_RLS.md` | Row-Level Security policy documentation (COA-62) |
| `~/Documents/Claude/Projects/Andes.IA/CLAUDE.md` | Mirror of this file — kept as project workspace reference |
| `~/Documents/Claude/Projects/Andes.IA/` | Business docs, retros, skills — non-code project workspace |

---

## Active Priorities (as of April 2026)

**Felipe owns all work — full stack. Patrick (Pedrick) is no longer on the project (removed 2026-04-22).**

### ✅ Shipped (all code committed, deployed to Railway production)
- COA-65 — Suggestion review UI
- COA-74 — Athlete portal (/my-plan, token-based, old flow)
- COA-62 — Auth pages + JWT hook + RLS
- COA-88 — Edit plan modal
- COA-89 — Athlete soft-delete
- COA-90 — Document reingest
- COA-91 — Webhook latency
- COA-92 — Usage logging
- COA-75 — Resend plan link button (`resend-plan-button.tsx`)
- COA-78 — Add athlete from dashboard (InviteModal in DashboardShell → send-invite API)
- COA-76 — Athlete detail page redesign (`/dashboard/athletes/[id]` + mosaic components)
- COA-77 — Workout editor redesign (`/dashboard/workouts` mosaic)
- COA-93 — Athlete auth infrastructure (Supabase accounts, invite tokens, JWT claims, RLS)
- COA-94 — Athlete onboarding API (5-step endpoints + AI profile generation)
- COA-95 — Athlete file storage (upload/list/delete + coach visibility)
- COA-96 — Athlete join flow (`/athlete/join` mosaic, invite validation, Supabase signUp)
- COA-97 — Athlete onboarding flow (`/athlete/onboarding` 5-step mosaic UI + AI profile reveal)
- COA-98 — Athlete dashboard (`/athlete/dashboard` mosaic, plan + files tabs)
- COA-99 — Public landing page (`/` mosaic, coach + athlete paths)
- COA-100 — Coach auth completion (/auth/callback, middleware JWT routing, email invites)

### 🔴 Next: End-to-End Production Testing
The entire athlete auth + onboarding flow has never been tested in Railway production.
Test checklist: `~/Documents/Claude/Projects/Andes.IA/production-test-athlete-auth.md`
Tests A–K must pass before the flow is considered live.

### Known gaps (not yet ticketed)
- **`/my-plan` page** still uses old dark theme — backward-compat page (30-day window), low priority
- **Athlete routes middleware protection** — ✅ Fixed 2026-04-23 (middleware now routes athletes correctly and protects `/athlete/dashboard` + `/athlete/onboarding`)

### Deferred
- COA-73 — Video analysis (V1.1, post-validation)

---

## Tech Stack (Do Not Change Without Reason)

- **Backend:** FastAPI (Python), deployed on Railway
- **Frontend:** Next.js 14 App Router, deployed on Railway
- **Database:** Supabase (PostgreSQL + real-time subscriptions)
- **AI:** OpenAI GPT-4o-mini via `LLMClient` (provider-agnostic — LLM_PROVIDER env var)
- **Messaging:** Meta WhatsApp Cloud API
- **Auth (coach):** Supabase JWT with custom claims (coach_id, organization_id) — RLS activates once COA-62 ships JWT claims
- **Auth (athlete):** Supabase JWT with `role="athlete"` claims (COA-93) — migrating from token-based. Old `athlete_connect_tokens` table kept for 30-day backward compatibility with `/my-plan?token=...`
- **Architecture:** Poke dual-layer — ClassifierAgent → ReasoningAgent → InteractionAgent

### Migration Systems
- **Supabase SQL** (`backend/supabase/migrations/`) — production source of truth. Always use these for schema changes.
- **Alembic** (`backend/alembic/versions/`) — local dev only (SQLite). Do not run Alembic in production.

---

## Quality Gate Rules (for output-quality-gate skill)

These project-specific rules extend the universal 8-check gate:

- Never claim a feature is "live" unless it has been tested end-to-end in Railway production
- Competitor names must be spelled correctly: TrainingPeaks (one word), TriDot (capital D), Maxiom
- Pricing is: Starter $49/mo, Growth $99/mo, Pro $149/mo, LatAm $19–$35/mo — verify before publishing
- All outbound documents (vision docs, decks, proposals) must pass the quality gate before delivery
- The phrase "AI replaces coaches" must never appear — correct framing is "AI augments coaches"

---

## Crash-Resilient Pipeline

Any task with 3+ sequential stages must checkpoint to persistent storage. Checkpoint location: `~/Documents/Claude/Projects/Andes.IA/checkpoints/[pipeline-name]/`. Never write checkpoints to `/tmp`.

Before starting any multi-stage task (research → draft → review → format → deliver), check for an existing checkpoint manifest at that path first. If found and valid, resume from the last completed stage. Report to the user which stage is being resumed from.

---

## Retro Log

Retros are filed at `~/Documents/Claude/Projects/Andes.IA/retros/retros.md`. Each retro is numbered sequentially. File the retro BEFORE applying the fix. Hard Rules promoted from retros are added to this file (global) or to the relevant skill (skill-specific).

**Filed retros so far:** None yet. Hard Rules 11–12 added via direct session (no retro trigger — new rules, not a repeated error).

---

## Hard Rules

1. **Read this file in full before starting any task.** Do not skip this even for quick tasks.
2. **Never overwrite a file without reading its current contents first.** Use Read before Edit or Write.
3. **Never hardcode LLM provider or model.** Always use `LLMClient` which reads `LLM_PROVIDER` and `LLM_MODEL` from env vars. (Root cause: webhooks.py was hardcoded to Groq — test athlete couldn't receive replies for days.)
4. **Never run `npm run build` from `~/coach-ai` root.** Frontend builds must run from `~/coach-ai/frontend/`. (Root cause: monorepo — `package.json` lives in `frontend/`.)
5. **Phone number matching must handle variants.** The system uses `_phone_variants()` to normalize numbers. Never assume a bare number matches — check with variants. (Root cause: test athlete record had `web:...` as the phone number, not the real number.)
6. **Coach WhatsApp number in the DB must match the real number.** The `coaches` table `whatsapp_number` field is how the webhook identifies incoming messages as coach messages. (Root cause: coaches table had the business inbox number instead of Felipe's real number.)
7. **All AI pipeline routes must use `run_in_threadpool` for sync LLMClient calls.** FastAPI routes are async; calling a sync client directly blocks the event loop.
8. **Run the output quality gate before delivering any outbound content.** Emails, documents, proposals, vision docs — all of it. Even quick ones.
9. **File a retro before patching any repeated error.** "I'll remember next time" is not a fix.
10. **Any workflow with 3+ sequential stages must checkpoint to persistent disk.** No exceptions.
11. **Every new Linear ticket must be assigned one of the 8 category labels before work begins.** Labels: Dashboard — Coach, Dashboard — Athlete, Coach Onboarding, Athlete Onboarding, Growth & Web, Backend & Infra, AI Pipeline, LatAm. A ticket without a category label is not ready for work.
12. **Always create a Linear ticket before performing a task, and close the ticket once the task is finished.** No work should happen without a ticket. No ticket should be left open after the work is done.

---

## Ambiguity Protocol

| Situation | Response |
|-----------|----------|
| High-stakes architectural or product decision | Ask Felipe before proceeding |
| Code style, formatting, naming | Use existing file conventions as the reference |
| Missing context about a ticket | Check Linear before asking |
| Factual uncertainty about a product claim | Flag it — never assume |
| LLM provider / model choice | Use whatever LLM_PROVIDER env var says; if unset, use openai/gpt-4o-mini |

---

## Personas in This Project

- **Aria** — Senior full-stack AI engineer and solutions architect. Active in all technical sessions. Loaded via the `coachai-aria-persona` skill. Always signs off responses with "— Aria".
- **Felipe** — Founder. Non-technical. Explain every architectural decision in plain English alongside the spec. No jargon without definition. Owns all work — backend and frontend — as of 2026-04-22.
- **Patrick** — Test athlete (WhatsApp test account only). His experience with the athlete portal is the primary QA signal for the athlete-facing product. Not a team member.

## Work Division

Felipe owns everything. There is no separate frontend developer. Build backend and frontend equally. Do not defer or skip any ticket because it is "frontend work."
