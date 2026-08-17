import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { StatusPill } from "@/pages/Leads";
import { FolderOpen, FileCheck2, FileClock, MapPin } from "lucide-react";

const StatCard = ({ label, value, icon: Icon, accent }) => (
  <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <div className={`h-9 w-9 rounded-md flex items-center justify-center ${accent}`}><Icon size={18} /></div>
    </div>
    <p className="text-3xl font-heading font-semibold tracking-tight text-brand-dark mt-3">{value}</p>
  </div>
);

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
      <header className="h-16 border-b border-border bg-white px-8 flex items-center gap-2 sticky top-0 z-30">
        <FolderOpen size={20} className="text-violet-600" />
        <h1 className="text-xl font-heading font-bold text-brand-dark">Files & Conversions</h1>
      </header>

      <div className="p-6 lg:p-8">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <StatCard label="Total Files" value={stats?.total_files ?? "—"} icon={FolderOpen} accent="bg-violet-50 text-violet-600" />
          <StatCard label="Docs Received" value={stats?.docs_received ?? "—"} icon={FileCheck2} accent="bg-emerald-50 text-emerald-600" />
          <StatCard label="Docs Pending" value={stats?.pending_docs ?? "—"} icon={FileClock} accent="bg-amber-50 text-amber-600" />
        </div>

        <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  {["Customer", "Contact", "City", "Loan", "Docs", "Status"].map((h) => (
                    <th key={h} className="text-xs font-semibold uppercase tracking-wider text-slate-500 py-3 px-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody data-testid="files-table-body">
                {loading ? (
                  <tr><td colSpan={6} className="py-16 text-center text-slate-400 text-sm">Loading files...</td></tr>
                ) : files.length === 0 ? (
                  <tr><td colSpan={6} className="py-16 text-center text-slate-400 text-sm">No files yet. Mark a call as "File" to open a loan file.</td></tr>
                ) : files.map((f) => (
                  <tr key={f.lead_id} data-testid={`file-row-${f.lead_id}`} onClick={() => navigate(`/leads/${f.lead_id}`)}
                    className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors cursor-pointer">
                    <td className="py-2.5 px-3 text-sm font-medium text-slate-800">{f.full_name || "—"}</td>
                    <td className="py-2.5 px-3"><p className="text-sm text-slate-700">{f.phone}</p><p className="text-xs text-slate-400">{f.email}</p></td>
                    <td className="py-2.5 px-3 text-sm text-slate-600"><span className="inline-flex items-center gap-1"><MapPin size={12} className="text-slate-400" />{f.city || "—"}</span></td>
                    <td className="py-2.5 px-3 text-sm text-slate-600">{f.file?.loan_type || "—"}{f.file?.loan_amount ? ` · ₹${f.file.loan_amount}` : ""}</td>
                    <td className="py-2.5 px-3">
                      {f.docs_received
                        ? <span className="text-xs font-medium text-emerald-700">Received</span>
                        : <span className="text-xs font-medium text-amber-700">Pending</span>}
                    </td>
                    <td className="py-2.5 px-3"><StatusPill status={f.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
