import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CallModal from "@/components/CallModal";
import { toast } from "sonner";
import { Search, RefreshCw, MapPin, Phone, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";

export const STATUS_STYLES = {
  NEW: "bg-slate-100 text-slate-700 border-slate-200",
  CALL_BACK: "bg-blue-50 text-blue-700 border-blue-200",
  NOT_ANSWERING: "bg-amber-50 text-amber-700 border-amber-200",
  SWITCHED_OFF: "bg-orange-50 text-orange-700 border-orange-200",
  NOT_INTERESTED: "bg-slate-100 text-slate-600 border-slate-200",
  NOT_QUALIFIED: "bg-red-50 text-red-700 border-red-200",
  LEAD: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FILE: "bg-violet-50 text-violet-700 border-violet-200",
};
export const STATUS_LABEL = (s) => (s || "").replace(/_/g, " ");
const STATUSES = ["ALL", "NEW", "CALL_BACK", "NOT_ANSWERING", "SWITCHED_OFF", "NOT_INTERESTED", "NOT_QUALIFIED", "LEAD", "FILE"];

const fmtDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const fmtShort = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
};

export const StatusPill = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status] || STATUS_STYLES.NEW}`}>{STATUS_LABEL(status)}</span>
);

export default function Leads() {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "ops";
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [partners, setPartners] = useState([]);
  const [status, setStatus] = useState("ALL");
  const [q, setQ] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [sortBy, setSortBy] = useState("created_time");
  const [sortDir, setSortDir] = useState("desc");
  const [datePreset, setDatePreset] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { status, partner: partnerFilter, page, page_size: 25, sort_by: sortBy, sort_dir: sortDir };
      if (q) params.q = q;
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      const { data } = await api.get("/leads", { params });
      setLeads(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } finally { setLoading(false); }
  }, [status, q, partnerFilter, page, sortBy, sortDir, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, q, partnerFilter, sortBy, sortDir, fromDate, toDate]);

  const localYMD = (d) => {
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d - off).toISOString().slice(0, 10);
  };
  const applyPreset = (preset) => {
    setDatePreset(preset);
    const today = new Date();
    if (preset === "ALL") { setFromDate(""); setToDate(""); }
    else if (preset === "TODAY") { const t = localYMD(today); setFromDate(t); setToDate(t); }
    else if (preset === "7D") { const s = new Date(today); s.setDate(s.getDate() - 6); setFromDate(localYMD(s)); setToDate(localYMD(today)); }
    else if (preset === "30D") { const s = new Date(today); s.setDate(s.getDate() - 29); setFromDate(localYMD(s)); setToDate(localYMD(today)); }
  };

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("asc"); }
  };
  const SortIcon = ({ field }) =>
    sortBy !== field ? <ChevronsUpDown size={12} className="text-slate-300" />
      : (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />);

  const [selected, setSelected] = useState(new Set());
  const [bulkPartner, setBulkPartner] = useState("");
  const [callLead, setCallLead] = useState(null);
  const logCallFor = async (payload) => { await api.post(`/leads/${callLead.lead_id}/calls`, payload); toast.success("Call logged"); load(); };
  useEffect(() => { setSelected(new Set()); }, [page, status, q, partnerFilter, sortBy, sortDir, fromDate, toDate]);
  const toggleOne = (id) => { const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s); };
  const allOnPage = leads.length > 0 && leads.every((l) => selected.has(l.lead_id));
  const toggleAll = () => {
    const s = new Set(selected);
    allOnPage ? leads.forEach((l) => s.delete(l.lead_id)) : leads.forEach((l) => s.add(l.lead_id));
    setSelected(s);
  };
  const doBulkAssign = async () => {
    try {
      const { data } = await api.post("/leads/bulk-assign", { lead_ids: [...selected], partner_id: bulkPartner || null });
      toast.success(`${data.modified} lead${data.modified === 1 ? "" : "s"} updated`);
      setSelected(new Set()); setBulkPartner(""); load();
    } catch (e) { toast.error("Bulk assign failed"); }
  };
  const doBulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.size} lead(s)? They will be removed from all lists and reports.`)) return;
    try {
      const { data } = await api.post("/leads/bulk-delete", { lead_ids: [...selected] });
      toast.success(`${data.deleted} lead${data.deleted === 1 ? "" : "s"} deleted`);
      setSelected(new Set()); load();
    } catch (e) { toast.error("Delete failed"); }
  };
  useEffect(() => {
    if (isStaff) api.get("/partners").then(({ data }) => setPartners(data)).catch(() => {});
  }, [isStaff]);

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/leads/sync");
      toast.success(`Synced: ${data.imported} new, ${data.updated} updated`);
      await load();
    } catch (e) { toast.error("Sync failed"); } finally { setSyncing(false); }
  };

  const assign = async (leadId, partnerId, e) => {
    e.stopPropagation();
    try {
      await api.patch(`/leads/${leadId}/assign`, { partner_id: partnerId || null });
      toast.success("Assignment updated");
      load();
    } catch (err) { toast.error("Failed to assign"); }
  };

  return (
    <div>
      <header className="h-16 border-b border-border bg-white px-8 flex items-center justify-between sticky top-0 z-30">
        <h1 className="text-xl font-heading font-bold text-brand-dark">Leads</h1>
        <button data-testid="leads-sync-btn" onClick={sync} disabled={syncing}
          className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 rounded-md px-4 py-2 text-sm shadow-sm font-medium transition-colors disabled:opacity-70">
          <RefreshCw size={16} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </header>

      <div className="p-6 lg:p-8">
        {callLead && <CallModal phone={callLead.phone} onClose={() => setCallLead(null)} onSubmit={logCallFor} />}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input data-testid="leads-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, city..."
              className="w-full border border-slate-300 rounded-md pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-colors bg-white" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {STATUSES.map((s) => (
              <button key={s} data-testid={`status-filter-${s}`} onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${status === s ? "bg-brand text-white border-brand" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{s === "ALL" ? "ALL" : STATUS_LABEL(s)}</button>
            ))}
          </div>
          {isStaff && (
            <select data-testid="partner-filter" value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-brand">
              <option value="ALL">All Partners</option>
              <option value="UNASSIGNED">Unassigned</option>
              {partners.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-5" data-testid="date-filter-bar">
          <span className="text-xs font-medium text-slate-500 mr-1">Date:</span>
          {[
            { k: "ALL", label: "All time" },
            { k: "TODAY", label: "Today" },
            { k: "7D", label: "Last 7 days" },
            { k: "30D", label: "Last 30 days" },
          ].map(({ k, label }) => (
            <button key={k} data-testid={`date-preset-${k}`} onClick={() => applyPreset(k)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${datePreset === k ? "bg-brand text-white border-brand" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{label}</button>
          ))}
          <div className="flex items-center gap-1.5 ml-1">
            <input type="date" data-testid="date-from-input" value={fromDate}
              onChange={(e) => { setDatePreset("CUSTOM"); setFromDate(e.target.value); }}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white outline-none focus:border-brand" />
            <span className="text-slate-400 text-xs">to</span>
            <input type="date" data-testid="date-to-input" value={toDate}
              onChange={(e) => { setDatePreset("CUSTOM"); setToDate(e.target.value); }}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white outline-none focus:border-brand" />
          </div>
        </div>
        {isStaff && selected.size > 0 && (
          <div className="flex items-center gap-3 mb-3 bg-brand/5 border border-brand/20 rounded-md px-4 py-2.5" data-testid="bulk-action-bar">
            <span className="text-sm font-medium text-brand-dark" data-testid="bulk-selected-count">{selected.size} selected</span>
            <select data-testid="bulk-partner-select" value={bulkPartner} onChange={(e) => setBulkPartner(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white outline-none focus:border-brand">
              <option value="">Unassign</option>
              {partners.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
            </select>
            <button data-testid="bulk-assign-btn" onClick={doBulkAssign}
              className="bg-brand text-white hover:bg-brand/90 rounded-md px-4 py-1.5 text-sm font-medium transition-colors">Apply</button>
            {user?.role === "admin" && (
              <button data-testid="bulk-delete-btn" onClick={doBulkDelete}
                className="bg-red-600 text-white hover:bg-red-700 rounded-md px-4 py-1.5 text-sm font-medium transition-colors">Delete</button>
            )}
            <button data-testid="bulk-clear-btn" onClick={() => setSelected(new Set())}
              className="text-slate-500 text-sm hover:text-slate-700 transition-colors">Clear</button>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  {isStaff && (
                    <th className="py-3 px-3 w-10">
                      <input type="checkbox" data-testid="select-all-checkbox" checked={allOnPage} onChange={toggleAll} className="accent-[#0F52BA] cursor-pointer" />
                    </th>
                  )}
                  {[
                    { h: "Date", f: "created_time" },
                    { h: "Name", f: "full_name" },
                    { h: "Contact", f: null },
                    { h: "City", f: "city" },
                    { h: "Employment", f: null },
                    { h: "Salary", f: null },
                    { h: "Outstanding", f: null },
                    { h: "Status", f: "status" },
                    { h: "Partner", f: null },
                  ].map(({ h, f }) => (
                    <th key={h} className="text-xs font-semibold uppercase tracking-wider text-slate-500 py-3 px-3 text-left">
                      {f ? (
                        <button data-testid={`sort-${f}`} onClick={() => toggleSort(f)} className="inline-flex items-center gap-1 hover:text-brand transition-colors">
                          {h} <SortIcon field={f} />
                        </button>
                      ) : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody data-testid="leads-table-body">
                {loading ? (
                  <tr><td colSpan={isStaff ? 10 : 9} className="py-16 text-center text-slate-400 text-sm">Loading leads...</td></tr>
                ) : leads.length === 0 ? (
                  <tr><td colSpan={isStaff ? 10 : 9} className="py-16 text-center text-slate-400 text-sm">No leads found. Sync with Google Sheets to import data.</td></tr>
                ) : leads.map((lead) => (
                  <tr key={lead.lead_id} data-testid={`lead-row-${lead.lead_id}`} onClick={() => navigate(`/leads/${lead.lead_id}`)}
                    className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors cursor-pointer">
                    {isStaff && (
                      <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" data-testid={`row-checkbox-${lead.lead_id}`} checked={selected.has(lead.lead_id)} onChange={() => toggleOne(lead.lead_id)} className="accent-[#0F52BA] cursor-pointer" />
                      </td>
                    )}
                    <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap" data-testid={`lead-date-${lead.lead_id}`}>{fmtDate(lead.created_time || lead.created_at)}</td>
                    <td className="py-2.5 px-3">
                      <p className="text-sm font-medium text-slate-800">{lead.full_name || "—"}</p>
                      <p className="text-xs text-slate-400">{lead.campaign_name?.slice(0, 28)}</p>
                    </td>
                    <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <a data-testid={`call-link-${lead.lead_id}`} href={`tel:${lead.phone}`} onClick={() => setCallLead(lead)}
                          className="h-7 w-7 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center transition-colors shrink-0" title="Call">
                          <Phone size={14} />
                        </a>
                        <div>
                          <a data-testid={`call-number-${lead.lead_id}`} href={`tel:${lead.phone}`} onClick={() => setCallLead(lead)} className="text-sm text-brand hover:underline">{lead.phone}</a>
                          <p className="text-xs text-slate-400">{lead.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-sm text-slate-600"><span className="inline-flex items-center gap-1"><MapPin size={12} className="text-slate-400" />{lead.city || "—"}</span></td>
                    <td className="py-2.5 px-3 text-xs text-slate-600">{lead.employment_status || "—"}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-600">{lead.monthly_salary || "—"}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-600">{lead.outstanding_amount || "—"}</td>
                    <td className="py-2.5 px-3"><StatusPill status={lead.status} /></td>
                    <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                      {isStaff ? (
                        <select data-testid={`assign-select-${lead.lead_id}`} value={lead.assigned_partner_id || ""}
                          onChange={(e) => assign(lead.lead_id, e.target.value, e)}
                          className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white outline-none focus:border-brand max-w-[160px]">
                          <option value="">Unassigned</option>
                          {partners.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs text-slate-500">{lead.assigned_partner_name || "—"}</span>
                      )}
                      {lead.assigned_partner_id && lead.assigned_by && (
                        <p data-testid={`assign-history-${lead.lead_id}`} className="text-[10px] text-slate-400 mt-1">
                          by {lead.assigned_by}{lead.assigned_at ? ` · ${fmtShort(lead.assigned_at)}` : ""}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-slate-100" data-testid="leads-card-list">
            {loading ? (
              <div className="py-16 text-center text-slate-400 text-sm">Loading leads...</div>
            ) : leads.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">No leads found. Sync with Google Sheets to import data.</div>
            ) : leads.map((lead) => (
              <div key={lead.lead_id} data-testid={`lead-card-${lead.lead_id}`} onClick={() => navigate(`/leads/${lead.lead_id}`)}
                className="p-4 active:bg-slate-50 transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    {isStaff && (
                      <input type="checkbox" data-testid={`row-checkbox-m-${lead.lead_id}`} checked={selected.has(lead.lead_id)}
                        onClick={(e) => e.stopPropagation()} onChange={() => toggleOne(lead.lead_id)}
                        className="accent-[#0F52BA] cursor-pointer mt-1 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{lead.full_name || "—"}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><MapPin size={11} className="text-slate-400" />{lead.city || "—"}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusPill status={lead.status} />
                    <span className="text-[11px] text-slate-400 whitespace-nowrap" data-testid={`lead-date-m-${lead.lead_id}`}>{fmtDate(lead.created_time || lead.created_at)}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <a data-testid={`call-link-m-${lead.lead_id}`} href={`tel:${lead.phone}`} onClick={() => setCallLead(lead)}
                    className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center transition-colors shrink-0" title="Call">
                    <Phone size={15} />
                  </a>
                  <div className="min-w-0">
                    <a href={`tel:${lead.phone}`} onClick={() => setCallLead(lead)} className="text-sm text-brand hover:underline block">{lead.phone}</a>
                    <p className="text-xs text-slate-400 truncate">{lead.email}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 rounded-md py-1.5 px-1">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Employment</p>
                    <p className="text-[11px] text-slate-700 leading-tight mt-0.5">{lead.employment_status || "—"}</p>
                  </div>
                  <div className="bg-slate-50 rounded-md py-1.5 px-1">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Salary</p>
                    <p className="text-[11px] text-slate-700 leading-tight mt-0.5">{lead.monthly_salary || "—"}</p>
                  </div>
                  <div className="bg-slate-50 rounded-md py-1.5 px-1">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Outstanding</p>
                    <p className="text-[11px] text-slate-700 leading-tight mt-0.5">{lead.outstanding_amount || "—"}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                  <span className="text-[11px] text-slate-400 shrink-0">Partner</span>
                  <div className="flex flex-col items-end min-w-0">
                    {isStaff ? (
                      <select data-testid={`assign-select-m-${lead.lead_id}`} value={lead.assigned_partner_id || ""}
                        onChange={(e) => assign(lead.lead_id, e.target.value, e)}
                        className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white outline-none focus:border-brand max-w-[180px]">
                        <option value="">Unassigned</option>
                        {partners.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-slate-600">{lead.assigned_partner_name || "—"}</span>
                    )}
                    {lead.assigned_partner_id && lead.assigned_by && (
                      <p data-testid={`assign-history-m-${lead.lead_id}`} className="text-[10px] text-slate-400 mt-1">
                        by {lead.assigned_by}{lead.assigned_at ? ` · ${fmtShort(lead.assigned_at)}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm">
            <span className="text-slate-500" data-testid="leads-count-label">
              {total} lead{total === 1 ? "" : "s"}{pages > 1 ? ` · page ${page} of ${pages}` : ""}
            </span>
            <div className="flex items-center gap-2">
              <button data-testid="prev-page-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft size={14} /> Prev
              </button>
              <button data-testid="next-page-btn" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
