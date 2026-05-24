import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AuthPage } from "./pages/auth/AuthPage";
import { GanttPage } from "./pages/gantt/GanttPage";
import { KanbanPage } from "./pages/kanban/KanbanPage";
import type { KanbanBoard, KanbanCard, Priority } from "./pages/kanban/kanban.types";
import { normalizeWeekDayDuration } from "./pages/kanban/planning";
import { TaskPage } from "./pages/task/TaskPage";
import { ProjectsPage } from "./pages/projects/ProjectsPage";
import { authApi, UnauthorizedError, type AuthSession } from "./api/client";
import { ttApi, type ChangelogEntry, type Project } from "./api/ttApi";
import { ThemeToggle } from "./components/ThemeToggle";

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
const THEME_STORAGE_KEY = "tt-theme";

type ThemeMode = "light" | "dark";

function normalizePriority(value: unknown): Priority {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "low") return "Low";
  if (normalized === "high") return "High";
  return "Medium";
}

function normalizeNonNegativeInt(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}

function sanitizeBoard(rawBoard: KanbanBoard): KanbanBoard {
  const rawCards = rawBoard && typeof rawBoard === "object" && rawBoard.cards ? rawBoard.cards : {};
  const cards: Record<string, KanbanCard> = {};
  let fallbackTaskNumber = 1;

  for (const [key, rawCard] of Object.entries(rawCards)) {
    const source = rawCard as Partial<KanbanCard> | undefined;
    const id = String(source?.id ?? key);
    const taskNumberRaw = Number(source?.taskNumber);
    const taskNumber = Number.isFinite(taskNumberRaw) && taskNumberRaw > 0
      ? Math.trunc(taskNumberRaw)
      : fallbackTaskNumber;
    fallbackTaskNumber = Math.max(fallbackTaskNumber, taskNumber + 1);

    cards[id] = {
      id,
      taskNumber,
      title: String(source?.title ?? "Untitled task"),
      customer: source?.customer?.name ? { name: String(source.customer.name) } : undefined,
      description: String(source?.description ?? ""),
      tags: Array.isArray(source?.tags)
        ? source.tags.map((tag) => String(tag ?? "").trim()).filter(Boolean)
        : [],
      priority: normalizePriority(source?.priority),
      plannedDate: source?.plannedDate ? String(source.plannedDate) : undefined,
      durationWeeks: normalizeNonNegativeInt(source?.durationWeeks),
      durationDays: normalizeNonNegativeInt(source?.durationDays),
      assignee: source?.assignee?.name
        ? {
          name: String(source.assignee.name),
          initials: String(source.assignee.initials ?? makeInitials(String(source.assignee.name))),
        }
        : undefined,
    };
  }

  const rawColumns = Array.isArray(rawBoard?.columns) ? rawBoard.columns : [];
  const columns = rawColumns.map((column) => {
    const columnId = String(column?.id ?? "");
    const title = String(column?.title ?? "").trim() || "Untitled column";
    const cardIds = Array.isArray(column?.cardIds)
      ? column.cardIds.map((id) => String(id)).filter((id) => Boolean(cards[id]))
      : [];

    return { id: columnId, title, cardIds };
  });

  return { columns, cards };
}

function calcNextTaskNumber(board: KanbanBoard, remoteNextTaskNumber: number) {
  const maxFromCards = Object.values(board.cards).reduce((max, card) => Math.max(max, card.taskNumber), 0);
  const normalizedRemote = Number.isFinite(Number(remoteNextTaskNumber))
    ? Math.max(1, Math.trunc(Number(remoteNextTaskNumber)))
    : 1;
  return Math.max(normalizedRemote, maxFromCards + 1);
}

function setHash(hash: string) {
  const normalized = hash.startsWith("#") ? hash : `#${hash}`;
  if (window.location.hash !== normalized) window.location.hash = normalized;
}

function getInitialTheme(): ThemeMode {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  } catch {
    // Ignore storage failures and fall back to system preference.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

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
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [changelogLoaded, setChangelogLoaded] = useState(false);

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
    setChangelog([]);
    setChangelogLoaded(false);
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
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures and keep the active theme in memory.
    }
  }, [theme]);

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

  const loadChangelog = useCallback(
    async (limit = 30) => {
      try {
        const items = await ttApi.getChangelog(limit);
        setChangelog(items);
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          handleUnauthorized();
          return;
        }
        console.error("Failed to load changelog:", error);
      } finally {
        setChangelogLoaded(true);
      }
    },
    [handleUnauthorized],
  );

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

  useEffect(() => {
    if (!authReady) return;
    if (!authSession) {
      setChangelogLoaded(true);
      return;
    }

    let canceled = false;
    setChangelogLoaded(false);

    ttApi
      .getChangelog()
      .then((items) => {
        if (canceled) return;
        setChangelog(items);
      })
      .catch((error) => {
        if (canceled) return;
        if (error instanceof UnauthorizedError) {
          handleUnauthorized();
          return;
        }
        console.error("Failed to load changelog:", error);
      })
      .finally(() => {
        if (canceled) return;
        setChangelogLoaded(true);
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
        const normalizedBoard = sanitizeBoard(remoteBoard);
        setBoard(normalizedBoard);
        setNextTaskNumber(calcNextTaskNumber(normalizedBoard, remoteNext));
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
      ttApi
        .putBoard(activeProjectId, { board, nextTaskNumber })
        .then(() => {
          void loadChangelog();
        })
        .catch((error) => {
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
  }, [authSession, activeProjectId, board, boardLoaded, nextTaskNumber, handleUnauthorized, loadChangelog]);

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

  let content: ReactNode;

  if (!authReady) {
    content = <FullScreenMessage message="Checking session…" />;
  } else if (!authSession) {
    content = (
      <AuthPage
        theme={theme}
        busy={authBusy}
        error={authError}
        notice={authNotice}
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    );
  } else if (activeProjectId && Number.isNaN(activeProjectId)) {
    content = <FullScreenMessage message="Invalid project." />;
  } else if (activeTaskId && activeProjectId) {
    content = (
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
  } else if (activeProjectId) {
    if (!boardLoaded) {
      content = <FullScreenMessage message="Loading board…" />;
    } else {
      const currentProject = projects.find((project) => project.id === activeProjectId);

      if (projectsLoaded && !currentProject) {
        content = <FullScreenMessage message="Project not found." />;
      } else if (isGanttRoute) {
        content = (
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
      } else {
        content = (
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
    }
  } else {
    content = (
      <ProjectsPage
        projects={projects}
        loading={!projectsLoaded}
        changelog={changelog}
        changelogLoading={!changelogLoaded}
        currentUser={authSession.username}
        logoutPending={logoutPending}
        onOpenProject={(projectId) => setHash(`#/project/${projectId}`)}
        onCreateProject={async ({ name, theme }) => {
          try {
            const created = await ttApi.createProject({ name, theme });
            setProjects((prev) => [...prev, created]);
            void loadChangelog();
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

  return (
    <>
      {content}
      <ThemeToggle theme={theme} onToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))} />
    </>
  );
}
