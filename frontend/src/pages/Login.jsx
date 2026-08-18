import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Landmark, Loader2 } from "lucide-react";

const HERO = "https://images.pexels.com/photos/8112186/pexels-photo-8112186.jpeg";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invalid credentials");
    } finally {
      setBusy(false);
    }
  };

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="flex items-center gap-2 mb-8">
            <div className="h-9 w-9 rounded-md bg-brand flex items-center justify-center">
              <Landmark className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-heading font-bold text-brand-dark">BankEzee<span className="text-brand"> CRM</span></span>
          </div>
          <h1 className="text-3xl font-heading font-bold text-brand-dark tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-2 mb-8">Sign in to manage your leads & growth partners.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email</label>
              <input data-testid="login-email-input" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-colors bg-white"
                placeholder="you@example.com" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Password</label>
              <input data-testid="login-password-input" type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-colors bg-white"
                placeholder="••••••••" />
            </div>
            <button data-testid="login-submit-btn" type="submit" disabled={busy}
              className="w-full bg-brand text-white hover:bg-brand/90 rounded-md px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign In
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">OR</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button data-testid="google-login-btn" onClick={googleLogin}
            className="w-full border border-slate-300 hover:bg-slate-50 rounded-md px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2">
            <img src="https://www.google.com/favicon.ico" alt="" className="h-4 w-4" /> Continue with Google
          </button>

          <p className="text-sm text-slate-500 mt-6 text-center">
            New growth partner or processor?{" "}
            <Link data-testid="go-register-link" to="/register" className="text-brand font-medium hover:underline">Register here</Link>
          </p>
        </div>
      </div>
      <div className="hidden lg:block relative bg-brand-dark">
        <img src={HERO} alt="Partnership" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/70 to-brand-dark/30" />
        <div className="relative h-full flex flex-col justify-end p-12 text-white">
          <h2 className="text-3xl font-heading font-bold leading-tight">Grow your loan portfolio<br />with smarter lead management.</h2>
          <p className="text-white/70 mt-3 text-sm max-w-md">Auto-imported leads, real-time assignment to growth partners, and a full conversion pipeline — all in one place.</p>
        </div>
      </div>
    </div>
  );
}
