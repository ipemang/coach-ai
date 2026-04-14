-- Migration: Create athlete_checkins table for storing incoming athlete WhatsApp messages
-- This table stores all athlete check-ins before they're processed into suggestions for coaches

create table if not exists public.athlete_checkins (
  id uuid primary key default gen_random_uuid(),
  athlete_id text not null,
  coach_id text not null,
  phone_number text not null,
  message_text text,
  message_type text not null default 'text', -- 'text', 'audio', 'voice'
  audio_url text null,
  audio_transcript text null,
  whatsapp_message_id text null,
  processed boolean not null default false,
  processed_at timestamptz null,
  suggestion_id uuid null, -- FK to suggestions table after processing
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint athlete_checkins_message_type_check check (message_type in ('text', 'audio', 'voice'))
);

-- Index for finding unprocessed checkins by athlete
create index if not exists athlete_checkins_athlete_id_processed_idx
  on public.athlete_checkins (athlete_id, processed, created_at desc);

-- Index for finding checkins by coach
create index if not exists athlete_checkins_coach_id_created_at_idx
  on public.athlete_checkins (coach_id, created_at desc);

-- Index for WhatsApp message ID lookups (deduplication)
create index if not exists athlete_checkins_whatsapp_message_id_idx
  on public.athlete_checkins (whatsapp_message_id) where whatsapp_message_id is not null;
