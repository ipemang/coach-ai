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

export interface Workout {
  id: string;
  athlete_id: string;
  coach_id: string | null;
  scheduled_date: string;
  session_type: string;
  title: string | null;
  duration_min: number | null;
  distance_km: number | null;
  hr_zone: string | null;
  target_pace: string | null;
  coaching_notes: string | null;
  status: "prescribed" | "completed" | "missed" | "pending" | string;
  completed_at: string | null;
  source: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CheckIn {
  id: string;
  athlete_id: string;
  coach_id: string | null;
  phone_number: string | null;
  message_text: string | null;
  message_type: "text" | "voice" | string;
  suggestion_id: string | null;
  processed: boolean;
  created_at: string;
}

export interface AthleteDetail extends Athlete {
  suggestions: Suggestion[];
  workouts: Workout[];
  checkins: CheckIn[];
}
