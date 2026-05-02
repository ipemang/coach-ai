import type { Metadata } from "next";
import "../dashboard/design-system.css";

export const metadata: Metadata = {
  title: "Andes.IA — Athlete",
};

export default function AthleteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
