import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PhoneCall, Clock } from "lucide-react";

const DISPOSITIONS = [
  { v: "NOT_ANSWERING", l: "Not Answering" }, { v: "SWITCHED_OFF", l: "Switched Off" },
  { v: "NOT_INTERESTED", l: "Not Interested" }, { v: "NOT_QUALIFIED", l: "Not Qualified" },
  { v: "CALL_BACK", l: "Call Back" }, { v: "LEAD", l: "Lead" }, { v: "FILE", l: "File (Convert)" },
];
const fmtDur = (s) => `${Math.floor(s / 60)}m ${s % 60}s`;

export default function CallModal({ phone, onClose, onSubmit }) {
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
