import { useMemo, useState } from "react";

type Mode = "login" | "register";

type Props = {
  busy: boolean;
  error: string | null;
  notice?: string | null;
  onLogin: (payload: { username: string; password: string }) => Promise<void>;
  onRegister: (payload: { username: string; password: string }) => Promise<void>;
};

const featureCards = [
  {
    title: "Проектно-ориентированный подход",
    text: "Switch between projects, keep the board structure intact, and work from one consistent interface.",
  },
  {
    title: "Backend-backed state",
    text: "Authentication is now tied to the server contract, with stored session data and token refresh handling.",
  },
  {
    title: "Focused interactions",
    text: "Search, filters, drag-and-drop and task editing stay available right after sign-in.",
  },
];

export function AuthPage({ busy, error, notice, onLogin, onRegister }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const title = useMemo(
    () => (mode === "login" ? "Sign in to continue" : "Create your workspace access"),
    [mode],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      setLocalError("Username must be at least 3 characters.");
      return;
    }

    if (password.length < 6) {
      setLocalError("Password must be at least 6 characters.");
      return;
    }

    if (mode === "register" && password !== confirmPassword) {
      setLocalError("Passwords do not match.");
      return;
    }

    setLocalError(null);

    if (mode === "login") {
      await onLogin({ username: trimmedUsername, password });
      return;
    }

    await onRegister({ username: trimmedUsername, password });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-0 top-0 h-72 w-72 rounded-full bg-neutral-900/6 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1180px] items-center px-6 py-8">
        <div className="grid w-full gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="overflow-hidden rounded-[32px] border border-neutral-200 bg-neutral-950 text-white shadow-[0_24px_80px_rgba(10,10,10,0.18)]">
            <div className="flex h-full flex-col justify-between p-6 md:p-8">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-white/70">
                  Task Tracker
                </div>

                <h1 className="mt-6 max-w-[12ch] text-4xl font-semibold tracking-tight text-white md:text-5xl">
                  Workboards with access control.
                </h1>

                <p className="mt-4 max-w-[58ch] text-sm leading-6 text-white/70 md:text-base">
                  The frontend now uses backend authentication. Sign in once, keep the board
                  state in sync, and continue working from the same interface.
                </p>
              </div>

              <div className="mt-8 grid gap-3">
                {featureCards.map((card) => (
                  <div
                    key={card.title}
                    className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur"
                  >
                    <div className="text-sm font-medium text-white">{card.title}</div>
                    <div className="mt-1 text-sm leading-6 text-white/65">{card.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-neutral-200 bg-white p-6 shadow-sm md:p-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium uppercase tracking-[0.24em] text-neutral-400">
                  Access
                </div>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
                  {title}
                </h2>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setLocalError(null);
                  }}
                  className={
                    mode === "login"
                      ? "rounded-xl bg-white px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm"
                      : "rounded-xl px-3 py-2 text-sm font-medium text-neutral-600"
                  }
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setLocalError(null);
                  }}
                  className={
                    mode === "register"
                      ? "rounded-xl bg-white px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm"
                      : "rounded-xl px-3 py-2 text-sm font-medium text-neutral-600"
                  }
                >
                  Register
                </button>
              </div>
            </div>

            {notice && (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {notice}
              </div>
            )}

            {(localError || error) && (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-line">
                {localError || error}
              </div>
            )}

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                  Username
                </div>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  className="mt-2 h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 shadow-sm outline-none focus:border-neutral-300 focus:ring-4 focus:ring-neutral-200/60"
                  placeholder="e.g. teamlead_01"
                />
              </div>

              <div>
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                  Password
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="mt-2 h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 shadow-sm outline-none focus:border-neutral-300 focus:ring-4 focus:ring-neutral-200/60"
                  placeholder="At least 6 characters"
                />
              </div>

              {mode === "register" && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                    Confirm password
                  </div>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    className="mt-2 h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 shadow-sm outline-none focus:border-neutral-300 focus:ring-4 focus:ring-neutral-200/60"
                    placeholder="Repeat the password"
                  />
                </div>
              )}

              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-600">
                Backend validation expects latin letters, digits, or `_` in the username.
                Tokens are stored locally and refreshed automatically when possible.
              </div>

              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-neutral-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 focus:outline-none focus:ring-4 focus:ring-neutral-300 disabled:cursor-not-allowed disabled:bg-neutral-700"
              >
                {busy
                  ? mode === "login"
                    ? "Signing in…"
                    : "Creating account…"
                  : mode === "login"
                    ? "Sign in"
                    : "Create account"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
