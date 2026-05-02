import { useEffect } from "react";
import { Switch, Route } from "wouter";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import AthleteDetailPage from "./pages/AthleteDetailPage";
import AthleteDashboardPage from "./pages/AthleteDashboardPage";
import AthleteOnboardingPage from "./pages/AthleteOnboardingPage";
import OnboardingPage from "./pages/OnboardingPage";
import NotFoundPage from "./pages/NotFoundPage";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { createBrowserSupabase } from "./lib/supabase";
import { storeLoginRedirect } from "./lib/api";

const PROTECTED_PATHS = ["/dashboard", "/athlete/dashboard", "/onboarding"];

function SessionGuard() {
  useEffect(() => {
    const supabase = createBrowserSupabase();
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === "SIGNED_OUT") {
        const path = window.location.pathname;
        const isProtected = PROTECTED_PATHS.some(p => path.startsWith(p));
        if (isProtected) {
          storeLoginRedirect();
          window.location.href = "/login?expired=1";
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  return null;
}

export default function App() {
  return (
    <>
      <SessionGuard />
      <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/auth/callback" component={AuthCallbackPage} />
      <Route path="/auth/forgot-password" component={ForgotPasswordPage} />
      <Route path="/auth/reset-password" component={ResetPasswordPage} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/dashboard/athletes/:id" component={AthleteDetailPage} />
      <Route path="/athlete/dashboard" component={AthleteDashboardPage} />
      <Route path="/athlete/onboarding" component={AthleteOnboardingPage} />
      <Route component={NotFoundPage} />
      </Switch>
    </>
  );
}
