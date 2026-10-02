import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { invoke } from "@tauri-apps/api/core";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useWeeklyReport } from "../hooks/useWeeklyReport";

interface Props {
  intervalMinutes: number;
}

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#eab308";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Needs work";
}

function fmtMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];

export default function ReportPage({ intervalMinutes }: Props) {
  const report = useWeeklyReport(intervalMinutes);
  const reportRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  async function handleShare() {
    if (!reportRef.current) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const dataUrl = await toPng(reportRef.current, { pixelRatio: 2, backgroundColor: "#f9fafb" });
      const base64 = dataUrl.replace("data:image/png;base64,", "");
      const path = await invoke<string>("save_report_to_desktop", { base64Data: base64 });
      setSaveMsg(`Saved: ${path}`);
    } catch (e) {
      setSaveMsg(`Error: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (report.loading) {
    return (
      <main className="flex-1 h-full overflow-auto p-6 bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading report…</p>
      </main>
    );
  }

  const score = report.eyeHealthScore;
  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference * (1 - score / 100);

  return (
    <main className="flex-1 h-full overflow-auto bg-gray-50">
      {/* toolbar */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-800">Weekly Report</h2>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span className={`text-xs ${saveMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
              {saveMsg}
            </span>
          )}
          <button
            onClick={handleShare}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {saving ? "Saving…" : "📸 Share Report"}
          </button>
        </div>
      </div>

      {/* reportable area */}
      <div ref={reportRef} className="p-6 space-y-4 max-w-3xl">

        {/* eye health score + stats row */}
        <div className="grid grid-cols-4 gap-4">
          {/* score gauge */}
          <div className="col-span-1 bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col items-center justify-center">
            <svg width="100" height="100" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="40"
                fill="none"
                stroke={scoreColor(score)}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 50 50)"
                style={{ transition: "stroke-dashoffset 0.8s ease" }}
              />
              <text x="50" y="47" textAnchor="middle" fontSize="20" fontWeight="700" fill={scoreColor(score)}>
                {score}
              </text>
              <text x="50" y="62" textAnchor="middle" fontSize="9" fill="#6b7280">
                /100
              </text>
            </svg>
            <p className="text-xs font-semibold mt-1" style={{ color: scoreColor(score) }}>
              {scoreLabel(score)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Eye Health Score</p>
          </div>

          {/* stat tiles */}
          <div className="col-span-3 grid grid-cols-3 gap-4">
            {[
              { label: "Avg Compliance", value: `${report.avgCompliance}%`, sub: "break compliance" },
              {
                label: "Best Day",
                value: report.bestDay?.label ?? "—",
                sub: report.bestDay ? `${report.bestDay.compliance}% compliance` : "no data",
              },
              {
                label: "Worst Day",
                value: report.worstDay?.label ?? "—",
                sub: report.worstDay ? `${report.worstDay.compliance}% compliance` : "no data",
              },
            ].map((t) => (
              <div key={t.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs text-gray-400">{t.label}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{t.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* screen time line chart */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Daily Screen Time</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={report.days} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(v) => `${Math.floor(v / 60)}h`}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => [fmtMins(Number(v)), "Screen time"]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
              <Line
                type="monotone"
                dataKey="screenMinutes"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#6366f1", strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* break compliance line chart */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Break Compliance</h3>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={report.days} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v) => [`${Number(v)}%`, "Compliance"]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
              <Line
                type="monotone"
                dataKey="compliance"
                stroke="#22c55e"
                strokeWidth={2.5}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  return (
                    <circle
                      key={payload.date}
                      cx={cx} cy={cy} r={4}
                      fill={scoreColor(payload.compliance)}
                      strokeWidth={0}
                    />
                  );
                }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* top 5 apps */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Top Apps This Week</h3>
          {report.topApps.length === 0 ? (
            <p className="text-xs text-gray-400">No session data recorded this week.</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={report.topApps}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `${Math.floor(v / 60)}h${v % 60 > 0 ? ` ${v % 60}m` : ""}`}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 11, fill: "#475569" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 13) + "…" : v}
                />
                <Tooltip
                  formatter={(v) => [fmtMins(Number(v)), "Screen time"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
                <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
                  {report.topApps.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </main>
  );
}
