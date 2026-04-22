import type { KanbanCard } from "../kanban.types";
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { dndIds } from "../kanban.dnd";
import { formatTaskKey } from "../kanban.constants";
import { formatPlannedDate, formatTaskDuration } from "../planning";

function priorityBadge(priority: KanbanCard["priority"]) {
  const base = "whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium";
  if (priority === "High") return `${base} border-red-200 bg-red-50 text-red-700`;
  if (priority === "Medium") return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
}

function cx(...parts: Array<string | undefined | null | false>) {
  return parts.filter(Boolean).join(" ");
}

export const Card = forwardRef<
  HTMLButtonElement,
  {
    card: KanbanCard;
    onOpen?: (id: string) => void;
    isDragging?: boolean;
    buttonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  }
>(function Card({ card, onOpen, isDragging, buttonProps }, ref) {
  const { className, onClick, ...rest } = buttonProps ?? {};
  return (
    <button
      type="button"
      ref={ref}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (isDragging) return;
        onOpen?.(card.id);
      }}
      className={cx(
        "group w-full rounded-xl border border-neutral-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-neutral-200/60",
        className,
      )}
      {...rest}
    >
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

      {(card.plannedDate || card.durationWeeks > 0 || card.durationDays > 0) && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-500">
          {card.plannedDate && (
            <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5">
              {formatPlannedDate(card.plannedDate)}
            </span>
          )}
          {formatTaskDuration(card) && (
            <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5">
              {formatTaskDuration(card)}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500">{formatTaskKey(card.taskNumber)}</span>
        {card.assignee && (
          <div
            title={card.assignee.name}
            className="grid h-7 w-7 place-items-center rounded-full bg-neutral-900 text-xs font-semibold text-white ring-2 ring-white"
          >
            {card.assignee.initials}
          </div>
        )}
      </div>
    </button>
  );
});

export function SortableCard({
  card,
  columnId,
  onOpen,
}: {
  card: KanbanCard;
  columnId: string;
  onOpen?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dndIds.card(card.id),
    data: { type: "card", cardId: card.id, columnId },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
  };

  return (
    <Card
      ref={setNodeRef}
      card={card}
      onOpen={onOpen}
      isDragging={isDragging}
      buttonProps={{
        style,
        ...(attributes ?? {}),
        ...(listeners ?? {}),
      }}
    />
  );
}
