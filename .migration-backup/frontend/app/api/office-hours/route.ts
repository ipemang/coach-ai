import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// L3: COACH_ID is required — if unset, Supabase queries receive undefined and
// behave unpredictably (may return all rows or no rows).
const COACH_ID = process.env.COACH_ID ?? "";

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

const DAY_MAP = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// COA-123: scheduleEnabled=false means coach is always online (never autonomous via schedule)
function isCurrentlyAutonomous(
  officeHours: Record<string, unknown> | null,
  override: boolean,
  scheduleEnabled: boolean
): boolean {
  if (override) return true;
  if (!scheduleEnabled) return false; // schedule toggled off → always online
  if (!officeHours) return false;

  const tz = (officeHours.timezone as string) || "UTC";
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: tz })
  );
  const dayKey = DAY_MAP[now.getDay() === 0 ? 6 : now.getDay() - 1]; // getDay() is Sun=0
  const hours = officeHours[dayKey] as string[] | undefined;

  if (!hours || hours.length < 2) return true; // Day not configured

  const [sh, sm] = hours[0].split(":").map(Number);
  const [eh, em] = hours[1].split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return !(startMin <= nowMin && nowMin < endMin);
}

export async function GET() {
  if (!COACH_ID) {
    return NextResponse.json({ error: "COACH_ID env var is not configured" }, { status: 503 });
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("coaches")
    .select("id, office_hours, ai_autonomy_override, office_hours_enabled")
    .eq("id", COACH_ID)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Coach not found" }, { status: 404 });
  }

  const scheduleEnabled = !!data.office_hours_enabled;
  const autonomous = isCurrentlyAutonomous(
    data.office_hours as Record<string, unknown> | null,
    !!data.ai_autonomy_override,
    scheduleEnabled
  );

  return NextResponse.json({
    coach_id: data.id,
    office_hours: data.office_hours,
    ai_autonomy_override: !!data.ai_autonomy_override,
    office_hours_enabled: scheduleEnabled,
    is_currently_autonomous: autonomous,
  });
}

export async function PATCH(req: NextRequest) {
  if (!COACH_ID) {
    return NextResponse.json({ error: "COACH_ID env var is not configured" }, { status: 503 });
  }
  const supabase = getSupabase();
  const body = await req.json().catch(() => ({}));

  const { ai_autonomy_override, office_hours_enabled, timezone, ...days } = body;

  // Build office_hours JSONB
  const officeHours: Record<string, unknown> = { timezone: timezone || "America/New_York" };
  for (const day of DAY_MAP) {
    if (days[day] !== undefined) {
      officeHours[day] = days[day];
    }
  }

  const { error } = await supabase
    .from("coaches")
    .update({
      office_hours: officeHours,
      ai_autonomy_override: !!ai_autonomy_override,
      office_hours_enabled: !!office_hours_enabled, // COA-123
    })
    .eq("id", COACH_ID);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "updated" });
}
