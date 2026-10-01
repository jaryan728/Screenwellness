import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useDashboardData, type AppUsage } from "../hooks/useDashboardData";
import { useWindowTracker } from "../hooks/useWindowTracker";
import { useGamification } from "../hooks/useGamification";
import { useState } from "react";

// ── categorisation ────────────────────────────────────────────────────────────
const WORK_KEYWORDS = [
  "code", "visual studio", "cursor", "intellij", "webstorm", "rider",
  "chrome", "firefox", "edge", "msedge", "brave", "safari",
  "terminal", "windowsterminal", "powershell", "pwsh", "cmd", "bash",
  "node", "cargo", "git", "python",
  "teams", "slack", "zoom", "outlook", "word", "excel", "powerpoint",
  "notion", "obsidian", "figma",
];

function isWorkApp(name: string): boolean {
  const lower = name.toLowerCase();
  return WORK_KEYWORDS.some((k) => lower.includes(k));
}

// ── emoji icons ───────────────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  chrome: "🌐", firefox: "🦊", msedge: "🌐", edge: "🌐", brave: "🦁",
  code: "💻", "visual studio": "💻", cursor: "💻", intellij: "🧠",
  terminal: "⬛", windowsterminal: "⬛", powershell: "💙", cmd: "⬛",
  teams: "💬", slack: "💬", zoom: "📹", outlook: "📧",
  word: "📄", excel: "📊", powerpoint: "📽️",
  figma: "🎨", notion: "📓", obsidian: "🔮",
  node: "⚙️", cargo: "🦀", python: "🐍", git: "🔀",
  screenwellness: "🌿", explorer: "📁",
};

function appIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return name.charAt(0).toUpperCase();
}

// ── formatting helpers ────────────────────────────────────────────────────────
function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
  return `${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
}

// ── custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: AppUsage }[] }) {
  if (!active || !payload?.length) return null;
  const { appName, totalSeconds } = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-sm">
      <p className="font-semibold text-gray-800">{appName}</p>
      <p className="text-gray-500">{fmtDuration(totalSeconds)}</p>
    </div>
  );
}

// ── filter type ───────────────────────────────────────────────────────────────
type Filter = "all" | "work" | "other";

// ── main component ────────────────────────────────────────────────────────────
export default function MainContent() {
  const { totalSeconds, appUsages, lastRefreshed, refresh } = useDashboardData(30_000);
  const { currentApp, timeOnApp } = useWindowTracker();
  const { todayPoints, streak, badges } = useGamification(15_000);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = appUsages.filter((a) => {
    if (filter === "work") return isWorkApp(a.appName);
    if (filter === "other") return !isWorkApp(a.appName);
    return true;
  });

  const top3 = [...appUsages].slice(0, 3);

  const WORK_COLOR = "#6366f1";
  const OTHER_COLOR = "#f59e0b";

  return (
    <main className="flex-1 h-full overflow-auto p-6 bg-gray-50">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={refresh}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            title="Refresh now"
          >
            ↻ Refresh
          </button>
          <span className="text-xs text-gray-400">
            Updated {lastRefreshed.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* ── points / streak banner ── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="rounded-xl p-4 flex items-center gap-4" style={{ background: "#6366f1" }}>
          <div className="text-white">
            <p className="text-xs font-medium opacity-70 uppercase tracking-wider">Today's Points</p>
            <p className="text-3xl font-bold tabular-nums">{todayPoints}</p>
          </div>
          <div className="ml-auto text-right text-white opacity-60 text-xs leading-relaxed">
            <p>+10 per break</p>
            <p>+20 wind-down</p>
            <p>+30 rec. limit</p>
          </div>
        </div>
        <div className="rounded-xl p-4 flex items-center gap-4" style={{ background: "#f59e0b" }}>
          <div className="text-white">
            <p className="text-xs font-medium opacity-70 uppercase tracking-wider">Streak</p>
            <p className="text-3xl font-bold tabular-nums">
              {streak} <span className="text-base font-normal">day{streak !== 1 ? "s" : ""}</span>
            </p>
          </div>
          <span className="ml-auto text-4xl">{streak >= 7 ? "🔥" : streak >= 3 ? "⚡" : "💧"}</span>
        </div>
      </div>

      {/* ── stat cards ── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
            Total Today
          </p>
          <p className="text-2xl font-bold text-gray-800">
            {fmtDuration(totalSeconds) || "—"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
            Active App
          </p>
          <p className="text-base font-semibold text-gray-800 truncate" title={currentApp}>
            {appIcon(currentApp)} {currentApp}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
            Time on App
          </p>
          <p className="text-base font-semibold text-indigo-600 tabular-nums">
            {fmtTime(timeOnApp)}
          </p>
        </div>
      </div>

      {/* ── top 3 ── */}
      {top3.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Top Apps Today
          </p>
          <div className="flex gap-6">
            {top3.map((app, i) => (
              <div key={app.appName} className="flex items-center gap-2">
                <span className="text-lg">{appIcon(app.appName)}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800 leading-tight">
                    {["🥇", "🥈", "🥉"][i]} {app.appName}
                  </p>
                  <p className="text-xs text-gray-500">{fmtDuration(app.totalSeconds)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── badges ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Badges</p>
        <div className="flex gap-4">
          {badges.map((badge) => (
            <div
              key={badge.id}
              title={badge.earnedAt ? `Earned ${new Date(badge.earnedAt).toLocaleDateString()}` : "Locked"}
              className={`flex flex-col items-center p-3 rounded-xl border flex-1 text-center transition-opacity ${
                badge.earnedAt
                  ? "border-indigo-200 bg-indigo-50"
                  : "border-gray-100 bg-gray-50 opacity-35"
              }`}
            >
              <span className="text-2xl mb-1">{badge.icon}</span>
              <p className="text-xs font-semibold text-gray-700 leading-tight">{badge.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{badge.description}</p>
              {badge.earnedAt && (
                <span className="mt-1 text-xs text-indigo-500 font-medium">Earned ✓</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── bar chart ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Time per App
          </p>
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-medium">
            {(["all", "work", "other"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 transition-colors ${
                  filter === f
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-gray-500 hover:bg-gray-50"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: WORK_COLOR }} />
              Work
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: OTHER_COLOR }} />
              Other
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No data yet — switch between a few apps and wait for sessions to be saved.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={filtered} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
              <XAxis
                dataKey="appName"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tickFormatter={(v) => fmtDuration(v as number)}
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                width={50}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f3f4f6" }} />
              <Bar dataKey="totalSeconds" radius={[4, 4, 0, 0]}>
                {filtered.map((entry) => (
                  <Cell
                    key={entry.appName}
                    fill={isWorkApp(entry.appName) ? WORK_COLOR : OTHER_COLOR}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </main>
  );
}
