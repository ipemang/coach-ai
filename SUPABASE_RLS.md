# Supabase RLS (Row Level Security) — Andes.IA

**Last updated:** 2026-04-16  
**Supabase project:** `qnvajgifeolwwcyjostm`  
**Migration:** `coa_68_rls_policies_core_tables`

---

## What is RLS?

Row Level Security is a PostgreSQL feature that controls which rows a database user can see or modify. When RLS is enabled on a table, every query is filtered by a policy — even if you query `SELECT * FROM athletes`, you'll only get back the rows you're allowed to see.

Supabase uses two key roles:
- **`service_role`** — the backend's admin key. Always bypasses RLS. Used exclusively server-side in the FastAPI backend. Never exposed to the browser.
- **`authenticated`** — the role for logged-in users (coaches/athletes with a valid JWT). Gated by the policies below.
- **`anon`** — unauthenticated requests. No policies grant `anon` access to any table. This is intentional.

---

## Current Policy Strategy

**Phase:** Pre-auth (COA-62 not yet built)

The backend currently uses the `service_role` key for all DB operations, which bypasses RLS entirely. The RLS policies defined here are **forward-looking** — they will gate real-time subscriptions and direct authenticated queries once COA-62 (coach auth with Google/Apple/email) ships.

The policies use a JWT claim pattern:
```sql
USING (coach_id = (auth.jwt() ->> 'coach_id')::uuid)
```

This means: when COA-62 issues JWTs, they must include a `coach_id` claim in the payload. The backend is responsible for embedding this claim at token issuance time.

**TODO when COA-62 lands:** Evaluate whether to switch `coach_id = auth.uid()` (if each coach has a Supabase auth user) or keep the custom claim pattern (if we manage auth separately). The custom claim pattern is safer for multi-org setups.

---

## Table-by-Table Policy Summary

### Tables with full RLS (service_role + authenticated policies)

| Table | Authenticated Policy | Scope |
|-------|---------------------|-------|
| `suggestions` | SELECT, UPDATE | `coach_id` claim |
| `athlete_checkins` | SELECT, INSERT | `coach_id` claim |
| `workouts` | ALL | `coach_id` claim |
| `athletes` | ALL | `coach_id` claim |
| `coaches` | ALL | `id = coach_id` claim |
| `athlete_groups` | ALL | `coach_id` claim |
| `memory_states` | SELECT | `organization_id` claim |
| `oura_tokens` | ALL | `athlete_id` claim |
| `strava_tokens` | ALL | `athlete_id` claim |
| `coach_decisions` | ALL | `coach_id` claim |
| `athlete_documents` | ALL | `coach_id` claim |
| `athlete_health_records` | ALL | `coach_id` claim |
| `plan_modifications` | ALL | `coach_id` claim |
| `group_broadcasts` | SELECT | via `athlete_groups` subquery |
| `checkin_send_logs` | SELECT | via `athletes` subquery |

### Tables with service_role only (no authenticated policy)

| Table | Reason |
|-------|--------|
| `athlete_connect_tokens` | Pre-auth onboarding tokens — no user is logged in when these are used |
| `onboarding_sessions` | Pre-auth — athlete hasn't created an account yet |
| `athlete_encryption_keys` | Encryption keys must NEVER be accessible from the frontend, even to authenticated users |
| `health_record_access_log` | Append-only audit log — the backend writes these, coaches can only read summaries via the dashboard API |

---

## Real-Time Subscriptions

The real-time dashboard (`/dashboard`) subscribes to two tables via the Supabase anon key:
- `suggestions` — to show incoming AI suggestions in real time
- `athlete_checkins` — to show athlete check-in data as it arrives

**Before COA-68 (broken state):** RLS was enabled with zero policies. The anon key — and any authenticated key — received zero rows. Subscriptions silently returned empty results.

**After COA-68 (current state):** Policies exist. Real-time will work correctly once JWTs include the `coach_id` claim. Until COA-62 ships, the dashboard continues to use the service role key via the backend API (not direct Supabase subscriptions from the browser).

**To enable real-time in the frontend after COA-62:**
```typescript
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
// JWT must include: { coach_id: "uuid", organization_id: "org-1" }

supabase
  .channel('suggestions')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'suggestions',
    // RLS handles the filter — no need to filter by coach_id here
  }, (payload) => { /* handle */ })
  .subscribe()
```

---

## COA-67 New Tables — RLS Status

All 6 tables created in COA-67 have RLS enabled from creation:

| Table | Policies |
|-------|---------|
| `coach_decisions` | service_role (ALL), authenticated (ALL via `coach_id`) |
| `athlete_documents` | service_role (ALL), authenticated (ALL via `coach_id`) |
| `athlete_health_records` | service_role (ALL), authenticated (ALL via `coach_id`) |
| `athlete_encryption_keys` | service_role (ALL) only — **no frontend access ever** |
| `health_record_access_log` | service_role (ALL), authenticated (SELECT via `coach_id`) |
| `plan_modifications` | service_role (ALL), authenticated (ALL via `coach_id`) |

---

## Security Notes

### Encryption keys are doubly protected
`athlete_encryption_keys` has no `authenticated` policy. Even a valid coach JWT cannot read this table from the browser. The only path to a decryption key is through the FastAPI backend (service role), which enforces access logging before returning any decrypted data.

### Health records require two-layer protection
1. **RLS** — blocks unauthorized DB access at the row level
2. **Field-level AES-256-GCM encryption** — the `encrypted_payload` column is ciphertext. Even if an attacker bypasses RLS (e.g. a misconfigured policy), the health data is still encrypted and useless without the per-athlete key + master key.

### The `anon` role has no access anywhere
No table has a policy granting `anon` access. All unauthenticated requests to the Supabase REST/realtime API will receive empty results or 401s.

---

## Checklist for COA-62 (Coach Auth)

When building coach authentication, ensure the JWT payload includes:

```json
{
  "sub": "<supabase-auth-user-id>",
  "coach_id": "<uuid from coaches.id>",
  "organization_id": "<string from coaches.organization_id>",
  "role": "authenticated"
}
```

This can be set via a Supabase Database Function triggered on login, or via the `app_metadata` hook in Supabase Auth settings.

After COA-62 ships, audit these policies for tightening:
- [ ] `athletes_coach_all` — consider also allowing athletes to read their own row
- [ ] `athlete_checkins_insert` — tighten `WITH CHECK` to require matching `athlete_id` claim
- [ ] `memory_states_org_select` — add `coach_id` column to `memory_states` and switch to coach-scoped policy
- [ ] `suggestions_coach_select` — consider SELECT-only for the frontend; all writes go through the backend API
