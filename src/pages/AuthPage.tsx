import { useState } from "react";

interface Props {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onClose: () => void;
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.toLowerCase();
  if (m.includes("rate limit")) return "Too many emails sent recently. Please wait a few minutes and try again.";
  if (m.includes("invalid login")) return "Incorrect email or password.";
  if (m.includes("email not confirmed")) return "Please confirm your email first, then log in.";
  if (m.includes("already registered")) return "An account with this email already exists. Try logging in.";
  return msg;
}

export default function AuthPage({ onSignIn, onSignUp, onClose }: Props) {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      if (tab === "login") {
        await onSignIn(email, password);
        onClose();
      } else {
        await onSignUp(email, password);
        setSuccess("Account created. Check your email to confirm, then log in.");
        setTab("login");
        setPassword("");
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  function switchTab(t: "login" | "signup") {
    setTab(t);
    setError(null);
    setSuccess(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/90 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-gray-900 p-8 shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-gray-500 hover:text-white transition-colors"
        >
          ✕
        </button>

        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-white">
            Screen<span className="text-indigo-400">Wellness</span>
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {tab === "login" ? "Welcome back" : "Create your account"}
          </p>
          <p className="mt-1 text-xs text-gray-500">Optional. Only needed to back up your daily stats to the cloud.</p>
        </div>

        <div className="mb-5 flex rounded-lg bg-white/5 p-1">
          {(["login", "signup"] as const).map(t => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                tab === t ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {t === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 pr-14 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="At least 6 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
          )}
          {success && (
            <p className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-300">{success}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
          >
            {loading ? "Please wait…" : tab === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <button
          onClick={onClose}
          className="mt-4 w-full text-center text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Continue without an account
        </button>
      </div>
    </div>
  );
}
