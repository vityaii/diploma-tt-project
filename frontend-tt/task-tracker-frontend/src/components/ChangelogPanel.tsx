import type { ChangelogEntry } from "../api/ttApi";

type Props = {
  entries: ChangelogEntry[];
  loading: boolean;
  onClose?: () => void;
};

function formatMessage(entry: ChangelogEntry) {
  const metadata = entry.metadata ?? {};
  const actor = metadata.actorUsername || "Someone";
  const projectName = metadata.projectName || "project";
  const taskTitle = metadata.taskTitle || "task";
  const taskNumber = metadata.taskNumber ? `TT-${metadata.taskNumber}` : "task";
  const targetUsername = metadata.targetUsername || "new user";

  switch (entry.event_type) {
    case "project_created":
      return `${actor} created project "${projectName}"`;
    case "task_created":
      return `${actor} created ${taskNumber} "${taskTitle}"`;
    case "task_updated":
      return `${actor} updated ${taskNumber} "${taskTitle}"`;
    case "user_created":
      return `${targetUsername} joined the workspace`;
    default:
      return "Activity recorded";
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getAccentClass(eventType: ChangelogEntry["event_type"]) {
  switch (eventType) {
    case "project_created":
      return "bg-sky-100 text-sky-700";
    case "task_created":
      return "bg-emerald-100 text-emerald-700";
    case "task_updated":
      return "bg-amber-100 text-amber-700";
    case "user_created":
      return "bg-violet-100 text-violet-700";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

export function ChangelogPanel({ entries, loading, onClose }: Props) {
  return (
    <aside className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-xl shadow-neutral-900/8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Changelog</h2>
          <p className="mt-1 text-sm text-neutral-500">Recent workspace activity.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600">
            {entries.length}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-500 shadow-sm hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
              aria-label="Close changelog"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
                <path fill="currentColor" d="M6.7 5.3L12 10.6l5.3-5.3l1.4 1.4L13.4 12l5.3 5.3l-1.4 1.4L12 13.4l-5.3 5.3l-1.4-1.4l5.3-5.3L5.3 6.7z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-5 text-sm text-neutral-600">
            Loading activity…
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-5 text-sm text-neutral-600">
            No activity yet.
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-6 text-neutral-900">
                    {formatMessage(entry)}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {formatDate(entry.created_at)}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getAccentClass(entry.event_type)}`}
                >
                  {entry.event_type.replace("_", " ")}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
