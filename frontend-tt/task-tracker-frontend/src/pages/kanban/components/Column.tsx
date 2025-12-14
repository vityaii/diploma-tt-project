import type { KanbanColumn, KanbanCard } from "../kanban.types";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { dndIds } from "../kanban.dnd";
import { SortableCard } from "./Card";

type Props = {
  column: KanbanColumn;
  cards: KanbanCard[];
  onOpenCard?: (cardId: string) => void;
};

export function Column({ column, cards, onOpenCard }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: dndIds.column(column.id) });
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div
        className={
          isOver
            ? "flex min-h-0 flex-1 flex-col rounded-2xl border border-neutral-300 bg-neutral-50/60 shadow-sm ring-4 ring-neutral-200/60"
            : "flex min-h-0 flex-1 flex-col rounded-2xl border border-neutral-200 bg-neutral-50/60 shadow-sm"
        }
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 truncate text-sm font-semibold tracking-tight text-neutral-900">
              {column.title}
            </h2>
            <span className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs font-medium text-neutral-600">
              {cards.length}
            </span>
          </div>
          <button
            aria-label="Column menu"
            className="grid h-9 w-9 place-items-center rounded-xl border border-transparent text-neutral-500 hover:border-neutral-200 hover:bg-white focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
          >
            <span className="text-lg leading-none">⋯</span>
          </button>
        </div>

        <SortableContext items={cards.map((c) => dndIds.card(c.id))} strategy={verticalListSortingStrategy}>
          <div ref={setNodeRef} className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {cards.map((c) => (
                <SortableCard key={c.id} card={c} columnId={column.id} onOpen={onOpenCard} />
              ))}
            </div>
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
