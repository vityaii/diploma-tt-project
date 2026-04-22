import { SessionControls } from "../../components/SessionControls";
import type { KanbanBoard, KanbanCard } from "../kanban/kanban.types";
import {
  addUtcDays,
  dateOnlyToUtc,
  diffUtcDays,
  formatPlannedDate,
  formatTaskDuration,
  getTaskDurationInDays,
} from "../kanban/planning";
import { formatTaskKey } from "../kanban/kanban.constants";

type Props = {
  board: KanbanBoard;
  projectName: string;
  projectTheme: string;
  username: string;
  logoutPending?: boolean;
  onOpenProjects: () => void;
  onOpenBoard: () => void;
  onOpenTask: (taskId: string) => void;
  onLogout: () => void;
};

type ScheduledTask = {
  card: KanbanCard;
  status: string;
  start: Date;
  end: Date;
  durationDays: number;
};

const DAY_WIDTH = 28;
const LABEL_WIDTH = 290;

function startOfUtcWeek(date: Date) {
  const normalized = new Date(date);
  const day = normalized.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalized.setUTCDate(normalized.getUTCDate() + diff);
  return normalized;
}

function endOfUtcWeek(date: Date) {
  return addUtcDays(startOfUtcWeek(date), 6);
}

function formatWeekLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function buildStatusMap(board: KanbanBoard) {
  const map = new Map<string, string>();
  for (const column of board.columns) {
    for (const cardId of column.cardIds) {
      map.set(cardId, column.title);
    }
  }
  return map;
}

export function GanttPage({
  board,
  projectName,
  projectTheme,
  username,
  logoutPending = false,
  onOpenProjects,
  onOpenBoard,
  onOpenTask,
  onLogout,
}: Props) {
  const statusMap = buildStatusMap(board);
  const scheduledTasks: ScheduledTask[] = Object.values(board.cards)
    .filter((card) => card.plannedDate)
    .map((card) => {
      const start = dateOnlyToUtc(card.plannedDate!);
      const rawDuration = getTaskDurationInDays(card);
      const durationDays = Math.max(1, rawDuration || 1);
      const end = addUtcDays(start, durationDays - 1);
      return {
        card,
        status: statusMap.get(card.id) ?? "Unassigned",
        start,
        end,
        durationDays,
      };
    })
    .filter((task) => !Number.isNaN(task.start.getTime()))
    .sort((left, right) => {
      const diff = left.start.getTime() - right.start.getTime();
      return diff !== 0 ? diff : left.card.taskNumber - right.card.taskNumber;
    });

  const unscheduledTasks = Object.values(board.cards)
    .filter((card) => !card.plannedDate)
    .sort((left, right) => left.taskNumber - right.taskNumber);

  const rangeStart = scheduledTasks.length > 0 ? startOfUtcWeek(scheduledTasks[0].start) : null;
  const rangeEnd = scheduledTasks.length > 0 ? endOfUtcWeek(scheduledTasks[scheduledTasks.length - 1].end) : null;
  const totalDays = rangeStart && rangeEnd ? diffUtcDays(rangeStart, rangeEnd) + 1 : 0;
  const totalWidth = totalDays * DAY_WIDTH;
  const weeks: Date[] = [];

  if (rangeStart && rangeEnd) {
    for (let offset = 0; offset < totalDays; offset += 7) {
      weeks.push(addUtcDays(rangeStart, offset));
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.24em] text-neutral-400">
              Timeline
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900">
              {projectName}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {projectTheme || "Planned schedule overview"}
            </p>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <SessionControls username={username} onLogout={onLogout} disabled={logoutPending} />

            <button
              type="button"
              onClick={onOpenProjects}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-800 shadow-sm hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
            >
              Projects
            </button>

            <button
              type="button"
              onClick={onOpenBoard}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-3 text-sm text-white shadow-sm hover:bg-neutral-800 focus:outline-none focus:ring-4 focus:ring-neutral-300"
            >
              Back to board
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          {scheduledTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-5 py-8 text-sm text-neutral-600">
              No tasks with a planned date yet. Add `Planned Date` and `Duration` in a task card to
              place it on the Gantt chart.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-max">
                <div className="flex border-b border-neutral-200 pb-3">
                  <div
                    className="shrink-0 pr-4 text-xs font-medium uppercase tracking-[0.2em] text-neutral-400"
                    style={{ width: LABEL_WIDTH }}
                  >
                    Task
                  </div>

                  <div className="relative" style={{ width: totalWidth }}>
                    <div className="flex">
                      {weeks.map((weekStart) => (
                        <div
                          key={weekStart.toISOString()}
                          className="border-l border-neutral-200 pl-3 text-xs font-medium text-neutral-500"
                          style={{ width: DAY_WIDTH * 7 }}
                        >
                          {formatWeekLabel(weekStart)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {scheduledTasks.map((task) => {
                    const offsetDays = rangeStart ? diffUtcDays(rangeStart, task.start) : 0;
                    const left = offsetDays * DAY_WIDTH;
                    const width = task.durationDays * DAY_WIDTH;

                    return (
                      <div key={task.card.id} className="flex items-center">
                        <div
                          className="shrink-0 pr-4"
                          style={{ width: LABEL_WIDTH }}
                        >
                          <button
                            type="button"
                            onClick={() => onOpenTask(task.card.id)}
                            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-left shadow-sm hover:bg-white focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-xs font-medium text-neutral-500">
                                  {formatTaskKey(task.card.taskNumber)}
                                </div>
                                <div className="mt-1 text-sm font-medium text-neutral-900">
                                  {task.card.title}
                                </div>
                              </div>
                              <span className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs text-neutral-600">
                                {task.status}
                              </span>
                            </div>
                            <div className="mt-2 text-xs text-neutral-500">
                              {formatPlannedDate(task.card.plannedDate)} • {formatTaskDuration(task.card) || "1d"}
                            </div>
                          </button>
                        </div>

                        <div
                          className="relative h-16 rounded-2xl bg-[linear-gradient(to_right,rgba(229,229,229,0.7)_1px,transparent_1px)] bg-white"
                          style={{
                            width: totalWidth,
                            backgroundSize: `${DAY_WIDTH}px 100%`,
                          }}
                        >
                          {weeks.map((weekStart) => (
                            <div
                              key={weekStart.toISOString()}
                              className="pointer-events-none absolute top-0 h-full border-l border-neutral-300/70"
                              style={{ left: diffUtcDays(rangeStart!, weekStart) * DAY_WIDTH }}
                            />
                          ))}

                          <button
                            type="button"
                            onClick={() => onOpenTask(task.card.id)}
                            className="absolute top-1/2 flex h-10 -translate-y-1/2 items-center rounded-xl bg-amber-300 px-3 text-left text-sm font-medium text-neutral-950 shadow-sm focus:outline-none focus:ring-4 focus:ring-amber-200"
                            style={{ left, width: Math.max(width - 4, DAY_WIDTH - 4) }}
                            title={`${task.card.title}: ${formatPlannedDate(task.card.plannedDate)} • ${formatTaskDuration(task.card) || "1d"}`}
                          >
                            <span className="truncate">{task.card.title}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {unscheduledTasks.length > 0 && (
          <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-medium text-neutral-900">Tasks without schedule</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {unscheduledTasks.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onOpenTask(card.id)}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-left shadow-sm hover:bg-white focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
                >
                  <div className="text-xs font-medium text-neutral-500">
                    {formatTaskKey(card.taskNumber)}
                  </div>
                  <div className="mt-1 text-sm font-medium text-neutral-900">{card.title}</div>
                  <div className="mt-2 text-xs text-neutral-500">
                    Add `Planned Date` to place this task on the chart.
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
