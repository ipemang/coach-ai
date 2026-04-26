-- COA-100: Fix handle_new_coach_auth_user trigger to skip creating a coach row
-- when the signing-up user is an athlete (identified by a pending invite token
-- for their email address). Previously every new Supabase auth user got a coach
-- row, causing the JWT hook to return role="coach" for athletes.

CREATE OR REPLACE FUNCTION public.handle_new_coach_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_full_name  text;
  v_org_id     text;
  v_is_athlete boolean;
BEGIN
  -- If there is a valid (unused, unexpired) athlete invite for this email,
  -- this user is an athlete signing up — do NOT create a coach row.
  SELECT EXISTS(
    SELECT 1 FROM public.athlete_invite_tokens
    WHERE email = NEW.email
      AND used_at IS NULL
      AND expires_at > now()
  ) INTO v_is_athlete;

  IF v_is_athlete THEN
    RETURN NEW;
  END IF;

  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );
  -- Use the auth user's UUID as a unique org_id for new coaches (can be updated later)
  v_org_id := NEW.id::text;

  INSERT INTO public.coaches (
    full_name, email, auth_user_id, organization_id,
    methodology_playbook, persona_system_prompt, ai_autonomy_override
  )
  VALUES (
    v_full_name, NEW.email, NEW.id, v_org_id,
    '{}', 'You are a helpful, knowledgeable endurance sports coach assistant.', false
  )
  ON CONFLICT (email) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id
    WHERE public.coaches.auth_user_id IS NULL;

  RETURN NEW;
END;
$function$;
