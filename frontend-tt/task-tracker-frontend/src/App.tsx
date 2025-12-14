import { useEffect, useMemo, useRef, useState } from "react";
import { KanbanPage } from "./pages/kanban/KanbanPage";
import type { KanbanBoard, KanbanCard, Priority } from "./pages/kanban/kanban.types";
import { TaskPage } from "./pages/task/TaskPage";
import { ttApi } from "./api/ttApi";

function makeInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  const initials = `${first}${second}`.toUpperCase();
  return initials || name.trim().slice(0, 2).toUpperCase();
}

function createId() {
  const randomUUID = (globalThis.crypto as Crypto | undefined)?.randomUUID?.bind(globalThis.crypto);
  if (randomUUID) return randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

const EMPTY_BOARD: KanbanBoard = { columns: [], cards: {} };

function setHash(hash: string) {
  const normalized = hash.startsWith("#") ? hash : `#${hash}`;
  if (window.location.hash !== normalized) window.location.hash = normalized;
}

function useHashRoute() {
  const [hash, setHashState] = useState(() => window.location.hash || "#/");

  useEffect(() => {
    const onChange = () => setHashState(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return hash;
}

export default function App() {
  const hash = useHashRoute();

  const [board, setBoard] = useState<KanbanBoard>(EMPTY_BOARD);
  const [nextTaskNumber, setNextTaskNumber] = useState(1);
  const nextTaskNumberRef = useRef(nextTaskNumber);
  const [hydrated, setHydrated] = useState(false);
  const persistTimerRef = useRef<number | null>(null);

  useEffect(() => {
    nextTaskNumberRef.current = nextTaskNumber;
  }, [nextTaskNumber]);

  useEffect(() => {
    let canceled = false;
    ttApi
      .getBoard()
      .then(({ board: remoteBoard, nextTaskNumber: remoteNext }) => {
        if (canceled) return;
        setBoard(remoteBoard);
        setNextTaskNumber(remoteNext);
      })
      .catch((err) => {
        console.error("Failed to load board from backend:", err);
      })
      .finally(() => {
        if (canceled) return;
        setHydrated(true);
      });

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      ttApi
        .putBoard({ board, nextTaskNumber })
        .catch((err) => console.error("Failed to save board to backend:", err));
    }, 250);

    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [board, hydrated, nextTaskNumber]);

  const saveTask = useMemo(() => {
    type Draft = {
      title: string;
      customerName: string;
      assigneeName: string;
      description: string;
      tags: string[];
      priority: Priority;
    };

    return (taskId: string, draft: Draft) => {
      const normalizedTags = Array.from(
        new Set(
          draft.tags
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 12),
        ),
      );

      if (taskId === "new") {
        const taskNumber = nextTaskNumberRef.current;
        nextTaskNumberRef.current = taskNumber + 1;
        setNextTaskNumber(taskNumber + 1);

        const newId = createId();
        setBoard((prev) => {
          const todoIndex = prev.columns.findIndex((c) => c.id === "todo");
          const targetIndex = todoIndex === -1 ? 0 : todoIndex;
          const target = prev.columns[targetIndex];

          const nextColumns = [...prev.columns];
          nextColumns[targetIndex] = {
            ...target,
            cardIds: [newId, ...target.cardIds],
          };

          const nextCard: KanbanCard = {
            id: newId,
            taskNumber,
            title: draft.title.trim() || "Untitled task",
            customer: { name: draft.customerName.trim() || "—" },
            description: draft.description.trim(),
            tags: normalizedTags,
            priority: draft.priority,
            assignee: draft.assigneeName.trim()
              ? { name: draft.assigneeName.trim(), initials: makeInitials(draft.assigneeName) }
              : undefined,
          };

          return {
            ...prev,
            columns: nextColumns,
            cards: { ...prev.cards, [newId]: nextCard },
          };
        });
        return newId;
      }

      setBoard((prev) => {
        const existing = prev.cards[taskId];
        if (!existing) return prev;

        const nextCard: KanbanCard = {
          ...existing,
          title: draft.title.trim() || existing.title,
          customer: { name: draft.customerName.trim() || "—" },
          description: draft.description.trim(),
          tags: normalizedTags,
          priority: draft.priority,
          assignee: draft.assigneeName.trim()
            ? { name: draft.assigneeName.trim(), initials: makeInitials(draft.assigneeName) }
            : undefined,
        };

        return { ...prev, cards: { ...prev.cards, [taskId]: nextCard } };
      });
      return taskId;
    };
  }, []);

  const taskMatch = hash.match(/^#\/task\/([^/]+)$/);
  if (!hydrated) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <div className="mx-auto flex min-h-screen max-w-[980px] items-center justify-center px-6 py-10">
          <div className="rounded-3xl border border-neutral-200 bg-white px-6 py-5 text-sm text-neutral-700 shadow-sm">
            Loading board…
          </div>
        </div>
      </div>
    );
  }

  if (taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    return (
      <TaskPage
        taskId={taskId}
        board={board}
        onSaveTask={saveTask}
        onBack={() => setHash("#/")}
        onOpenTask={(id) => setHash(`#/task/${encodeURIComponent(id)}`)}
      />
    );
  }

  return (
    <KanbanPage
      board={board}
      onBoardChange={setBoard}
      onOpenTask={(taskId) => setHash(`#/task/${encodeURIComponent(taskId)}`)}
    />
  );
}
