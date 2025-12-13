import type { KanbanCard } from "../kanban.types";

function priorityBadge(priority: KanbanCard["priority"]) {
  const base = "whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium";
  if (priority === "High") return `${base} border-red-200 bg-red-50 text-red-700`;
  if (priority === "Medium") return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
}

export function Card({ card }: { card: KanbanCard }) {
  return (
    <div className="group rounded-xl border border-neutral-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium leading-snug text-neutral-900">{card.title}</div>
        <span className={priorityBadge(card.priority)}>{card.priority}</span>
      </div>

      {card.tags?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.tags.map((t) => (
            <span
              key={t}
              className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-700"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500">TASK-{card.id}</span>
        {card.assignee && (
          <div
            title={card.assignee.name}
            className="grid h-7 w-7 place-items-center rounded-full bg-neutral-900 text-xs font-semibold text-white ring-2 ring-white"
          >
            {card.assignee.initials}
          </div>
        )}
      </div>
    </div>
  );
}
