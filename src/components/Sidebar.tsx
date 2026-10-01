type Page = "dashboard" | "settings" | "report";

interface Props {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  isPaused?: boolean;
  pauseReason?: "lid" | "camera";
  cameraActive?: boolean;
}

const navItems: { label: string; icon: string; page: Page }[] = [
  { label: "Dashboard", icon: "⊞", page: "dashboard" },
  { label: "Weekly Report", icon: "📊", page: "report" },
  { label: "Settings",  icon: "⚙", page: "settings"  },
];

export default function Sidebar({ currentPage, onNavigate, isPaused, pauseReason, cameraActive }: Props) {
  return (
    <aside className="w-60 h-full bg-gray-900 text-white flex flex-col flex-shrink-0">
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <h1 className="text-base font-semibold tracking-wide">ScreenWellness</h1>
        {cameraActive && (
          <span
            title="Camera presence detection active"
            className="w-2 h-2 rounded-full bg-green-400"
            style={{ boxShadow: "0 0 6px #4ade80" }}
          />
        )}
      </div>
      <nav className="flex-1 p-2 flex flex-col gap-1">
        {navItems.map((item) => (
          <button
            key={item.page}
            onClick={() => onNavigate(item.page)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-left transition-colors ${
              currentPage === item.page
                ? "bg-indigo-600 text-white"
                : "text-gray-300 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {isPaused && (
        <div className="px-3 pb-3">
          <div className="rounded-md border border-yellow-700/50 bg-yellow-900/40 px-3 py-2">
            <p className="text-xs font-medium text-yellow-400">⏸ Paused</p>
            <p className="text-xs text-yellow-600 mt-0.5">
              {pauseReason === "camera" ? "Away from camera" : "Lid closed"}
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
