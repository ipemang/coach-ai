-- COA-93: Extend JWT custom access token hook to stamp athlete_id into athlete JWTs
-- Replaces the COA-62 version — adds athlete check after the existing coach check.
-- After applying: Supabase Dashboard → Authentication → Hooks → Custom Access Token
-- (hook is already registered — this just replaces the function body)

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  claims      jsonb;
  coach_row   record;
  athlete_row record;
BEGIN
  claims := event -> 'claims';

  -- ── Coach check (COA-62 original) ─────────────────────────────────────────
  SELECT id, organization_id
  INTO coach_row
  FROM public.coaches
  WHERE auth_user_id = (event ->> 'user_id')::uuid
  LIMIT 1;

  IF coach_row.id IS NOT NULL THEN
    claims := jsonb_set(claims, '{coach_id}',        to_jsonb(coach_row.id::text));
    claims := jsonb_set(claims, '{organization_id}', to_jsonb(coach_row.organization_id::text));
    claims := jsonb_set(claims, '{role}',            '"coach"');
    RETURN jsonb_set(event, '{claims}', claims);
  END IF;

  -- ── Athlete check (COA-93 new) ────────────────────────────────────────────
  SELECT id, coach_id
  INTO athlete_row
  FROM public.athletes
  WHERE auth_user_id = (event ->> 'user_id')::uuid
    AND archived_at IS NULL
  LIMIT 1;

  IF athlete_row.id IS NOT NULL THEN
    claims := jsonb_set(claims, '{athlete_id}', to_jsonb(athlete_row.id::text));
    claims := jsonb_set(claims, '{coach_id}',   to_jsonb(athlete_row.coach_id::text));
    claims := jsonb_set(claims, '{role}',       '"athlete"');
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Permissions unchanged from COA-62
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
