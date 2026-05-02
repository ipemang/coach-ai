# Andes.IA — Coach Dashboard

## Overview

B2B SaaS for endurance sports coaches. Ported from Vercel/Next.js to a Replit pnpm monorepo as a React+Vite artifact. Two user types: **coaches** and **athletes**.

## Architecture

- **Frontend**: `artifacts/andes-ia` — React + Vite, previewPath `/`
- **Backend**: Python FastAPI on Railway (`https://coach-ai-production-a5aa.up.railway.app`)
- **Auth**: Supabase (email/password + OAuth), `@supabase/ssr`
- **Routing**: Wouter v3 (Switch/Route pattern, no base prop — BASE_URL handled by Vite config)
- **Styling**: Custom design system in `src/index.css` — oklch color palette (parchment, aegean, terracotta, ochre, olive), `ca-*` CSS class prefix

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9

## Env Vars Needed

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key
- `VITE_BACKEND_URL` — Railway backend URL (has hardcoded fallback)

## Key Pages / Routes

| Route | Component | Who sees it |
|---|---|---|
| `/` | LandingPage | Public |
| `/login` | LoginPage | Public |
| `/signup` | SignupPage | Public |
| `/auth/callback` | AuthCallbackPage | Supabase OAuth redirect |
| `/auth/forgot-password` | ForgotPasswordPage | Public |
| `/auth/reset-password` | ResetPasswordPage | Public |
| `/onboarding` | OnboardingPage | New coaches |
| `/dashboard` | DashboardPage | Coaches |
| `/dashboard/athletes/:id` | AthleteDetailPage | Coaches |
| `/athlete/dashboard` | AthleteDashboardPage | Athletes |
| `/athlete/onboarding` | AthleteOnboardingPage | New athletes |

## Key Files

- `src/App.tsx` — Wouter Switch routing
- `src/lib/supabase.ts` — Supabase browser client (lazy, no crash when env vars missing)
- `src/lib/api.ts` — API helpers, `BACKEND` constant, `getAuthToken()`
- `src/lib/types.ts` — Shared TypeScript interfaces
- `src/index.css` — Full design system (CSS custom props + `ca-*` utility classes)

## Key Commands

- `pnpm --filter @workspace/andes-ia run dev` — start frontend dev server
- `pnpm --filter @workspace/andes-ia run typecheck` — typecheck frontend

## Source Backup

Original Next.js 14 App Router source is at `.migration-backup/frontend/`.
