import { BoardHeader } from "./components/BoardHeader";
import { Column } from "./components/Column";
import { boardMock } from "./kanban.mock";

export function KanbanPage() {
  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <BoardHeader title="My Project" />

        <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex gap-4 overflow-x-auto pb-3">
            {boardMock.columns.map((col) => {
              const cards = col.cardIds.map((id) => boardMock.cards[id]).filter(Boolean);
              return <Column key={col.id} column={col} cards={cards} />;
            })}

            <button className="w-[320px] shrink-0 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-100 focus:outline-none focus:ring-4 focus:ring-neutral-200/60">
              + Add column
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
