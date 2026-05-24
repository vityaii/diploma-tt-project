type ThemeMode = "light" | "dark";

type Props = {
  theme: ThemeMode;
  onToggle: () => void;
};

export function ThemeToggle({ theme, onToggle }: Props) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      className="fixed bottom-5 right-5 z-50 inline-flex h-13 items-center gap-3 rounded-full border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-800 shadow-lg shadow-neutral-900/10 transition hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-neutral-900 text-white">
        {isDark ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
            <path
              fill="currentColor"
              d="M6.76 4.84l-1.8-1.79l-1.41 1.41l1.79 1.8zm10.45-1.79l-1.79 1.79l1.41 1.41l1.79-1.8zM12 4V1h-2v3zm0 19v-3h-2v3zm8-11V10h3v2zM4 12v-2H1v2zm12.24 7.16l1.79 1.8l1.41-1.42l-1.79-1.79zM4.96 19.55l1.41 1.42l1.79-1.8l-1.41-1.41zM11 6a6 6 0 1 0 0 12a6 6 0 0 0 0-12m0 2a4 4 0 1 1 0 8a4 4 0 0 1 0-8"
            />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
            <path
              fill="currentColor"
              d="M12.74 2a1 1 0 0 1 .98 1.2a8 8 0 0 0 7.08 9.7a1 1 0 0 1 .78 1.42A10 10 0 1 1 9.68 2.42A1 1 0 0 1 10.9 3.7A8 8 0 0 0 20.3 13.1A1 1 0 0 1 19.58 14A8 8 0 1 1 12.74 2"
            />
          </svg>
        )}
      </span>
      <span>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
