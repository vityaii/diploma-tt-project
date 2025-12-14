import { BoardHeader } from "./components/BoardHeader";
import { Column } from "./components/Column";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { KanbanBoard, KanbanCard, Priority } from "./kanban.types";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { parseCardId, parseColumnId } from "./kanban.dnd";
import { formatTaskKey } from "./kanban.constants";

type Props = {
  board: KanbanBoard;
  onBoardChange: Dispatch<SetStateAction<KanbanBoard>>;
  onOpenTask?: (taskId: string) => void;
};

function findColumnIdByCardId(board: KanbanBoard, cardId: string) {
  for (const col of board.columns) {
    if (col.cardIds.includes(cardId)) return col.id;
  }
  return null;
}

export function KanbanPage({ board, onBoardChange, onOpenTask }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priorityFilters, setPriorityFilters] = useState<Set<Priority>>(
    () => new Set<Priority>(["Low", "Medium", "High"]),
  );
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const cardsById = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const priorities = priorityFilters;

    const result: Partial<Record<string, KanbanCard>> = {};
    for (const [id, card] of Object.entries(board.cards)) {
      if (!priorities.has(card.priority)) continue;
      if (!q) {
        result[id] = card;
        continue;
      }

      const haystack = [
        formatTaskKey(card.taskNumber),
        card.title,
        card.description ?? "",
        card.customer?.name ?? "",
        card.assignee?.name ?? "",
        ...(card.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();

      if (haystack.includes(q)) result[id] = card;
    }
    return result;
  }, [board.cards, priorityFilters, searchQuery]);

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 py-8">
        <BoardHeader
          title="My Project"
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onToggleFilters={() => setFiltersOpen((v) => !v)}
          onAddColumn={() => {
            const title = window.prompt("Column title");
            if (!title) return;

            const baseId = title
              .trim()
              .toLowerCase()
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9-]/g, "");
            const rand = Math.random().toString(16).slice(2, 8);
            const id = baseId ? `${baseId}-${rand}` : `col-${rand}`;

            onBoardChange((prev) => ({
              ...prev,
              columns: [...prev.columns, { id, title: title.trim(), cardIds: [] }],
            }));
          }}
          onNewTask={() => onOpenTask?.("new")}
        />

        {filtersOpen && (
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-medium text-neutral-900">Filters</div>
              <button
                type="button"
                onClick={() => {
                  setPriorityFilters(new Set(["Low", "Medium", "High"]));
                  setSearchQuery("");
                }}
                className="text-sm font-medium text-neutral-700 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-500"
              >
                Clear
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-3">
              {(["Low", "Medium", "High"] as const).map((p) => {
                const checked = priorityFilters.has(p);
                return (
                  <label
                    key={p}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setPriorityFilters((prev) => {
                          const next = new Set(prev);
                          if (next.has(p)) next.delete(p);
                          else next.add(p);
                          return next.size === 0
                            ? new Set<Priority>(["Low", "Medium", "High"])
                            : next;
                        });
                      }}
                      className="h-4 w-4 accent-neutral-900"
                    />
                    {p}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <DndContext
          sensors={sensors}
          onDragStart={(event) => {
            const cardId = parseCardId(event.active.id);
            if (cardId) setActiveCardId(cardId);
          }}
          onDragCancel={() => setActiveCardId(null)}
          onDragEnd={(event) => {
            const activeId = parseCardId(event.active.id);
            const overRawId = event.over?.id;
            if (!activeId || !overRawId) {
              setActiveCardId(null);
              return;
            }

            const overCardId = parseCardId(overRawId);
            const overColumnId = parseColumnId(overRawId);

            onBoardChange((prev) => {
              const fromColumnId = findColumnIdByCardId(prev, activeId);
              const toColumnId = overColumnId ?? (overCardId ? findColumnIdByCardId(prev, overCardId) : null);
              if (!fromColumnId || !toColumnId) return prev;

              const fromColumnIndex = prev.columns.findIndex((c) => c.id === fromColumnId);
              const toColumnIndex = prev.columns.findIndex((c) => c.id === toColumnId);
              if (fromColumnIndex === -1 || toColumnIndex === -1) return prev;

              const fromColumn = prev.columns[fromColumnIndex];
              const toColumn = prev.columns[toColumnIndex];

              const fromIndex = fromColumn.cardIds.indexOf(activeId);
              if (fromIndex === -1) return prev;

              const toIndex = overCardId
                ? toColumn.cardIds.indexOf(overCardId)
                : toColumn.cardIds.length;

              if (toIndex === -1) return prev;

              if (fromColumnId === toColumnId) {
                const nextCardIds = arrayMove(fromColumn.cardIds, fromIndex, toIndex);
                const nextColumns = [...prev.columns];
                nextColumns[fromColumnIndex] = { ...fromColumn, cardIds: nextCardIds };
                return { ...prev, columns: nextColumns };
              }

              const nextFromCardIds = [...fromColumn.cardIds];
              nextFromCardIds.splice(fromIndex, 1);

              const nextToCardIds = [...toColumn.cardIds];
              nextToCardIds.splice(toIndex, 0, activeId);

              const nextColumns = [...prev.columns];
              nextColumns[fromColumnIndex] = { ...fromColumn, cardIds: nextFromCardIds };
              nextColumns[toColumnIndex] = { ...toColumn, cardIds: nextToCardIds };
              return { ...prev, columns: nextColumns };
            });

            setActiveCardId(null);
          }}
        >
          <div className="mt-6 flex min-h-0 flex-1 flex-col rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex min-h-0 flex-1 items-stretch gap-4">
              {board.columns.map((col) => {
                const cards = col.cardIds
                  .map((id) => cardsById[id])
                  .filter((c): c is KanbanCard => Boolean(c));
                return (
                  <Column
                    key={col.id}
                    column={col}
                    cards={cards}
                    onOpenCard={(id) => onOpenTask?.(id)}
                  />
                );
              })}
            </div>
          </div>

          <DragOverlay>
            {activeCardId && board.cards[activeCardId] ? (
              <div className="w-[320px]">
                <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-neutral-500">
                        {formatTaskKey(board.cards[activeCardId].taskNumber)}
                      </div>
                      <div className="truncate font-medium leading-snug text-neutral-900">
                        {board.cards[activeCardId].title}
                      </div>
                    </div>
                    <span className="whitespace-nowrap rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-700">
                      {board.cards[activeCardId].priority}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
