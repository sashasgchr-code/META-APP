import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const hash = window.location.hash || "";
    const match = hash.match(/session_id=([^&]+)/);
    const sessionId = match ? match[1] : null;
    const run = async () => {
      if (!sessionId) { navigate("/login", { replace: true }); return; }
      try {
        const { data } = await api.post("/auth/session", {}, { headers: { "X-Session-ID": sessionId } });
        localStorage.setItem("session_token", data.session_token);
        setUser(data.user);
        window.history.replaceState(null, "", window.location.pathname);
        navigate("/dashboard", { replace: true, state: { user: data.user } });
      } catch (e) {
        navigate("/login", { replace: true });
      }
    };
    run();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
    </div>
  );
}
