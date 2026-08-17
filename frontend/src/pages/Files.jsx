import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { FolderOpen, FileCheck2, FileClock, MapPin, Eye, EyeOff, ChevronRight } from "lucide-react";

const inr = (n) => (n ? `₹${Number(n).toLocaleString("en-IN")}` : "—");
const maskPhone = (p) => { const s = (p || "").replace(/\s/g, ""); return s ? "*****" + s.slice(-4) : "—"; };

const StatCard = ({ label, value, icon: Icon, accent }) => (
  <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <div className={`h-9 w-9 rounded-md flex items-center justify-center ${accent}`}><Icon size={18} /></div>
    </div>
    <p className="text-3xl font-heading font-semibold tracking-tight text-brand-dark mt-3">{value}</p>
  </div>
);

function FileRow({ f, onOpen }) {
  const [reveal, setReveal] = useState(false);
  const dt = f.file_created_at || f.created_at;
  return (
    <div data-testid={`file-row-${f.lead_id}`} onClick={onOpen}
      className="flex items-center justify-between gap-4 px-4 py-3 border-b border-slate-100 hover:bg-slate-50/60 transition-colors cursor-pointer">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{f.full_name || "—"}</p>
        <div className="flex items-center gap-2 text-sm text-slate-600 mt-0.5">
          <span>{reveal ? f.phone : maskPhone(f.phone)}</span>
          <button data-testid={`reveal-phone-${f.lead_id}`} onClick={(e) => { e.stopPropagation(); setReveal(!reveal); }} className="text-slate-400 hover:text-brand">
            {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          {f.file?.loan_type && <span className="text-slate-300">|</span>}
          {f.file?.loan_type && <span className="text-slate-600 truncate">{f.file.loan_type}</span>}
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          {dt ? new Date(dt).toLocaleDateString() : "—"}
          {f.assigned_partner_name && <span className="text-brand"> • {f.assigned_partner_name}</span>}
          {f.file?.loan_amount && <span className="text-emerald-600"> • {inr(f.file.loan_amount)}</span>}
          <span className={f.assigned_partner_id ? "text-emerald-600" : "text-slate-400"}> • {f.assigned_partner_id ? "Assigned" : "Unassigned"}</span>
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span data-testid={`proc-status-${f.lead_id}`} className="text-sm font-medium text-slate-700 text-right max-w-[220px]">{f.processing_status || "New"}</span>
        <ChevronRight size={16} className="text-slate-300" />
      </div>
    </div>
  );
}

export default function Files() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/files/stats").then(({ data }) => setStats(data)),
      api.get("/leads", { params: { status: "FILE", page_size: 200 } }).then(({ data }) => setFiles(data.items)),
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <header className="h-16 border-b border-border bg-white px-4 md:px-8 flex items-center gap-2 sticky top-0 z-30">
        <FolderOpen size={20} className="text-violet-600" />
        <h1 className="text-xl font-heading font-bold text-brand-dark">Files &amp; Conversions</h1>
      </header>

      <div className="p-4 md:p-8">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <StatCard label="Total Files" value={stats?.total_files ?? "—"} icon={FolderOpen} accent="bg-violet-50 text-violet-600" />
          <StatCard label="Docs Received" value={stats?.docs_received ?? "—"} icon={FileCheck2} accent="bg-emerald-50 text-emerald-600" />
          <StatCard label="Docs Pending" value={stats?.pending_docs ?? "—"} icon={FileClock} accent="bg-amber-50 text-amber-600" />
        </div>

        <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden" data-testid="files-list">
          {loading ? (
            <p className="py-16 text-center text-slate-400 text-sm">Loading files...</p>
          ) : files.length === 0 ? (
            <p className="py-16 text-center text-slate-400 text-sm">No files yet. Mark a call as "File" to open a loan file.</p>
          ) : files.map((f) => <FileRow key={f.lead_id} f={f} onOpen={() => navigate(`/leads/${f.lead_id}`)} />)}
        </div>
      </div>
    </div>
  );
}
