import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthPage } from "./pages/auth/AuthPage";
import { GanttPage } from "./pages/gantt/GanttPage";
import { KanbanPage } from "./pages/kanban/KanbanPage";
import type { KanbanBoard, KanbanCard, Priority } from "./pages/kanban/kanban.types";
import { normalizeWeekDayDuration } from "./pages/kanban/planning";
import { TaskPage } from "./pages/task/TaskPage";
import { ProjectsPage } from "./pages/projects/ProjectsPage";
import { authApi, UnauthorizedError, type AuthSession } from "./api/client";
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

function FullScreenMessage({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="mx-auto flex min-h-screen max-w-[980px] items-center justify-center px-6 py-10">
        <div className="rounded-3xl border border-neutral-200 bg-white px-6 py-5 text-sm text-neutral-700 shadow-sm">
          {message}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const hash = useHashRoute();

  const [authSession, setAuthSession] = useState<AuthSession | null>(() => authApi.getSession());
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);

  const [board, setBoard] = useState<KanbanBoard>(EMPTY_BOARD);
  const [nextTaskNumber, setNextTaskNumber] = useState(1);
  const nextTaskNumberRef = useRef(nextTaskNumber);
  const [boardLoaded, setBoardLoaded] = useState(false);
  const persistTimerRef = useRef<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  const clearWorkspaceState = useCallback(() => {
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    nextTaskNumberRef.current = 1;
    setBoard(EMPTY_BOARD);
    setNextTaskNumber(1);
    setBoardLoaded(false);
    setProjects([]);
    setProjectsLoaded(false);
  }, []);

  const getErrorMessage = useCallback((error: unknown, fallback: string) => {
    return error instanceof Error && error.message.trim() ? error.message : fallback;
  }, []);

  const handleSignedOut = useCallback(
    (notice?: string | null) => {
      authApi.clearSession();
      setAuthSession(null);
      setAuthBusy(false);
      setAuthError(null);
      setLogoutPending(false);
      setAuthNotice(notice ?? null);
      clearWorkspaceState();
      setHash("#/");
    },
    [clearWorkspaceState],
  );

  const handleUnauthorized = useCallback(
    (notice = "Session expired. Sign in again.") => {
      handleSignedOut(notice);
    },
    [handleSignedOut],
  );

  useEffect(() => {
    nextTaskNumberRef.current = nextTaskNumber;
  }, [nextTaskNumber]);

  useEffect(() => {
    let canceled = false;

    authApi
      .restoreSession()
      .then((session) => {
        if (canceled) return;
        setAuthSession(session);
        if (!session) clearWorkspaceState();
      })
      .catch((error) => {
        if (canceled) return;
        console.error("Failed to restore session:", error);
        handleSignedOut("Failed to restore session. Sign in again.");
      })
      .finally(() => {
        if (!canceled) setAuthReady(true);
      });

    return () => {
      canceled = true;
    };
  }, [clearWorkspaceState, handleSignedOut]);

  const runAuthAction = useCallback(
    async (action: () => Promise<AuthSession>) => {
      setAuthBusy(true);
      setAuthError(null);
      setAuthNotice(null);
      try {
        const session = await action();
        setAuthSession(session);
      } catch (error) {
        setAuthError(getErrorMessage(error, "Authentication failed."));
      } finally {
        setAuthBusy(false);
      }
    },
    [getErrorMessage],
  );

  const handleLogin = useCallback(
    async (payload: { username: string; password: string }) => {
      await runAuthAction(() => authApi.login(payload));
    },
    [runAuthAction],
  );

  const handleRegister = useCallback(
    async (payload: { username: string; password: string }) => {
      await runAuthAction(() => authApi.register(payload));
    },
    [runAuthAction],
  );

  const handleLogout = useCallback(async () => {
    setLogoutPending(true);
    try {
      await authApi.logout();
    } catch (error) {
      console.error("Failed to sign out cleanly:", error);
    } finally {
      handleSignedOut();
    }
  }, [handleSignedOut]);

  useEffect(() => {
    if (!authReady) return;
    if (!authSession) {
      setProjectsLoaded(true);
      return;
    }

    let canceled = false;
    setProjectsLoaded(false);

    ttApi
      .getProjects()
      .then((items) => {
        if (canceled) return;
        setProjects(items);
      })
      .catch((error) => {
        if (canceled) return;
        if (error instanceof UnauthorizedError) {
          handleUnauthorized();
          return;
        }
        console.error("Failed to load projects:", error);
      })
      .finally(() => {
        if (canceled) return;
        setProjectsLoaded(true);
      });

    return () => {
      canceled = true;
    };
  }, [authReady, authSession, handleUnauthorized]);

  const projectTaskMatch = hash.match(/^#\/project\/(\d+)\/task\/([^/]+)$/);
  const projectGanttMatch = hash.match(/^#\/project\/(\d+)\/gantt$/);
  const projectMatch = hash.match(/^#\/project\/(\d+)$/);
  const activeProjectId = projectTaskMatch
    ? Number(projectTaskMatch[1])
    : projectGanttMatch
      ? Number(projectGanttMatch[1])
    : projectMatch
      ? Number(projectMatch[1])
      : null;
  const activeTaskId = projectTaskMatch ? decodeURIComponent(projectTaskMatch[2]) : null;
  const isGanttRoute = Boolean(projectGanttMatch);

  useEffect(() => {
    if (!authSession || !activeProjectId || Number.isNaN(activeProjectId)) return;

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
      .catch((error) => {
        if (canceled) return;
        if (error instanceof UnauthorizedError) {
          handleUnauthorized();
          return;
        }
        console.error("Failed to load board from backend:", error);
      })
      .finally(() => {
        if (canceled) return;
        setBoardLoaded(true);
      });

    return () => {
      canceled = true;
    };
  }, [authSession, activeProjectId, handleUnauthorized]);

  useEffect(() => {
    if (!authSession || !activeProjectId || !boardLoaded) return;
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);

    persistTimerRef.current = window.setTimeout(() => {
      ttApi.putBoard(activeProjectId, { board, nextTaskNumber }).catch((error) => {
        if (error instanceof UnauthorizedError) {
          handleUnauthorized();
          return;
        }
        console.error("Failed to save board to backend:", error);
      });
    }, 250);

    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [authSession, activeProjectId, board, boardLoaded, nextTaskNumber, handleUnauthorized]);

  const saveTask = useMemo(() => {
    type Draft = {
      title: string;
      customerName: string;
      assigneeName: string;
      description: string;
      tags: string[];
      priority: Priority;
      plannedDate: string;
      durationWeeks: number;
      durationDays: number;
    };

    return (taskId: string, draft: Draft) => {
      const normalizedTags = Array.from(
        new Set(
          draft.tags
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 12),
        ),
      );
      const planning = normalizeWeekDayDuration(draft.durationWeeks, draft.durationDays);

      if (taskId === "new") {
        const taskNumber = nextTaskNumberRef.current;
        nextTaskNumberRef.current = taskNumber + 1;
        setNextTaskNumber(taskNumber + 1);

        const newId = createId();
        setBoard((prev) => {
          const todoIndex = prev.columns.findIndex((column) => column.id === "todo");
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
            plannedDate: draft.plannedDate || undefined,
            durationWeeks: planning.durationWeeks,
            durationDays: planning.durationDays,
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
          plannedDate: draft.plannedDate || undefined,
          durationWeeks: planning.durationWeeks,
          durationDays: planning.durationDays,
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
        const nextColumns = prev.columns.map((column) => ({
          ...column,
          cardIds: column.cardIds.filter((id) => id !== taskId),
        }));
        return { ...prev, columns: nextColumns, cards: nextCards };
      });
    };
  }, []);

  if (!authReady) {
    return <FullScreenMessage message="Checking session…" />;
  }

  if (!authSession) {
    return (
      <AuthPage
        busy={authBusy}
        error={authError}
        notice={authNotice}
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    );
  }

  if (activeProjectId && Number.isNaN(activeProjectId)) {
    return <FullScreenMessage message="Invalid project." />;
  }

  if (activeTaskId && activeProjectId) {
    return (
      <TaskPage
        taskId={activeTaskId}
        board={board}
        username={authSession.username}
        logoutPending={logoutPending}
        onSaveTask={saveTask}
        onBack={() => setHash(`#/project/${activeProjectId}`)}
        onOpenTask={(id) => setHash(`#/project/${activeProjectId}/task/${encodeURIComponent(id)}`)}
        onDeleteTask={deleteTask}
        onLogout={handleLogout}
      />
    );
  }

  if (activeProjectId) {
    if (!boardLoaded) {
      return <FullScreenMessage message="Loading board…" />;
    }

    const currentProject = projects.find((project) => project.id === activeProjectId);
    if (projectsLoaded && !currentProject) {
      return <FullScreenMessage message="Project not found." />;
    }

    if (isGanttRoute) {
      return (
        <GanttPage
          board={board}
          projectName={currentProject?.name ?? "Project"}
          projectTheme={currentProject?.theme ?? ""}
          username={authSession.username}
          logoutPending={logoutPending}
          onOpenProjects={() => setHash("#/")}
          onOpenBoard={() => setHash(`#/project/${activeProjectId}`)}
          onOpenTask={(taskId) => setHash(`#/project/${activeProjectId}/task/${encodeURIComponent(taskId)}`)}
          onLogout={handleLogout}
        />
      );
    }

    return (
      <KanbanPage
        board={board}
        onBoardChange={setBoard}
        onOpenTask={(taskId) => setHash(`#/project/${activeProjectId}/task/${encodeURIComponent(taskId)}`)}
        projectName={currentProject?.name ?? "Project"}
        projectTheme={currentProject?.theme ?? ""}
        currentUser={authSession.username}
        logoutPending={logoutPending}
        onOpenProjects={() => setHash("#/")}
        onOpenGantt={() => setHash(`#/project/${activeProjectId}/gantt`)}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <ProjectsPage
      projects={projects}
      loading={!projectsLoaded}
      currentUser={authSession.username}
      logoutPending={logoutPending}
      onOpenProject={(projectId) => setHash(`#/project/${projectId}`)}
      onCreateProject={async ({ name, theme }) => {
        try {
          const created = await ttApi.createProject({ name, theme });
          setProjects((prev) => [...prev, created]);
          return created;
        } catch (error) {
          if (error instanceof UnauthorizedError) {
            handleUnauthorized();
            return null;
          }
          throw error;
        }
      }}
      onLogout={handleLogout}
    />
  );
}
