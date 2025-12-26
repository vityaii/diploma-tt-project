type Props = {
  title: string;
  subtitle?: string;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onToggleFilters: () => void;
  onOpenProjects: () => void;
  onAddColumn: () => void;
  onNewTask: () => void;
};

export function BoardHeader({
  title,
  subtitle,
  searchQuery,
  onSearchQueryChange,
  onToggleFilters,
  onOpenProjects,
  onAddColumn,
  onNewTask,
}: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
        <p className="mt-0.5 text-sm text-neutral-500">{subtitle || "Kanban board"}</p>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        <div className="relative w-full max-w-[320px]">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
          >
            <path
              fill="currentColor"
              d="M10 4a6 6 0 1 1 0 12a6 6 0 0 1 0-12m0-2a8 8 0 1 0 4.9 14.3l4.4 4.4a1 1 0 0 0 1.4-1.4l-4.4-4.4A8 8 0 0 0 10 2"
            />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="h-10 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 text-sm outline-none shadow-sm focus:border-neutral-300 focus:ring-4 focus:ring-neutral-200/60"
            placeholder="Search tasks…"
          />
        </div>

        <button
          type="button"
          onClick={onOpenProjects}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-800 shadow-sm hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-neutral-500">
            <path
              fill="currentColor"
              d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"
            />
          </svg>
          Projects
        </button>

        <button
          type="button"
          onClick={onToggleFilters}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-800 shadow-sm hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-neutral-500">
            <path
              fill="currentColor"
              d="M10 18h4v-2h-4zm-7-8v2h18v-2zm3-6v2h12V4z"
            />
          </svg>
          Filters
        </button>

        <button
          type="button"
          onClick={onAddColumn}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-800 shadow-sm hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-neutral-500">
            <path
              fill="currentColor"
              d="M3 5h18v4H3zm0 6h18v8H3zm2 2v4h14v-4z"
            />
          </svg>
          Add column
        </button>

        <button
          type="button"
          onClick={onNewTask}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-3 text-sm text-white shadow-sm hover:bg-neutral-800 focus:outline-none focus:ring-4 focus:ring-neutral-300"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-white">
            <path fill="currentColor" d="M11 5h2v14h-2zM5 11h14v2H5z" />
          </svg>
          New task
        </button>
      </div>
    </div>
  );
}
