export interface CurrentState {
  training_phase?: string;
  training_week?: number;
  last_readiness_score?: number;
  last_hrv?: number;
  last_sleep_score?: number;
  oura_readiness_score?: number;
  oura_avg_hrv?: number;
  oura_sleep_score?: number;
  oura_sync_date?: string;
  soreness?: string;
  coach_notes?: string;
  missed_workouts_this_week?: number;
  strava_last_activity_type?: string;
  strava_last_activity_date?: string;
  strava_last_distance_km?: number;
  predictive_flags?: PredictiveFlag[];
}

export interface PredictiveFlag {
  code: string;
  label: string;
  priority: "high" | "medium" | "low";
  reason?: string;
}

export interface StableProfile {
  target_race?: string;
  race_date?: string;
  max_weekly_hours?: number;
  injury_history?: string;
  notes?: string;
}

export interface Athlete {
  id: string;
  full_name: string;
  phone_number: string | null;
  organization_id: string | null;
  coach_id: string;
  stable_profile: StableProfile;
  current_state: CurrentState;
  created_at: string;
  pending_suggestions?: number;
  total_checkins?: number;
  last_checkin_at?: string | null;
}

export interface Suggestion {
  id: string;
  athlete_id: string | null;
  athlete_display_name: string | null;
  suggestion_text: string | null;
  status: "pending" | "approved" | "ignored" | "sent";
  coach_reply: string | null;
  created_at: string;
  updated_at: string;
  athlete_message?: string | null;
}

export interface Coach {
  id: string;
  full_name: string;
  email: string | null;
  whatsapp_number: string | null;
  organization_id: string | null;
}
