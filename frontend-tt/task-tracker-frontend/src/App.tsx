import { useEffect, useMemo, useRef, useState } from "react";
import { KanbanPage } from "./pages/kanban/KanbanPage";
import type { KanbanBoard, KanbanCard, Priority } from "./pages/kanban/kanban.types";
import { TaskPage } from "./pages/task/TaskPage";
import { ProjectsPage } from "./pages/projects/ProjectsPage";
import { ttApi, type Project } from "./api/ttApi";

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
  const [boardLoaded, setBoardLoaded] = useState(false);
  const persistTimerRef = useRef<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  useEffect(() => {
    nextTaskNumberRef.current = nextTaskNumber;
  }, [nextTaskNumber]);

  useEffect(() => {
    let canceled = false;
    ttApi
      .getProjects()
      .then((items) => {
        if (canceled) return;
        setProjects(items);
      })
      .catch((err) => {
        console.error("Failed to load projects:", err);
      })
      .finally(() => {
        if (canceled) return;
        setProjectsLoaded(true);
      });

    return () => {
      canceled = true;
    };
  }, []);

  const projectTaskMatch = hash.match(/^#\/project\/(\d+)\/task\/([^/]+)$/);
  const projectMatch = hash.match(/^#\/project\/(\d+)$/);
  const activeProjectId = projectTaskMatch
    ? Number(projectTaskMatch[1])
    : projectMatch
      ? Number(projectMatch[1])
      : null;
  const activeTaskId = projectTaskMatch ? decodeURIComponent(projectTaskMatch[2]) : null;

  useEffect(() => {
    if (!activeProjectId || Number.isNaN(activeProjectId)) return;
    let canceled = false;
    setBoardLoaded(false);
    setBoard(EMPTY_BOARD);

    ttApi
      .getBoard(activeProjectId)
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
        setBoardLoaded(true);
      });

    return () => {
      canceled = true;
    };
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId || !boardLoaded) return;
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      ttApi
        .putBoard(activeProjectId, { board, nextTaskNumber })
        .catch((err) => console.error("Failed to save board to backend:", err));
    }, 250);

    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [activeProjectId, board, boardLoaded, nextTaskNumber]);

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

  const deleteTask = useMemo(() => {
    return (taskId: string) => {
      setBoard((prev) => {
        if (!prev.cards[taskId]) return prev;
        const nextCards = { ...prev.cards };
        delete nextCards[taskId];
        const nextColumns = prev.columns.map((col) => ({
          ...col,
          cardIds: col.cardIds.filter((id) => id !== taskId),
        }));
        return { ...prev, cards: nextCards, columns: nextColumns };
      });
    };
  }, []);

  if (activeProjectId && Number.isNaN(activeProjectId)) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <div className="mx-auto flex min-h-screen max-w-[980px] items-center justify-center px-6 py-10">
          <div className="rounded-3xl border border-neutral-200 bg-white px-6 py-5 text-sm text-neutral-700 shadow-sm">
            Invalid project.
          </div>
        </div>
      </div>
    );
  }

  if (activeTaskId && activeProjectId) {
    return (
      <TaskPage
        taskId={activeTaskId}
        board={board}
        onSaveTask={saveTask}
        onBack={() => setHash(`#/project/${activeProjectId}`)}
        onOpenTask={(id) => setHash(`#/project/${activeProjectId}/task/${encodeURIComponent(id)}`)}
        onDeleteTask={deleteTask}
      />
    );
  }

  if (activeProjectId) {
    if (!boardLoaded) {
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

    const currentProject = projects.find((p) => p.id === activeProjectId);
    if (projectsLoaded && !currentProject) {
      return (
        <div className="min-h-screen bg-neutral-100">
          <div className="mx-auto flex min-h-screen max-w-[980px] items-center justify-center px-6 py-10">
            <div className="rounded-3xl border border-neutral-200 bg-white px-6 py-5 text-sm text-neutral-700 shadow-sm">
              Project not found.
            </div>
          </div>
        </div>
      );
    }

    return (
      <KanbanPage
        board={board}
        onBoardChange={setBoard}
        onOpenTask={(taskId) => setHash(`#/project/${activeProjectId}/task/${encodeURIComponent(taskId)}`)}
        projectName={currentProject?.name ?? "Project"}
        projectTheme={currentProject?.theme ?? ""}
        onOpenProjects={() => setHash("#/")}
      />
    );
  }

  return (
    <ProjectsPage
      projects={projects}
      loading={!projectsLoaded}
      onOpenProject={(projectId) => setHash(`#/project/${projectId}`)}
      onCreateProject={async ({ name, theme }) => {
        const created = await ttApi.createProject({ name, theme });
        setProjects((prev) => [...prev, created]);
        return created;
      }}
    />
  );
}
