import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Phone, PhoneCall, Mail, MapPin, Briefcase, Wallet, Megaphone, Send, MessageSquare, Activity, UserCog, FolderOpen, Plus, Trash2, Save, Clock } from "lucide-react";
import { StatusPill, STATUS_LABEL } from "@/pages/Leads";

const STATUSES = ["NEW", "CALL_BACK", "NOT_ANSWERING", "SWITCHED_OFF", "NOT_INTERESTED", "NOT_QUALIFIED", "LEAD", "FILE", "CONVERTED"];
const DISPOSITIONS = [
  { v: "NOT_ANSWERING", l: "Not Answering" }, { v: "SWITCHED_OFF", l: "Switched Off" },
  { v: "NOT_INTERESTED", l: "Not Interested" }, { v: "NOT_QUALIFIED", l: "Not Qualified" },
  { v: "CALL_BACK", l: "Call Back" }, { v: "LEAD", l: "Lead" }, { v: "FILE", l: "File (Convert)" },
];

const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3 py-2">
    <Icon size={16} className="text-slate-400 mt-0.5 shrink-0" />
    <div className="min-w-0">
      <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-800 break-words">{value || "—"}</p>
    </div>
  </div>
);

const fmtDur = (s) => `${Math.floor(s / 60)}m ${s % 60}s`;

function CallModal({ phone, onClose, onSubmit }) {
  const [seconds, setSeconds] = useState(0);
  const [disposition, setDisposition] = useState("");
  const [reason, setReason] = useState("");
  const [docs, setDocs] = useState("");
  const [saving, setSaving] = useState(false);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const submit = async () => {
    if (!disposition) { toast.error("Select a call outcome"); return; }
    if (disposition === "NOT_QUALIFIED" && !reason.trim()) { toast.error("Reason required"); return; }
    setSaving(true);
    try {
      await onSubmit({
        duration_seconds: Math.floor((Date.now() - startRef.current) / 1000),
        disposition, reason: reason.trim() || "",
        docs_received: disposition === "FILE" ? (docs === "yes") : null,
      });
      onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to log call"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()} data-testid="call-modal">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center animate-pulse"><PhoneCall size={20} /></div>
          <div>
            <p className="text-sm font-semibold text-brand-dark">Calling {phone}</p>
            <p className="text-xs text-slate-500 flex items-center gap-1"><Clock size={12} /> {fmtDur(seconds)}</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">After the call, select the outcome:</p>
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Call Outcome</label>
        <select data-testid="disposition-select" value={disposition} onChange={(e) => setDisposition(e.target.value)}
          className="mt-1 mb-3 w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-brand">
          <option value="">Select outcome...</option>
          {DISPOSITIONS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
        </select>
        {disposition === "NOT_QUALIFIED" && (
          <div className="mb-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Reason</label>
            <input data-testid="disposition-reason" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Why not qualified?" className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
        )}
        {disposition === "FILE" && (
          <div className="mb-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Documents Received?</label>
            <select data-testid="disposition-docs" value={docs} onChange={(e) => setDocs(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-brand">
              <option value="">Select...</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md px-4 py-2 text-sm font-medium transition-colors">Cancel</button>
          <button data-testid="log-call-btn" disabled={saving} onClick={submit}
            className="bg-brand text-white hover:bg-brand/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60">Log Call</button>
        </div>
      </div>
    </div>
  );
}

const F = ({ label, value, onChange, type = "text", placeholder }) => (
  <div>
    <label className="text-xs font-medium text-slate-500">{label}</label>
    <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm outline-none focus:border-brand" />
  </div>
);

function FileCard({ lead, onSave }) {
  const [f, setF] = useState(lead.file || {});
  const [banks, setBanks] = useState(lead.file?.banks || []);
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const setBank = (i, k, v) => { const b = [...banks]; b[i] = { ...b[i], [k]: v }; setBanks(b); };

  const save = async () => {
    setSaving(true);
    try { await onSave({ ...f, banks }); toast.success("File details saved"); }
    catch (e) { toast.error("Failed to save"); } finally { setSaving(false); }
  };

  return (
    <div className="bg-white border border-violet-200 rounded-md p-5 shadow-sm" data-testid="file-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-violet-700 flex items-center gap-2"><FolderOpen size={16} /> Loan File Details</h3>
        <button data-testid="save-file-btn" onClick={save} disabled={saving}
          className="bg-brand text-white hover:bg-brand/90 rounded-md px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1 disabled:opacity-60"><Save size={14} /> Save</button>
      </div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Customer & Employment</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <F label="Mother's Name" value={f.mother_name} onChange={set("mother_name")} />
        <F label="Current Address" value={f.current_address} onChange={set("current_address")} />
        <F label="Employment Type" value={f.employment_type} onChange={set("employment_type")} />
        <F label="Company Name" value={f.company_name} onChange={set("company_name")} />
        <F label="Net Salary (₹)" value={f.net_salary} onChange={set("net_salary")} type="number" />
        <F label="Office Address" value={f.office_address} onChange={set("office_address")} />
      </div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Loan Requirement</p>
      <div className="grid grid-cols-2 gap-3 mb-2">
        <F label="Type of Loan" value={f.loan_type} onChange={set("loan_type")} />
        <F label="CIBIL Score" value={f.cibil} onChange={set("cibil")} type="number" />
        <F label="Loan Amount (₹)" value={f.loan_amount} onChange={set("loan_amount")} type="number" />
        <F label="Tenure (months)" value={f.tenure} onChange={set("tenure")} type="number" />
      </div>
      <div className="mb-4">
        <label className="text-xs font-medium text-slate-500">Existing Loans & Obligations</label>
        <textarea value={f.existing_loans || ""} onChange={(e) => set("existing_loans")(e.target.value)} rows={2}
          className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm outline-none focus:border-brand" />
      </div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bank Eligibilities ({banks.length})</p>
        <button data-testid="add-bank-btn" onClick={() => setBanks([...banks, {}])} className="text-xs text-brand hover:underline flex items-center gap-1"><Plus size={12} /> Add Bank</button>
      </div>
      <div className="space-y-3">
        {banks.map((b, i) => (
          <div key={i} className="border border-slate-200 rounded-md p-3 relative" data-testid={`bank-row-${i}`}>
            <button onClick={() => setBanks(banks.filter((_, j) => j !== i))} className="absolute top-2 right-2 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <F label="Bank Name" value={b.bank_name} onChange={(v) => setBank(i, "bank_name", v)} />
              <F label="Eligible Amount (₹)" value={b.eligible_amount} onChange={(v) => setBank(i, "eligible_amount", v)} type="number" />
              <F label="ROI (%)" value={b.roi} onChange={(v) => setBank(i, "roi", v)} type="number" />
              <div>
                <label className="text-xs font-medium text-slate-500">Status</label>
                <select value={b.status || ""} onChange={(e) => setBank(i, "status", e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-brand">
                  <option value="">Select</option>
                  <option>Eligible</option><option>Login Done</option><option>Approved</option><option>Disbursed</option><option>Rejected</option>
                </select>
              </div>
              <F label="Approved Amount (₹)" value={b.approved_amount} onChange={(v) => setBank(i, "approved_amount", v)} type="number" />
              <F label="Commission (₹)" value={b.commission_amount} onChange={(v) => setBank(i, "commission_amount", v)} type="number" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LeadDetail() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lead, setLead] = useState(null);
  const [partners, setPartners] = useState([]);
  const [note, setNote] = useState("");
  const [callOpen, setCallOpen] = useState(false);

  const load = async () => {
    try { const { data } = await api.get(`/leads/${leadId}`); setLead(data); }
    catch (e) { toast.error("Lead not found"); navigate("/leads"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [leadId]);
  useEffect(() => { if (user?.role === "admin") api.get("/partners").then(({ data }) => setPartners(data)).catch(() => {}); }, [user]);

  const changeStatus = async (status) => { const { data } = await api.patch(`/leads/${leadId}/status`, { status }); setLead(data); toast.success(`Status → ${STATUS_LABEL(status)}`); };
  const assign = async (pid) => { const { data } = await api.patch(`/leads/${leadId}/assign`, { partner_id: pid || null }); setLead(data); toast.success("Assignment updated"); };
  const addNote = async () => { if (!note.trim()) return; const { data } = await api.post(`/leads/${leadId}/notes`, { text: note }); setLead(data); setNote(""); toast.success("Note added"); };
  const logCall = async (payload) => { const { data } = await api.post(`/leads/${leadId}/calls`, payload); setLead(data); toast.success("Call logged"); };
  const saveFile = async (fdata) => { const { data } = await api.patch(`/leads/${leadId}/file`, { data: fdata }); setLead(data); };

  const startCall = () => { setCallOpen(true); setTimeout(() => { window.location.href = `tel:${lead.phone}`; }, 50); };

  if (!lead) return <div className="p-8"><div className="h-8 w-8 rounded-full border-2 border-brand border-t-transparent animate-spin" /></div>;
  const timeline = [...(lead.activities || [])].reverse();
  const calls = [...(lead.call_logs || [])].reverse();

  return (
    <div>
      <header className="h-16 border-b border-border bg-white px-8 flex items-center gap-3 sticky top-0 z-30">
        <button data-testid="back-btn" onClick={() => navigate("/leads")} className="text-slate-500 hover:text-brand transition-colors"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-heading font-bold text-brand-dark">{lead.full_name || "Lead"}</h1>
        <StatusPill status={lead.status} />
        <button data-testid="call-btn" onClick={startCall}
          className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"><Phone size={16} /> Call</button>
      </header>

      <div className="p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-dark mb-2">Lead Information</h3>
            <div className="divide-y divide-slate-50">
              <div className="flex items-start gap-3 py-2">
                <Phone size={16} className="text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Phone</p>
                  <a data-testid="phone-dial-link" href={`tel:${lead.phone}`} onClick={() => setTimeout(() => setCallOpen(true), 300)}
                    className="text-sm text-brand font-medium hover:underline">{lead.phone || "—"}</a>
                </div>
              </div>
              <InfoRow icon={Mail} label="Email" value={lead.email} />
              <InfoRow icon={MapPin} label="City" value={lead.city} />
              <InfoRow icon={Briefcase} label="Employment" value={lead.employment_status} />
              <InfoRow icon={Wallet} label="Monthly Salary" value={lead.monthly_salary} />
              <InfoRow icon={Wallet} label="Outstanding Amount" value={lead.outstanding_amount} />
              <InfoRow icon={Megaphone} label="Campaign" value={lead.campaign_name} />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-dark mb-3">Status</h3>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {STATUSES.map((s) => (
                <button key={s} data-testid={`set-status-${s}`} onClick={() => changeStatus(s)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${lead.status === s ? "bg-brand text-white border-brand" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{STATUS_LABEL(s)}</button>
              ))}
            </div>
            <h3 className="text-sm font-semibold text-brand-dark mb-2 flex items-center gap-2"><UserCog size={16} /> Growth Partner</h3>
            {user?.role === "admin" ? (
              <select data-testid="detail-assign-select" value={lead.assigned_partner_id || ""} onChange={(e) => assign(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-brand">
                <option value="">Unassigned</option>
                {partners.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
              </select>
            ) : <p className="text-sm text-slate-700">{lead.assigned_partner_name || "Not assigned"}</p>}
          </div>

          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-dark mb-3 flex items-center gap-2"><PhoneCall size={16} /> Call Logs</h3>
            <div className="space-y-2" data-testid="call-logs-list">
              {calls.length === 0 && <p className="text-sm text-slate-400">No calls logged yet.</p>}
              {calls.map((c, i) => (
                <div key={i} className="border border-slate-100 rounded-md p-2.5 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <StatusPill status={c.disposition} />
                    <span className="text-xs text-slate-500 flex items-center gap-1"><Clock size={11} /> {fmtDur(c.duration_seconds || 0)}</span>
                  </div>
                  {c.reason && <p className="text-xs text-slate-600 mt-1">Reason: {c.reason}</p>}
                  {c.docs_received !== null && c.docs_received !== undefined && <p className="text-xs text-slate-600 mt-1">Docs: {c.docs_received ? "Received" : "Pending"}</p>}
                  <p className="text-xs text-slate-400 mt-1">{c.user_name} · {new Date(c.at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {["FILE", "CONVERTED"].includes(lead.status) && <FileCard key={lead.updated_at} lead={lead} onSave={saveFile} />}

          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-dark mb-3 flex items-center gap-2"><MessageSquare size={16} /> Notes</h3>
            <div className="flex gap-2 mb-4">
              <input data-testid="note-input" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()}
                placeholder="Add a note..." className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm outline-none focus:border-brand" />
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

      {callOpen && <CallModal phone={lead.phone} onClose={() => setCallOpen(false)} onSubmit={logCall} />}
    </div>
  );
}
