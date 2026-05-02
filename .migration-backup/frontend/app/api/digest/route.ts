/**
 * COA-102: Daily digest — read cached value from Supabase.
 *
 * Reads coaches.daily_digest directly using the service role key.
 * No LLM call here — generation happens via POST /api/digest/generate.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const COACH_ID = process.env.COACH_ID!;

export async function GET() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from("coaches")
    .select("id, daily_digest")
    .eq("id", COACH_ID)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Coach not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    coach_id: data.id,
    digest: data.daily_digest ?? null,
  });
}
