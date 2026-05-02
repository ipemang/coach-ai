import { Suspense } from "react";
import { AthletePlanClient } from "./client";

export default function MyPlanPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0c12] flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Loading your plan…</div>
      </div>
    }>
      <AthletePlanClient />
    </Suspense>
  );
}
