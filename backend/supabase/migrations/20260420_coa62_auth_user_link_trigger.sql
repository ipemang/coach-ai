-- COA-62: Auto-link Supabase auth users to coaches rows on signup.
--
-- When a coach signs up (email/password or Google OAuth), Supabase creates a
-- row in auth.users. This trigger fires after that insert and either:
--   a) Updates an existing coaches row with matching email to set auth_user_id, OR
--   b) Creates a new minimal coaches row so the JWT hook can resolve coach_id.
--
-- The JWT hook (custom_access_token_hook) already exists and injects coach_id +
-- organization_id into the token. It needs coaches.auth_user_id = auth.users.id
-- to work. This trigger ensures that link is established automatically.

-- Add unique constraint on coaches.email so we can upsert safely
ALTER TABLE public.coaches ADD CONSTRAINT coaches_email_unique UNIQUE (email);

-- Trigger function: runs SECURITY DEFINER so it can write to coaches
CREATE OR REPLACE FUNCTION public.handle_new_coach_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_full_name text;
  v_org_id    text;
BEGIN
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );
  -- Use the auth user's UUID as a unique org_id for new coaches (can be updated later)
  v_org_id := NEW.id::text;

  INSERT INTO public.coaches (
    full_name,
    email,
    auth_user_id,
    organization_id,
    methodology_playbook,
    persona_system_prompt,
    ai_autonomy_override
  )
  VALUES (
    v_full_name,
    NEW.email,
    NEW.id,
    v_org_id,
    '{}',
    'You are a helpful, knowledgeable endurance sports coach assistant.',
    false
  )
  ON CONFLICT (email) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id
    WHERE public.coaches.auth_user_id IS NULL;

  RETURN NEW;
END;
$$;

-- Fire after every new auth.users row
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_coach_auth_user();

-- Grant supabase_auth_admin (used internally by Supabase auth) permission to call the function
GRANT EXECUTE ON FUNCTION public.handle_new_coach_auth_user() TO supabase_auth_admin;
