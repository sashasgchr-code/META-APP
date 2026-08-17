import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Landmark, Loader2 } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);

  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register(form);
      toast.success("Account created. Welcome to BankEzee!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md animate-fade-up">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-9 w-9 rounded-md bg-brand flex items-center justify-center">
            <Landmark className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-heading font-bold text-brand-dark">BankEzee<span className="text-brand"> CRM</span></span>
        </div>
        <h1 className="text-3xl font-heading font-bold text-brand-dark tracking-tight">Become a Growth Partner</h1>
        <p className="text-sm text-muted-foreground mt-2 mb-8">Generate leads, track conversions, and earn commissions.</p>

        <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Full Name</label>
            <input data-testid="register-name-input" required value={form.name} onChange={upd("name")}
              className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-colors" placeholder="Jane Doe" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email</label>
            <input data-testid="register-email-input" type="email" required value={form.email} onChange={upd("email")}
              className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-colors" placeholder="you@example.com" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phone</label>
            <input data-testid="register-phone-input" value={form.phone} onChange={upd("phone")}
              className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-colors" placeholder="+91 90000 00000" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Password</label>
            <input data-testid="register-password-input" type="password" required minLength={6} value={form.password} onChange={upd("password")}
              className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-colors" placeholder="Min 6 characters" />
          </div>
          <button data-testid="register-submit-btn" type="submit" disabled={busy}
            className="w-full bg-brand text-white hover:bg-brand/90 rounded-md px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create Account
          </button>
        </form>

        <p className="text-sm text-slate-500 mt-6 text-center">
          Already have an account?{" "}
          <Link data-testid="go-login-link" to="/login" className="text-brand font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
