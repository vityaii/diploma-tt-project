import { useEffect, useMemo, useRef, useState } from "react";
import { KanbanPage } from "./pages/kanban/KanbanPage";
import { boardMock } from "./pages/kanban/kanban.mock";
import type { KanbanBoard, KanbanCard, Priority } from "./pages/kanban/kanban.types";
import { TaskPage } from "./pages/task/TaskPage";

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

function getInitialNextTaskNumber() {
  const fromMock = Math.max(
    0,
    ...Object.values(boardMock.cards).map((c) => (typeof c.taskNumber === "number" ? c.taskNumber : 0)),
  );
  const fallback = fromMock + 1;

  try {
    const raw = window.localStorage.getItem("tt.nextTaskNumber");
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return Math.max(parsed, fallback);
  } catch {
    // ignore
  }
  return fallback;
}

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

  const [board, setBoard] = useState<KanbanBoard>(() => ({
    columns: boardMock.columns.map((c) => ({ ...c, cardIds: [...c.cardIds] })),
    cards: { ...boardMock.cards },
  }));
  const [nextTaskNumber, setNextTaskNumber] = useState(() => getInitialNextTaskNumber());
  const nextTaskNumberRef = useRef(nextTaskNumber);

  useEffect(() => {
    nextTaskNumberRef.current = nextTaskNumber;
    try {
      window.localStorage.setItem("tt.nextTaskNumber", String(nextTaskNumber));
    } catch {
      // ignore
    }
  }, [nextTaskNumber]);

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
