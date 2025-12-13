import type { KanbanColumn, KanbanCard } from "../kanban.types";
import { Card } from "./Card";

type Props = {
  column: KanbanColumn;
  cards: KanbanCard[];
};

export function Column({ column, cards }: Props) {
  return (
    <div className="w-[320px] shrink-0">
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 shadow-sm">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-neutral-900">{column.title}</h2>
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

        <div className="flex flex-col gap-2 px-3 pb-3">
          {cards.map((c) => (
            <Card key={c.id} card={c} />
          ))}

          <button className="rounded-xl border border-dashed border-neutral-300 bg-white py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-200/60">
            + Add task
          </button>
        </div>
      </div>
    </div>
  );
}
