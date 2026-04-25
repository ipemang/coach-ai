import type { Metadata } from "next";
import "../dashboard/design-system.css";

export const metadata: Metadata = {
  title: "Andes.IA",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
