type Props = {
  username: string;
  onLogout: () => void;
  disabled?: boolean;
};

function makeInitials(name: string) {
  return (
    name
      .trim()
      .slice(0, 2)
      .toUpperCase() || "TT"
  );
}

export function SessionControls({ username, onLogout, disabled = false }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="inline-flex h-10 items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 shadow-sm">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-neutral-900 text-xs font-semibold text-white">
          {makeInitials(username)}
        </div>
        <div className="min-w-0">
          <div className="max-w-[140px] truncate text-sm font-medium text-neutral-900">
            {username}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onLogout}
        disabled={disabled}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-200/60 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-neutral-500">
          <path
            fill="currentColor"
            d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4v-2H6V6h4zm5.3 3.3L20 12l-4.7 4.7l-1.4-1.4l2.3-2.3H9v-2h7.2l-2.3-2.3z"
          />
        </svg>
        {disabled ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
