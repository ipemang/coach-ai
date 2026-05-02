-- COA-62: Custom Access Token Hook — stamp coach_id into every JWT
-- After applying this migration, register the hook in:
--   Supabase Dashboard → Authentication → Hooks → Custom Access Token
--   → select public.custom_access_token_hook
-- Existing sessions need to sign out and back in to receive the new claims.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  claims jsonb;
  coach_row record;
BEGIN
  claims := event -> 'claims';

  SELECT id, organization_id
  INTO coach_row
  FROM public.coaches
  WHERE auth_user_id = (event ->> 'user_id')::uuid
  LIMIT 1;

  IF coach_row.id IS NOT NULL THEN
    claims := jsonb_set(claims, '{coach_id}',       to_jsonb(coach_row.id::text));
    claims := jsonb_set(claims, '{organization_id}', to_jsonb(coach_row.organization_id::text));
    claims := jsonb_set(claims, '{role}',            '"coach"');
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant execute to auth admin only — never to anon/authenticated
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
