import React, { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { BarChart3, FolderOpen, Clock, LogIn, CheckCircle2, DollarSign, AlertTriangle, TrendingUp, Download } from "lucide-react";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const Card = ({ label, value, sub, icon: Icon, accent }) => (
  <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <div className={`h-8 w-8 rounded-md flex items-center justify-center ${accent}`}><Icon size={16} /></div>
    </div>
    <p className="text-2xl font-heading font-semibold text-brand-dark mt-2">{value}</p>
    {sub !== undefined && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
  </div>
);

export default function FileReports() {
  const { user } = useAuth();
  const isAdminOps = user?.role === "admin" || user?.role === "ops";
  const [data, setData] = useState(null);
  const [partners, setPartners] = useState([]);
  const [processors, setProcessors] = useState([]);
  const [f, setF] = useState({ from_date: "", to_date: "", partner: "ALL", processor: "ALL" });
  const [workload, setWorkload] = useState([]);

  const exportCsv = async () => {
    const params = {};
    Object.entries(f).forEach(([k, v]) => { if (v && v !== "ALL") params[k] = v; });
    const res = await api.get("/files/report/export", { params, responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a"); a.href = url; a.download = "file_report.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const load = useCallback(async () => {
    const params = {};
    Object.entries(f).forEach(([k, v]) => { if (v && v !== "ALL") params[k] = v; });
    const { data } = await api.get("/files/report", { params });
    setData(data);
  }, [f]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (user?.role === "admin") api.get("/partners").then(({ data }) => setPartners(data)).catch(() => {});
    if (isAdminOps || user?.role === "processor") api.get("/processors").then(({ data }) => setProcessors(data)).catch(() => {});
    if (isAdminOps) api.get("/processors/workload").then(({ data }) => setWorkload(data)).catch(() => {});
  }, [user, isAdminOps]);

  const o = data?.overall;
  const m = data?.this_month;
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div>
      <header className="h-16 border-b border-border bg-white px-4 md:px-8 flex items-center gap-2 sticky top-0 z-30">
        <BarChart3 size={20} className="text-brand" />
        <h1 className="text-xl font-heading font-bold text-brand-dark">File Reports</h1>
        <button data-testid="export-csv-btn" onClick={exportCsv}
          className="ml-auto bg-brand text-white hover:bg-brand/90 rounded-md px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1">
          <Download size={15} /> Export CSV
        </button>
      </header>

      <div className="p-4 md:p-8">
        <div className="flex flex-wrap items-end gap-3 mb-6">
          <div>
            <label className="text-xs text-slate-500">From (File date)</label>
            <input data-testid="report-from" type="date" value={f.from_date} onChange={upd("from_date")} className="mt-1 block border border-slate-300 rounded-md px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label className="text-xs text-slate-500">To (File date)</label>
            <input data-testid="report-to" type="date" value={f.to_date} onChange={upd("to_date")} className="mt-1 block border border-slate-300 rounded-md px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          {user?.role === "admin" && (
            <div>
              <label className="text-xs text-slate-500">Growth Partner</label>
              <select data-testid="report-partner" value={f.partner} onChange={upd("partner")} className="mt-1 block border border-slate-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-brand">
                <option value="ALL">All Partners</option>
                {partners.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {isAdminOps && (
            <div>
              <label className="text-xs text-slate-500">Processor</label>
              <select data-testid="report-processor" value={f.processor} onChange={upd("processor")} className="mt-1 block border border-slate-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-brand">
                <option value="ALL">All Processors</option>
                {processors.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {!o ? <p className="text-slate-400 text-sm">Loading...</p> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card label="Total Files" value={o.total_files} icon={FolderOpen} accent="bg-violet-50 text-violet-600" />
              <Card label="In Progress" value={o.in_progress} icon={Clock} accent="bg-amber-50 text-amber-600" />
              <Card label="Login Done" value={o.login} icon={LogIn} accent="bg-blue-50 text-blue-600" />
              <Card label="Approved" value={o.approved} sub={inr(o.approved_amount)} icon={CheckCircle2} accent="bg-emerald-50 text-emerald-600" />
              <Card label="Disbursed" value={o.disbursed} sub={inr(o.disbursed_amount)} icon={DollarSign} accent="bg-emerald-50 text-emerald-700" />
              <Card label="Rejected" value={o.rejected} icon={AlertTriangle} accent="bg-red-50 text-red-600" />
              <Card label="Amt in Pipeline" value={inr(o.pipeline_amount)} icon={TrendingUp} accent="bg-blue-50 text-blue-600" />
              <Card label="Total Disbursed" value={inr(o.disbursed_amount)} icon={DollarSign} accent="bg-emerald-50 text-emerald-700" />
            </div>

            <div className="mt-8">
              <h3 className="text-sm font-semibold text-brand-dark mb-3">This Month</h3>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" data-testid="report-this-month">
                <Card label="New Files" value={m.total_files} icon={FolderOpen} accent="bg-violet-50 text-violet-600" />
                <Card label="Login Done" value={m.login} icon={LogIn} accent="bg-blue-50 text-blue-600" />
                <Card label="Approved" value={m.approved} sub={inr(m.approved_amount)} icon={CheckCircle2} accent="bg-emerald-50 text-emerald-600" />
                <Card label="Disbursed" value={m.disbursed} sub={inr(m.disbursed_amount)} icon={DollarSign} accent="bg-emerald-50 text-emerald-700" />
                <Card label="Rejected" value={m.rejected} icon={AlertTriangle} accent="bg-red-50 text-red-600" />
              </div>
            </div>

            {isAdminOps && workload.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-brand-dark mb-3">Processor Workload</h3>
                <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-x-auto">
                  <table className="w-full border-collapse" data-testid="workload-table">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200">
                        {["Processor", "Total Files", "In Progress", "Login", "Approved", "Disbursed"].map((h) => (
                          <th key={h} className="text-xs font-semibold uppercase tracking-wider text-slate-500 py-3 px-3 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {workload.map((w) => (
                        <tr key={w.user_id} className="border-b border-slate-100" data-testid={`workload-${w.user_id}`}>
                          <td className="py-2.5 px-3 text-sm font-medium text-slate-800">{w.name}</td>
                          <td className="py-2.5 px-3 text-sm font-semibold text-brand-dark">{w.total}</td>
                          <td className="py-2.5 px-3 text-sm text-amber-600">{w.in_progress}</td>
                          <td className="py-2.5 px-3 text-sm text-blue-600">{w.login}</td>
                          <td className="py-2.5 px-3 text-sm text-emerald-600">{w.approved}</td>
                          <td className="py-2.5 px-3 text-sm text-emerald-700">{w.disbursed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
