import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const athleteId = searchParams.get("athlete_id");
  const weekStart = searchParams.get("week_start");
  const weekEnd = searchParams.get("week_end");

  if (!athleteId || !weekStart || !weekEnd) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("workouts")
    .select("*")
    .eq("athlete_id", athleteId)
    .gte("scheduled_date", weekStart)
    .lte("scheduled_date", weekEnd)
    .order("scheduled_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workouts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { athlete_id, coach_id, scheduled_date, session_type, title,
          distance_km, duration_min, hr_zone, target_pace, coaching_notes } = body;

  if (!athlete_id || !scheduled_date) {
    return NextResponse.json({ error: "athlete_id and scheduled_date required" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    athlete_id,
    scheduled_date,
    session_type: session_type || "run",
    status: "prescribed",
    source: "dashboard",
  };
  if (coach_id) payload.coach_id = coach_id;
  if (title?.trim()) payload.title = title.trim();
  if (distance_km) payload.distance_km = parseFloat(distance_km);
  if (duration_min) payload.duration_min = parseInt(duration_min);
  if (hr_zone?.trim()) payload.hr_zone = hr_zone.trim();
  if (target_pace?.trim()) payload.target_pace = target_pace.trim();
  if (coaching_notes?.trim()) payload.coaching_notes = coaching_notes.trim();

  const supabase = adminClient();
  const { data, error } = await supabase.from("workouts").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workout: data }, { status: 201 });
}
