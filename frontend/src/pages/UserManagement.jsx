import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck, Eye, EyeOff, KeyRound, Check, X, Loader2, Clock } from "lucide-react";

const ROLE_STYLES = {
  admin: "bg-brand/10 text-brand border-brand/20",
  ops: "bg-violet-50 text-violet-700 border-violet-200",
  growth_partner: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reveal, setReveal] = useState({});
  const [pwModal, setPwModal] = useState(null); // {user_id, name}
  const [newPw, setNewPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const setApproval = async (u, approved) => {
    setBusyId(u.user_id);
    try {
      await api.patch(`/users/${u.user_id}/approve`, { approved });
      toast.success(approved ? `${u.name} approved` : `${u.name} revoked`);
      load();
    } catch (e) { toast.error("Action failed"); } finally { setBusyId(null); }
  };

  const savePassword = async () => {
    if (newPw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setSaving(true);
    try {
      await api.patch(`/users/${pwModal.user_id}/password`, { password: newPw });
      toast.success(`Password updated for ${pwModal.name}`);
      setPwModal(null); setNewPw(""); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to update"); } finally { setSaving(false); }
  };

  const pending = users.filter((u) => u.role === "growth_partner" && !u.approved);

  return (
    <div>
      <header className="h-16 border-b border-border bg-white px-8 flex items-center gap-2 sticky top-0 z-30">
        <ShieldCheck size={20} className="text-brand" />
        <h1 className="text-xl font-heading font-bold text-brand-dark">User Management</h1>
        {pending.length > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
            <Clock size={12} /> {pending.length} pending approval
          </span>
        )}
      </header>

      <div className="p-6 lg:p-8">
        <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  {["User", "Role", "User ID", "Password", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-xs font-semibold uppercase tracking-wider text-slate-500 py-3 px-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody data-testid="users-table-body">
                {loading ? (
                  <tr><td colSpan={6} className="py-16 text-center text-slate-400 text-sm">Loading users...</td></tr>
                ) : users.map((u) => (
                  <tr key={u.user_id} data-testid={`user-row-${u.user_id}`} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-3">
                      <p className="text-sm font-medium text-slate-800">{u.name}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${ROLE_STYLES[u.role] || ROLE_STYLES.growth_partner}`}>{u.role.replace("_", " ")}</span>
                    </td>
                    <td className="py-2.5 px-3"><code className="text-xs text-slate-500">{u.user_id}</code></td>
                    <td className="py-2.5 px-3">
                      {u.visible_password ? (
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-slate-700" data-testid={`pw-${u.user_id}`}>{reveal[u.user_id] ? u.visible_password : "••••••••"}</code>
                          <button data-testid={`reveal-pw-${u.user_id}`} onClick={() => setReveal({ ...reveal, [u.user_id]: !reveal[u.user_id] })}
                            className="text-slate-400 hover:text-brand transition-colors">
                            {reveal[u.user_id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      ) : <span className="text-xs text-slate-400">Google login</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      {u.role === "growth_partner" ? (
                        u.approved
                          ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><Check size={13} /> Approved</span>
                          : <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700"><Clock size={13} /> Pending</span>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {u.role === "growth_partner" && !u.approved && (
                          <button data-testid={`approve-${u.user_id}`} disabled={busyId === u.user_id} onClick={() => setApproval(u, true)}
                            className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60">
                            {busyId === u.user_id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Approve
                          </button>
                        )}
                        {u.role === "growth_partner" && u.approved && (
                          <button data-testid={`revoke-${u.user_id}`} disabled={busyId === u.user_id} onClick={() => setApproval(u, false)}
                            className="inline-flex items-center gap-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md px-2.5 py-1 text-xs font-medium transition-colors">
                            <X size={12} /> Revoke
                          </button>
                        )}
                        <button data-testid={`change-pw-${u.user_id}`} onClick={() => { setPwModal({ user_id: u.user_id, name: u.name }); setNewPw(""); }}
                          className="inline-flex items-center gap-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md px-2.5 py-1 text-xs font-medium transition-colors">
                          <KeyRound size={12} /> Password
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {pwModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setPwModal(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()} data-testid="password-modal">
            <h3 className="text-lg font-heading font-semibold text-brand-dark mb-1">Set new password</h3>
            <p className="text-sm text-slate-500 mb-4">for <strong>{pwModal.name}</strong></p>
            <input data-testid="new-password-input" type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Min 6 characters" autoFocus
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-colors mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setPwModal(null)} className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md px-4 py-2 text-sm font-medium transition-colors">Cancel</button>
              <button data-testid="save-password-btn" disabled={saving} onClick={savePassword}
                className="bg-brand text-white hover:bg-brand/90 rounded-md px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-60">
                {saving && <Loader2 size={14} className="animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
