import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { FolderOpen, FileCheck2, FileClock, MapPin, Eye, EyeOff, ChevronRight, Search } from "lucide-react";

const inr = (n) => (n ? `₹${Number(n).toLocaleString("en-IN")}` : "—");
const maskPhone = (p) => { const s = (p || "").replace(/\s/g, ""); return s ? "*****" + s.slice(-4) : "—"; };

const PROC_STATUSES = ["New", "Contacted", "Documents Collected", "Documents Pending", "Sent for Eligibility",
  "Sent for Login", "Login Done", "Sent for Approval", "Underwriting", "FI (Field Investigation)",
  "FI Negative", "FI Reinitiated", "Query/Hold", "Customer Not Interested - Need Help from MIT & Manager",
  "Customer Not Supporting - Need Help from MIT & Manager", "Approved", "Disbursed", "Not Eligible",
  "Not Login", "Declined", "Not Disbursed"];

const GREEN = new Set(["Approved", "Disbursed", "Login Done", "Documents Collected"]);
const RED = new Set(["Declined", "Not Eligible", "Not Login", "Not Disbursed", "FI Negative"]);
const AMBER = new Set(["Query/Hold", "Documents Pending", "FI Reinitiated", "Underwriting",
  "Customer Not Interested - Need Help from MIT & Manager", "Customer Not Supporting - Need Help from MIT & Manager"]);
const BLUE = new Set(["Sent for Eligibility", "Sent for Login", "Sent for Approval", "Contacted", "FI (Field Investigation)"]);
const STATUS_COLOR = (s) => GREEN.has(s) ? "bg-emerald-50 text-emerald-700 border-emerald-200"
  : RED.has(s) ? "bg-red-50 text-red-700 border-red-200"
  : AMBER.has(s) ? "bg-amber-50 text-amber-700 border-amber-200"
  : BLUE.has(s) ? "bg-blue-50 text-blue-700 border-blue-200"
  : "bg-slate-100 text-slate-600 border-slate-200";

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
        <span data-testid={`proc-status-${f.lead_id}`} className={`text-xs font-medium px-2.5 py-1 rounded-full border text-right ${STATUS_COLOR(f.processing_status || "New")}`}>{f.processing_status || "New"}</span>
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
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    Promise.all([
      api.get("/files/stats").then(({ data }) => setStats(data)),
      api.get("/leads", { params: { status: "FILE", page_size: 200 } }).then(({ data }) => setFiles(data.items)),
    ]).finally(() => setLoading(false));
  }, []);

  const filtered = files.filter((f) => {
    const okS = statusFilter === "ALL" || (f.processing_status || "New") === statusFilter;
    const okQ = !q || `${f.full_name || ""} ${f.phone || ""} ${f.file?.loan_type || ""}`.toLowerCase().includes(q.toLowerCase());
    return okS && okQ;
  });

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

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input data-testid="files-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, loan type..."
              className="w-full border border-slate-300 rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:border-brand bg-white" />
          </div>
          <select data-testid="files-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-brand">
            <option value="ALL">All Statuses</option>
            {PROC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden" data-testid="files-list">
          {loading ? (
            <p className="py-16 text-center text-slate-400 text-sm">Loading files...</p>
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-slate-400 text-sm">No files match your filters.</p>
          ) : filtered.map((f) => <FileRow key={f.lead_id} f={f} onOpen={() => navigate(`/leads/${f.lead_id}`)} />)}
        </div>
      </div>
    </div>
  );
}
