import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { RefreshCw, Users2, UserCheck, TrendingUp, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";

const STATUS_COLORS = {
  NEW: "#64748b", CALL_BACK: "#3b82f6", NOT_ANSWERING: "#f59e0b", SWITCHED_OFF: "#fb923c",
  NOT_INTERESTED: "#94a3b8", NOT_QUALIFIED: "#dc2626", LEAD: "#22c55e", FILE: "#7c3aed",
};

const MetricCard = ({ label, value, icon: Icon, accent, delay }) => (
  <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <div className={`h-9 w-9 rounded-md flex items-center justify-center ${accent}`}><Icon size={18} /></div>
    </div>
    <p className="text-3xl font-heading font-semibold tracking-tight text-brand-dark mt-3">{value}</p>
  </div>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    const { data } = await api.get("/leads/stats");
    setStats(data);
  };

  useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/leads/sync");
      toast.success(`Synced: ${data.imported} new, ${data.updated} updated`);
      await load();
    } catch (e) {
      toast.error("Sync failed");
    } finally { setSyncing(false); }
  };

  if (!stats) {
    return <div className="p-8"><div className="h-8 w-8 rounded-full border-2 border-brand border-t-transparent animate-spin" /></div>;
  }

  const statusData = Object.entries(stats.by_status).map(([name, value]) => ({ name, value }));
  const lastSync = stats.last_sync?.at ? new Date(stats.last_sync.at).toLocaleString() : "Never";

  return (
    <div>
      <header className="h-16 border-b border-border bg-white px-8 flex items-center justify-between sticky top-0 z-30">
        <div>
          <h1 className="text-xl font-heading font-bold text-brand-dark">Dashboard</h1>
        </div>
        <button data-testid="sync-sheet-btn" onClick={sync} disabled={syncing}
          className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 rounded-md px-4 py-2 text-sm shadow-sm font-medium transition-colors disabled:opacity-70">
          <RefreshCw size={16} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </header>

      <div className="p-6 lg:p-8">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-6">
          <Clock size={14} /> Last Google Sheet sync: <span className="font-medium text-slate-700" data-testid="last-sync-time">{lastSync}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard label="Total Leads" value={stats.total} icon={Users2} accent="bg-blue-50 text-brand" delay={0} />
          <MetricCard label="Files" value={stats.by_status.FILE} icon={TrendingUp} accent="bg-violet-50 text-violet-600" delay={60} />
          <MetricCard label="In Progress" value={stats.by_status.CALL_BACK + stats.by_status.LEAD} icon={UserCheck} accent="bg-amber-50 text-amber-600" delay={120} />
          {user?.role === "admin" && <MetricCard label="Unassigned" value={stats.unassigned} icon={Users2} accent="bg-slate-100 text-slate-600" delay={180} />}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-md p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-dark mb-4">Leads by City (Top)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats.by_city}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="city" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0" }} />
                <Bar dataKey="count" fill="#0F52BA" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-dark mb-4">Pipeline Breakdown</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                  {statusData.map((e) => <Cell key={e.name} fill={STATUS_COLORS[e.name]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {statusData.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[s.name] }} />{s.name}</span>
                  <span className="font-semibold text-slate-700">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
