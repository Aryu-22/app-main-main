import { useEffect, useState } from "react";
import { endpoints } from "../lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Area, AreaChart, Legend
} from "recharts";
import { Activity, AlertCircle, Info, Sparkles, ShieldCheck } from "lucide-react";

const COLORS = ["#00E5FF", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#22D3EE"];

const tooltipStyle = {
  backgroundColor: "#0B1220",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  color: "#F8FAFC",
  fontSize: 12,
  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)"
};

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    endpoints.analytics()
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <main className="mx-auto max-w-7xl px-4 lg:px-8 py-20 text-center" data-testid="analytics-page">
        <div className="text-4xl mb-4">⚡</div>
        <h2 className="text-xl font-bold text-white mb-2">Unable to load analytics deck</h2>
        <p className="text-slate-400 text-sm mb-6 max-w-sm mx-auto">
          The analytics pipeline could not be reached. Ensure the backend service is running and accessible.
        </p>
        <button
          onClick={() => { setError(false); endpoints.analytics().then(setData).catch(() => setError(true)); }}
          className="rounded-lg bg-cyan-400 text-slate-950 px-5 py-2.5 text-sm font-semibold hover:bg-cyan-300 transition-colors"
        >
          Retry Connection
        </button>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-7xl px-4 lg:px-8 py-20 text-center" data-testid="analytics-page">
        <div className="inline-block w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-sm">Loading Delhi safety analytics deck…</p>
      </main>
    );
  }

  const totalIncidents = data.by_type.reduce((a, b) => a + b.count, 0);
  const peakHour = data.by_hour.reduce((a, b) => (b.count > a.count ? b : a), { count: 0 });
  const topCrime = data.by_type[0];
  const topArea = data.by_area[0];

  return (
    <main className="mx-auto max-w-7xl px-4 lg:px-8 py-10" data-testid="analytics-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            03 / analytics &amp; diagnostics
          </div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Delhi Crime Analytics &amp; Risk Deck
          </h1>
          <p className="mt-2 text-slate-400 text-sm max-w-2xl">
            Spatio-temporal incident distribution and risk pattern diagnostics across the National Capital Territory of Delhi.
            All charts compute dynamically from the backend analytics engine.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 text-cyan-300 text-xs font-mono">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>NCT OF DELHI JURISDICTION</span>
        </div>
      </div>

      {/* Distinction Banner: Historical Data vs Predicted Risk */}
      <div className="mt-6 rounded-xl border border-cyan-400/25 bg-[#0F172A] p-4 flex items-start gap-3 text-xs leading-relaxed">
        <Info className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div className="text-slate-300">
          <strong className="text-white">Dual-Tier Data Architecture:</strong> Charts below visualize{" "}
          <span className="text-cyan-300 font-medium">Historical Incident Distributions</span> provided by the active backend data pipeline.{" "}
          The upcoming <span className="text-emerald-300 font-medium">Predictive Spatial Risk Engine</span> for Delhi ward-level forecasting will be dynamically calibrated upon ingestion of the official Delhi dataset.
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        <KPI title="Total Reported Incidents" value={totalIncidents.toLocaleString()} accent="#00E5FF" testId="kpi-incidents" />
        <KPI title="Peak Incident Hour" value={`${String(peakHour.hour).padStart(2, "0")}:00 hrs`} accent="#F59E0B" sub={`${peakHour.count.toLocaleString()} occurrences`} testId="kpi-peak-hour" />
        <KPI title="Dominant Crime Type" value={topCrime?.type ?? "Theft"} accent="#EF4444" sub={`${topCrime?.count.toLocaleString()} events`} testId="kpi-top-crime" />
        <KPI title="High-Activity Sector" value={topArea?.area ?? "Central Delhi"} accent="#8B5CF6" sub={`${topArea?.count.toLocaleString()} events`} testId="kpi-top-area" />
      </div>

      {/* Charts Grid */}
      <div className="grid lg:grid-cols-2 gap-5 mt-8">
        <ChartCard title="Crime Type Distribution" subtitle="Aggregated occurrences grouped by primary category" testId="chart-by-type">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data.by_type} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="type" stroke="#94A3B8" fontSize={11} angle={-30} textAnchor="end" height={60} />
              <YAxis stroke="#94A3B8" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,229,255,0.08)" }} />
              <Bar dataKey="count" fill="#00E5FF" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Diurnal Hourly Curve (24-Hour Cycle)" subtitle="When urban transit corridors require elevated vigilance" testId="chart-by-hour">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={data.by_hour} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <defs>
                <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="hour" stroke="#94A3B8" fontSize={11} />
              <YAxis stroke="#94A3B8" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="count" stroke="#F59E0B" strokeWidth={2} fill="url(#hourGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Day-of-Week Trend" subtitle="Weekday vs weekend crime incidence analysis" testId="chart-by-day">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data.by_day} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="day" stroke="#94A3B8" fontSize={11} />
              <YAxis stroke="#94A3B8" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="count" stroke="#10B981" strokeWidth={3} dot={{ r: 5, fill: "#10B981" }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Area &amp; Sector Density Profile" subtitle="Relative incident concentrations by zone category" testId="chart-by-area">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data.by_area} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" stroke="#94A3B8" fontSize={11} />
              <YAxis dataKey="area" type="category" stroke="#94A3B8" fontSize={11} width={100} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(239,68,68,0.08)" }} />
              <Bar dataKey="count" fill="#EF4444" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Weekend vs Weekday Split" subtitle="Commuter &amp; nightlife behavioral patterns" testId="chart-weekend">
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={data.weekend_split}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={4}
                label
              >
                {data.weekend_split.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12, color: "#94A3B8" }} />
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Seasonal Volume Trajectory" subtitle="Rolling incident volume across seasonal quarters" testId="chart-monthly">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={data.monthly}>
              <defs>
                <linearGradient id="mGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00E5FF" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#00E5FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" stroke="#94A3B8" fontSize={11} />
              <YAxis stroke="#94A3B8" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="count" stroke="#00E5FF" strokeWidth={2.5} fill="url(#mGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </main>
  );
}

function KPI({ title, value, sub, accent, testId }) {
  return (
    <div data-testid={testId} className="rounded-xl border border-white/10 bg-[#0F1422] p-4 relative overflow-hidden shadow-lg">
      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-mono">{title}</div>
      <div className="mt-2 text-2xl font-extrabold text-white break-words">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 font-mono mt-1">{sub}</div>}
      <div className="absolute right-3 top-3 w-2.5 h-2.5 rounded-full" style={{ background: accent, boxShadow: `0 0 12px ${accent}` }} />
    </div>
  );
}

function ChartCard({ title, subtitle, children, testId }) {
  return (
    <div data-testid={testId} className="rounded-2xl border border-white/10 bg-[#0F1422] p-5 shadow-xl">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-sm font-bold text-white">{title}</div>
          <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  );
}
