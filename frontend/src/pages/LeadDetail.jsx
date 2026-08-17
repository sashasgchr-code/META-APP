import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Phone, Mail, MapPin, Briefcase, Wallet, Megaphone, Send, MessageSquare, Activity, UserCog } from "lucide-react";
import { StatusPill } from "@/pages/Leads";

const STATUSES = ["NEW", "CONTACTED", "CALLED", "CONVERTED", "REJECTED"];

const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3 py-2">
    <Icon size={16} className="text-slate-400 mt-0.5 shrink-0" />
    <div className="min-w-0">
      <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-800 break-words">{value || "—"}</p>
    </div>
  </div>
);

export default function LeadDetail() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lead, setLead] = useState(null);
  const [partners, setPartners] = useState([]);
  const [note, setNote] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get(`/leads/${leadId}`);
      setLead(data);
    } catch (e) { toast.error("Lead not found"); navigate("/leads"); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [leadId]);
  useEffect(() => {
    if (user?.role === "admin") api.get("/partners").then(({ data }) => setPartners(data)).catch(() => {});
  }, [user]);

  const changeStatus = async (status) => {
    const { data } = await api.patch(`/leads/${leadId}/status`, { status });
    setLead(data); toast.success(`Status → ${status}`);
  };

  const assign = async (partnerId) => {
    const { data } = await api.patch(`/leads/${leadId}/assign`, { partner_id: partnerId || null });
    setLead(data); toast.success("Assignment updated");
  };

  const addNote = async () => {
    if (!note.trim()) return;
    const { data } = await api.post(`/leads/${leadId}/notes`, { text: note });
    setLead(data); setNote(""); toast.success("Note added");
  };

  if (!lead) return <div className="p-8"><div className="h-8 w-8 rounded-full border-2 border-brand border-t-transparent animate-spin" /></div>;

  const timeline = [...(lead.activities || [])].reverse();

  return (
    <div>
      <header className="h-16 border-b border-border bg-white px-8 flex items-center gap-3 sticky top-0 z-30">
        <button data-testid="back-btn" onClick={() => navigate("/leads")} className="text-slate-500 hover:text-brand transition-colors"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-heading font-bold text-brand-dark">{lead.full_name || "Lead"}</h1>
        <StatusPill status={lead.status} />
      </header>

      <div className="p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-dark mb-2">Lead Information</h3>
            <div className="divide-y divide-slate-50">
              <InfoRow icon={Phone} label="Phone" value={lead.phone} />
              <InfoRow icon={Mail} label="Email" value={lead.email} />
              <InfoRow icon={MapPin} label="City" value={lead.city} />
              <InfoRow icon={Briefcase} label="Employment" value={lead.employment_status} />
              <InfoRow icon={Wallet} label="Monthly Salary" value={lead.monthly_salary} />
              <InfoRow icon={Wallet} label="Outstanding Amount" value={lead.outstanding_amount} />
              <InfoRow icon={Megaphone} label="Campaign" value={lead.campaign_name} />
              <InfoRow icon={Activity} label="Platform" value={lead.platform} />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-dark mb-3">Status</h3>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {STATUSES.map((s) => (
                <button key={s} data-testid={`set-status-${s}`} onClick={() => changeStatus(s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${lead.status === s ? "bg-brand text-white border-brand" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{s}</button>
              ))}
            </div>
            <h3 className="text-sm font-semibold text-brand-dark mb-2 flex items-center gap-2"><UserCog size={16} /> Growth Partner</h3>
            {user?.role === "admin" ? (
              <select data-testid="detail-assign-select" value={lead.assigned_partner_id || ""} onChange={(e) => assign(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-brand">
                <option value="">Unassigned</option>
                {partners.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
              </select>
            ) : (
              <p className="text-sm text-slate-700">{lead.assigned_partner_name || "Not assigned"}</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-dark mb-3 flex items-center gap-2"><MessageSquare size={16} /> Notes</h3>
            <div className="flex gap-2 mb-4">
              <input data-testid="note-input" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()}
                placeholder="Add a note about this lead..."
                className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-colors" />
              <button data-testid="add-note-btn" onClick={addNote} className="bg-brand text-white hover:bg-brand/90 rounded-md px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1"><Send size={15} /></button>
            </div>
            <div className="space-y-3" data-testid="notes-list">
              {(lead.notes || []).length === 0 && <p className="text-sm text-slate-400">No notes yet.</p>}
              {[...(lead.notes || [])].reverse().map((n, i) => (
                <div key={i} className="border border-slate-100 rounded-md p-3 bg-slate-50/50">
                  <p className="text-sm text-slate-800">{n.text}</p>
                  <p className="text-xs text-slate-400 mt-1">{n.author} · {new Date(n.at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-dark mb-3 flex items-center gap-2"><Activity size={16} /> Activity Timeline</h3>
            <div className="relative pl-4 space-y-4">
              {timeline.map((a, i) => (
                <div key={i} className="relative">
                  <span className="absolute -left-4 top-1 h-2 w-2 rounded-full bg-brand" />
                  <span className="absolute -left-[13px] top-3 bottom-[-14px] w-px bg-slate-200" />
                  <p className="text-sm text-slate-700">{a.detail}</p>
                  <p className="text-xs text-slate-400">{new Date(a.at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
