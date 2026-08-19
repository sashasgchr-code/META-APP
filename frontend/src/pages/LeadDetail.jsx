import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Phone, PhoneCall, Mail, MapPin, Briefcase, Wallet, Megaphone, Send, MessageSquare, Activity, UserCog, FolderOpen, Plus, Trash2, Save, Clock, Upload, Download, FileText } from "lucide-react";
import { StatusPill, STATUS_LABEL } from "@/pages/Leads";

const STATUSES = ["NEW", "CALL_BACK", "NOT_ANSWERING", "SWITCHED_OFF", "NOT_INTERESTED", "NOT_QUALIFIED", "LEAD", "FILE"];
const PROC_STATUSES = ["New", "Contacted", "Documents Collected", "Documents Pending", "Sent for Eligibility",
  "Sent for Login", "Login Done", "Sent for Approval", "Underwriting", "FI (Field Investigation)",
  "FI Negative", "FI Reinitiated", "Query/Hold", "Customer Not Interested - Need Help from MIT & Manager",
  "Customer Not Supporting - Need Help from MIT & Manager", "Approved", "Disbursed", "Not Eligible",
  "Not Login", "Declined", "Not Disbursed"];
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

function FileStatusModal({ onClose, onConfirm }) {
  const [docs, setDocs] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!docs) { toast.error("Please select whether documents are received"); return; }
    setSaving(true);
    try { await onConfirm(docs === "yes"); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()} data-testid="file-status-modal">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center"><FolderOpen size={20} /></div>
          <div><p className="text-sm font-semibold text-brand-dark">Convert to File</p><p className="text-xs text-slate-500">Confirm document status</p></div>
        </div>
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Documents Received?</label>
        <select data-testid="file-docs-select" value={docs} onChange={(e) => setDocs(e.target.value)}
          className="mt-1 mb-4 w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-brand">
          <option value="">Select...</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md px-4 py-2 text-sm font-medium transition-colors">Cancel</button>
          <button data-testid="file-status-confirm-btn" disabled={saving} onClick={submit}
            className="bg-brand text-white hover:bg-brand/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60">Convert to File</button>
        </div>
      </div>
    </div>
  );
}

const F = ({ label, value, onChange, type = "text", placeholder, disabled }) => (  <div>
    <label className="text-xs font-medium text-slate-500">{label}</label>
    <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-slate-50 disabled:text-slate-500" />
  </div>
);

const Sel = ({ label, value, onChange, options, disabled }) => (
  <div>
    <label className="text-xs font-medium text-slate-500">{label}</label>
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled}
      className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-brand disabled:bg-slate-50 disabled:text-slate-500">
      <option value="">Select</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const Section = ({ title, children }) => (
  <div className="mt-3 pt-3 border-t border-slate-100">
    <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2">{title}</p>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>
  </div>
);

function FileCard({ lead, onSave, canEdit, canStatus, onUpdateStatus }) {
  const [f, setF] = useState(lead.file || {});
  const [banks, setBanks] = useState(lead.file?.banks || []);
  const [saving, setSaving] = useState(false);
  const [pstatus, setPstatus] = useState(lead.processing_status || "");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const d = !canEdit;
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const setBank = (i, k, v) => {
    const b = [...banks]; b[i] = { ...b[i], [k]: v };
    if (k === "commission_pct" || k === "disbursed_amount" || k === "approved_amount") {
      const base = Number(b[i].disbursed_amount || b[i].approved_amount || 0);
      const pct = Number(b[i].commission_pct || 0);
      b[i].commission_amount = base && pct ? Math.round(base * pct) / 100 : b[i].commission_amount;
    }
    setBanks(b);
  };

  const save = async () => {
    setSaving(true);
    try { await onSave({ ...f, banks }); } catch (e) {} finally { setSaving(false); }
  };

  return (
    <div className="bg-white border border-violet-200 rounded-md p-5 shadow-sm" data-testid="file-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-violet-700 flex items-center gap-2"><FolderOpen size={16} /> Loan File Details</h3>
        {canEdit
          ? <button data-testid="save-file-btn" onClick={save} disabled={saving}
              className="bg-brand text-white hover:bg-brand/90 rounded-md px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1 disabled:opacity-60"><Save size={14} /> Save</button>
          : <span className="text-xs text-slate-400 italic">View only</span>}
      </div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Customer Details</p>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3 text-sm">
        <div><p className="text-xs text-slate-400">Full Name</p><p className="text-slate-800 font-medium">{lead.full_name || "—"}</p></div>
        <div><p className="text-xs text-slate-400">Mobile</p><p className="text-slate-800">{lead.phone || "—"}</p></div>
        <div><p className="text-xs text-slate-400">Email</p><p className="text-slate-800 truncate">{lead.email || "—"}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <F label="Mother's Name" value={f.mother_name} onChange={set("mother_name")} disabled={d} />
        <F label="Current Address" value={f.current_address} onChange={set("current_address")} disabled={d} />
      </div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Employment Details</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <F label="Employment Type" value={f.employment_type} onChange={set("employment_type")} disabled={d} />
        <F label="Company Name" value={f.company_name} onChange={set("company_name")} disabled={d} />
        <F label="Net Salary (₹)" value={f.net_salary} onChange={set("net_salary")} type="number" disabled={d} />
        <F label="Office Address" value={f.office_address} onChange={set("office_address")} disabled={d} />
      </div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Loan Requirements</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <F label="Type of Loan" value={f.loan_type} onChange={set("loan_type")} disabled={d} />
        <F label="CIBIL Score" value={f.cibil} onChange={set("cibil")} type="number" disabled={d} />
        <F label="Loan Amount Required (₹)" value={f.loan_amount} onChange={set("loan_amount")} type="number" disabled={d} />
        <F label="Tenure Required (months)" value={f.tenure} onChange={set("tenure")} type="number" disabled={d} />
      </div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Existing Loans & Obligations</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <F label="Monthly EMI Obligations (₹)" value={f.monthly_emi} onChange={set("monthly_emi")} disabled={d} />
        <F label="Existing Loan 1" value={f.existing_loan_1} onChange={set("existing_loan_1")} disabled={d} />
        <F label="Existing Loan 2" value={f.existing_loan_2} onChange={set("existing_loan_2")} disabled={d} />
        <F label="Existing Loan 3" value={f.existing_loan_3} onChange={set("existing_loan_3")} disabled={d} />
      </div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Lead Source &amp; Status</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 text-sm">
        <div><p className="text-xs text-slate-400">Source Type</p><p className="text-slate-800">{lead.platform || "Agent"}</p></div>
        <div><p className="text-xs text-slate-400">Growth Partner</p><p className="text-slate-800">{lead.assigned_partner_name || "—"}</p></div>
        <div><p className="text-xs text-slate-400">Current Status</p><p className="text-slate-800">{(lead.status || "").replace(/_/g, " ")}</p></div>
        <div><p className="text-xs text-slate-400">Created</p><p className="text-slate-800">{new Date(lead.file_created_at || lead.created_at).toLocaleDateString()}</p></div>
      </div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bank Eligibilities ({banks.length})</p>
        {canEdit && <button data-testid="add-bank-btn" onClick={() => setBanks([...banks, {}])} className="text-xs text-brand hover:underline flex items-center gap-1"><Plus size={12} /> Add Bank</button>}
      </div>
      <div className="space-y-4">
        {banks.map((b, i) => (
          <div key={i} className="border border-slate-200 rounded-md p-3 relative" data-testid={`bank-row-${i}`}>
            {canEdit && <button onClick={() => setBanks(banks.filter((_, j) => j !== i))} className="absolute top-2 right-2 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>}
            <p className="text-xs font-semibold text-emerald-700 mb-2">Bank #{i + 1}</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <F label="Bank Name" value={b.bank_name} onChange={(v) => setBank(i, "bank_name", v)} disabled={d} />
              <Sel label="Eligible?" value={b.eligible} onChange={(v) => setBank(i, "eligible", v)} options={["Yes", "No"]} disabled={d} />
              {b.eligible === "No" && <F label="Reason (Not Eligible)" value={b.ineligible_reason} onChange={(v) => setBank(i, "ineligible_reason", v)} disabled={d} />}
              {b.eligible === "Yes" && <>
                <F label="Eligible Amount (₹)" value={b.eligible_amount} onChange={(v) => setBank(i, "eligible_amount", v)} type="number" disabled={d} />
                <F label="ROI (%)" value={b.roi} onChange={(v) => setBank(i, "roi", v)} type="number" disabled={d} />
              </>}
            </div>

            {b.eligible === "Yes" && (
              <Section title="Login Status">
                <Sel label="Login Done?" value={b.login_done} onChange={(v) => setBank(i, "login_done", v)} options={["Yes", "No"]} disabled={d} />
                {b.login_done === "No" && <F label="Reason (No Login)" value={b.login_reason} onChange={(v) => setBank(i, "login_reason", v)} disabled={d} />}
                {b.login_done === "Yes" && <>
                  <F label="Login Bank" value={b.login_bank} onChange={(v) => setBank(i, "login_bank", v)} disabled={d} />
                  <F label="Application ID" value={b.application_id} onChange={(v) => setBank(i, "application_id", v)} disabled={d} />
                  <F label="SM Name" value={b.sm_name} onChange={(v) => setBank(i, "sm_name", v)} disabled={d} />
                  <F label="SM Number" value={b.sm_number} onChange={(v) => setBank(i, "sm_number", v)} disabled={d} />
                </>}
              </Section>
            )}

            {b.eligible === "Yes" && b.login_done === "Yes" && (
              <Section title="Approval Status">
                <Sel label="Status" value={b.approval_status} onChange={(v) => setBank(i, "approval_status", v)} options={["Pending", "Approved", "Rejected"]} disabled={d} />
                {b.approval_status === "Approved" && <>
                  <F label="Approved Bank" value={b.approved_bank} onChange={(v) => setBank(i, "approved_bank", v)} disabled={d} />
                  <F label="Approved Amount (₹)" value={b.approved_amount} onChange={(v) => setBank(i, "approved_amount", v)} type="number" disabled={d} />
                  <F label="Tenure (months)" value={b.approval_tenure} onChange={(v) => setBank(i, "approval_tenure", v)} type="number" disabled={d} />
                  <F label="ROI (%)" value={b.approval_roi} onChange={(v) => setBank(i, "approval_roi", v)} type="number" disabled={d} />
                </>}
              </Section>
            )}

            {b.approval_status === "Approved" && (
              <Section title="Disbursement">
                <Sel label="Disbursed?" value={b.disbursed} onChange={(v) => setBank(i, "disbursed", v)} options={["Yes", "No"]} disabled={d} />
                {b.disbursed === "Yes" && <>
                  <F label="Disbursal Date" value={b.disbursal_date} onChange={(v) => setBank(i, "disbursal_date", v)} type="date" disabled={d} />
                  <F label="Disbursed Bank" value={b.disbursed_bank} onChange={(v) => setBank(i, "disbursed_bank", v)} disabled={d} />
                  <F label="Disbursed Amount (₹)" value={b.disbursed_amount} onChange={(v) => setBank(i, "disbursed_amount", v)} type="number" disabled={d} />
                  <F label="Commission %" value={b.commission_pct} onChange={(v) => setBank(i, "commission_pct", v)} type="number" disabled={d} />
                  <div>
                    <label className="text-xs font-medium text-slate-500">Commission Amount</label>
                    <p className="mt-1 text-lg font-heading font-semibold text-emerald-600" data-testid={`commission-${i}`}>₹{Number(b.commission_amount || 0).toLocaleString("en-IN")}</p>
                  </div>
                </>}
              </Section>
            )}
          </div>
        ))}
        {banks.length === 0 && <p className="text-sm text-slate-400">No banks added yet.</p>}
      </div>

      <div className="mt-5 pt-4 border-t border-slate-200">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">File Processing Status</p>
        {lead.processing_status && <p className="text-sm text-slate-700 mb-2">Current: <span className="font-medium text-brand-dark">{lead.processing_status}</span></p>}
        {canStatus ? (
          <div className="flex flex-wrap items-center gap-2">
            <select data-testid="processing-status-select" value={pstatus} onChange={(e) => setPstatus(e.target.value)}
              className="flex-1 min-w-[220px] border border-slate-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-brand">
              <option value="">Select status...</option>
              {PROC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button data-testid="update-status-btn" disabled={updatingStatus || !pstatus}
              onClick={async () => { setUpdatingStatus(true); try { await onUpdateStatus(pstatus); } finally { setUpdatingStatus(false); } }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60">Update Status</button>
          </div>
        ) : <p className="text-sm text-slate-500">{lead.processing_status || "Not set"}</p>}
      </div>
    </div>
  );
}

function DocumentsCard({ lead, reload }) {
  const [uploading, setUploading] = useState(false);
  const docs = lead.documents || [];
  const onUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData(); fd.append("file", file);
        await api.post(`/leads/${lead.lead_id}/documents`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      toast.success("Uploaded"); reload();
    } catch (err) { toast.error(err?.response?.data?.detail || "Upload failed"); }
    finally { setUploading(false); e.target.value = ""; }
  };
  const download = async (d) => {
    try {
      const res = await api.get(`/leads/${lead.lead_id}/documents/${d.doc_id}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url; a.download = d.filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { toast.error("Download failed"); }
  };
  const del = async (d) => {
    try { await api.delete(`/leads/${lead.lead_id}/documents/${d.doc_id}`); toast.success("Deleted"); reload(); }
    catch (e) { toast.error("Delete failed"); }
  };
  const downloadZip = async () => {
    try {
      const res = await api.get(`/leads/${lead.lead_id}/documents/zip`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url; a.download = "documents.zip"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { toast.error("Download failed"); }
  };
  return (
    <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm" data-testid="documents-card">
      <h3 className="text-sm font-semibold text-brand-dark flex items-center gap-2 mb-3"><FileText size={16} /> Documents ({docs.length})</h3>
      {docs.length > 0 && (
        <button data-testid="download-zip-btn" onClick={downloadZip}
          className="mb-3 inline-flex items-center gap-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md px-3 py-1.5 text-xs font-medium transition-colors">
          <Download size={13} /> Download All ZIP
        </button>
      )}
      <div className="space-y-2 mb-4" data-testid="documents-list">
        {docs.length === 0 && <p className="text-sm text-slate-400">No documents uploaded yet.</p>}
        {docs.map((d) => (
          <div key={d.doc_id} className="flex items-center justify-between border border-slate-100 rounded-md px-3 py-2 bg-slate-50/50" data-testid={`doc-${d.doc_id}`}>
            <div className="min-w-0">
              <p className="text-sm text-slate-800 truncate">{d.filename}</p>
              <p className="text-xs text-slate-400">{(d.size / 1024).toFixed(1)}KB · {d.uploaded_by}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0 pl-3">
              <button data-testid={`doc-download-${d.doc_id}`} onClick={() => download(d)} className="text-slate-400 hover:text-brand transition-colors"><Download size={16} /></button>
              <button data-testid={`doc-delete-${d.doc_id}`} onClick={() => del(d)} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
      <label data-testid="upload-docs-label" className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-md py-3 text-sm text-slate-500 hover:border-brand hover:text-brand cursor-pointer transition-colors">
        <Upload size={16} /> {uploading ? "Uploading..." : "Upload Documents"}
        <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={onUpload} data-testid="upload-docs-input" disabled={uploading} />
      </label>
      <p className="text-xs text-slate-400 mt-2">PDF, PNG, JPG (max 10MB each)</p>
    </div>
  );
}

export default function LeadDetail() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lead, setLead] = useState(null);
  const [partners, setPartners] = useState([]);
  const [processors, setProcessors] = useState([]);
  const [note, setNote] = useState("");
  const [callOpen, setCallOpen] = useState(false);
  const [fileModal, setFileModal] = useState(false);
  const isStaffLike = ["admin", "ops", "processor"].includes(user?.role);

  const load = async () => {
    try { const { data } = await api.get(`/leads/${leadId}`); setLead(data); }
    catch (e) { toast.error("Lead not found"); navigate("/leads"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [leadId]);
  useEffect(() => { if (user?.role === "admin") api.get("/partners").then(({ data }) => setPartners(data)).catch(() => {}); }, [user]);
  useEffect(() => { if (isStaffLike) api.get("/processors").then(({ data }) => setProcessors(data)).catch(() => {}); }, [isStaffLike]);
  const assignProcessor = async (pid) => { const { data } = await api.patch(`/leads/${leadId}/processor`, { processor_id: pid || null }); setLead(data); toast.success("Processor updated"); };

  const changeStatus = async (status, docs_received) => { const { data } = await api.patch(`/leads/${leadId}/status`, { status, docs_received }); setLead(data); toast.success(`Status → ${STATUS_LABEL(status)}`); };
  const assign = async (pid) => { const { data } = await api.patch(`/leads/${leadId}/assign`, { partner_id: pid || null }); setLead(data); toast.success("Assignment updated"); };
  const addNote = async () => { if (!note.trim()) return; const { data } = await api.post(`/leads/${leadId}/notes`, { text: note }); setLead(data); setNote(""); toast.success("Note added"); };
  const logCall = async (payload) => { const { data } = await api.post(`/leads/${leadId}/calls`, payload); setLead(data); toast.success("Call logged"); };
  const saveFile = async (fdata) => { const { data } = await api.patch(`/leads/${leadId}/file`, { data: fdata }); setLead(data); toast.success("File details saved"); };
  const updateProcessingStatus = async (status) => { const { data } = await api.patch(`/leads/${leadId}/processing-status`, { status }); setLead(data); toast.success("Processing status updated"); };

  if (!lead) return <div className="p-8"><div className="h-8 w-8 rounded-full border-2 border-brand border-t-transparent animate-spin" /></div>;
  const timeline = [...(lead.activities || [])].reverse();
  const calls = [...(lead.call_logs || [])].reverse();

  return (
    <div>
      <header className="h-16 border-b border-border bg-white px-8 flex items-center gap-3 sticky top-0 z-30">
        <button data-testid="back-btn" onClick={() => navigate("/leads")} className="text-slate-500 hover:text-brand transition-colors"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-heading font-bold text-brand-dark">{lead.full_name || "Lead"}</h1>
        <StatusPill status={lead.status} />
        <a data-testid="call-btn" href={`tel:${lead.phone}`} onClick={() => setCallOpen(true)}
          className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"><Phone size={16} /> Call</a>
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
                  <a data-testid="phone-dial-link" href={`tel:${lead.phone}`} onClick={() => setCallOpen(true)}
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
                <button key={s} data-testid={`set-status-${s}`} onClick={() => { if (s === "FILE" && lead.status !== "FILE") setFileModal(true); else changeStatus(s); }}
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
            {lead.status === "FILE" && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-brand-dark mb-2 flex items-center gap-2"><UserCog size={16} /> Processor</h3>
                {isStaffLike ? (
                  <select data-testid="processor-select" value={lead.assigned_processor_id || ""} onChange={(e) => assignProcessor(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-brand">
                    <option value="">Unassigned</option>
                    {processors.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
                  </select>
                ) : <p className="text-sm text-slate-700">{lead.assigned_processor_name || "Not assigned"}</p>}
              </div>
            )}
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
          {lead.status === "FILE" && <FileCard key={lead.updated_at} lead={lead} onSave={saveFile} canEdit={user?.role === "admin" || user?.role === "ops"} canStatus={isStaffLike} onUpdateStatus={updateProcessingStatus} />}
          {lead.status === "FILE" && (user?.role === "admin" || user?.role === "ops" || (user?.role === "growth_partner" && lead.assigned_partner_id === user?.user_id) || (user?.role === "processor" && lead.assigned_processor_id === user?.user_id)) && <DocumentsCard lead={lead} reload={load} />}

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
      {fileModal && <FileStatusModal onClose={() => setFileModal(false)} onConfirm={async (docs) => { await changeStatus("FILE", docs); setFileModal(false); }} />}
    </div>
  );
}
