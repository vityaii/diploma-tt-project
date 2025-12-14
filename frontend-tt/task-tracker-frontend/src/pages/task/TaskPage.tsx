import { useEffect, useMemo, useState } from "react";
import type { KanbanBoard, KanbanCard, Priority } from "../kanban/kanban.types";
import { formatTaskKey } from "../kanban/kanban.constants";

type Props = {
  taskId: string;
  board: KanbanBoard;
  onSaveTask: (
    taskId: string,
    draft: {
      title: string;
      customerName: string;
      assigneeName: string;
      description: string;
      tags: string[];
      priority: Priority;
    },
  ) => string;
  onBack: () => void;
  onOpenTask: (id: string) => void;
};

function priorityBadge(priority: KanbanCard["priority"]) {
  const base = "whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium";
  if (priority === "High") return `${base} border-red-200 bg-red-50 text-red-700`;
  if (priority === "Medium") return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
}

export function TaskPage({ taskId, board, onSaveTask, onBack, onOpenTask }: Props) {
  const initialTask = useMemo(() => {
    if (taskId === "new") {
      return {
        id: "new",
        taskNumber: 0,
        title: "New task",
        customer: { name: "—" },
        description: "",
        tags: [],
        priority: "Medium",
      } satisfies KanbanCard;
    }
    return board.cards[taskId];
  }, [board.cards, taskId]);

  const [title, setTitle] = useState(initialTask?.title ?? "Task not found");
  const [customerName, setCustomerName] = useState(initialTask?.customer?.name ?? "—");
  const [assigneeName, setAssigneeName] = useState(initialTask?.assignee?.name ?? "Unassigned");
  const [description, setDescription] = useState(initialTask?.description ?? "");
  const [priority, setPriority] = useState<Priority>(initialTask?.priority ?? "Medium");
  const [tags, setTags] = useState<string[]>(initialTask?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!initialTask) return;
    setTitle(initialTask.title);
    setCustomerName(initialTask.customer?.name ?? "—");
    setAssigneeName(initialTask.assignee?.name ?? "Unassigned");
    setDescription(initialTask.description ?? "");
    setPriority(initialTask.priority ?? "Medium");
    setTags(initialTask.tags ?? []);
    setTagInput("");
    setJustSaved(false);
  }, [initialTask, taskId]);

  if (!initialTask) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <div className="mx-auto max-w-[980px] px-6 py-8">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-800 shadow-sm hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
          >
            <span aria-hidden="true">←</span>
            Back
          </button>

          <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Task not found</h1>
            <p className="mt-2 text-sm text-neutral-600">
              No task exists with id <span className="font-medium">TASK-{taskId}</span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const addTagsFromInput = () => {
    const normalized = tagInput
      .split(/[,\n]/g)
      .map((t) => t.trim())
      .filter(Boolean);
    if (normalized.length === 0) return;
    setTags((prev) => Array.from(new Set([...prev, ...normalized])));
    setTagInput("");
  };

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-[980px] px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-800 shadow-sm hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
          >
            <span aria-hidden="true">←</span>
            Back
          </button>

          <div className="flex items-center gap-2">
            {taskId !== "new" && (
              <span className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm">
                {formatTaskKey(initialTask.taskNumber)}
              </span>
            )}
            <span className={priorityBadge(priority)}>{priority}</span>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5">
            <div>
              <div className="text-xs font-medium text-neutral-500">Title</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-base font-semibold text-neutral-900 shadow-sm outline-none focus:border-neutral-300 focus:ring-4 focus:ring-neutral-200/60"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-neutral-500">Customer</div>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-1 h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 shadow-sm outline-none focus:border-neutral-300 focus:ring-4 focus:ring-neutral-200/60"
                />
              </div>

              <div>
                <div className="text-xs font-medium text-neutral-500">Assignee</div>
                <input
                  value={assigneeName}
                  onChange={(e) => setAssigneeName(e.target.value)}
                  className="mt-1 h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 shadow-sm outline-none focus:border-neutral-300 focus:ring-4 focus:ring-neutral-200/60"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-neutral-500">Priority</div>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {(["Low", "Medium", "High"] as const).map((p) => {
                    const selected = priority === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={
                          selected
                            ? "h-11 rounded-2xl bg-neutral-900 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-4 focus:ring-neutral-300"
                            : "h-11 rounded-2xl border border-neutral-200 bg-white text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
                        }
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-neutral-500">Tags</div>
                <div className="mt-1 flex min-h-11 flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-2 shadow-sm">
                  {tags.length === 0 ? (
                    <span className="text-sm text-neutral-400">No tags</span>
                  ) : (
                    tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-700"
                      >
                        {t}
                        <button
                          type="button"
                          onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                          className="grid h-4 w-4 place-items-center rounded-md text-neutral-500 hover:bg-neutral-200/60"
                          aria-label={`Remove tag ${t}`}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div className="mt-2 flex gap-2">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTagsFromInput();
                      }
                    }}
                    placeholder="Add tag and press Enter…"
                    className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 shadow-sm outline-none focus:border-neutral-300 focus:ring-4 focus:ring-neutral-200/60"
                  />
                  <button
                    type="button"
                    onClick={addTagsFromInput}
                    className="inline-flex h-11 shrink-0 items-center rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-200/60"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-neutral-500">General information</div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write details about this task…"
                className="mt-1 min-h-[180px] w-full resize-y rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm outline-none focus:border-neutral-300 focus:ring-4 focus:ring-neutral-200/60"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-neutral-500">
                {justSaved ? "Saved locally (mock)." : "Changes are local (mock data)."}
              </p>
              <button
                type="button"
                onClick={() => {
                  const savedId = onSaveTask(taskId, {
                    title,
                    customerName,
                    assigneeName: assigneeName === "Unassigned" ? "" : assigneeName,
                    description,
                    tags,
                    priority,
                  });

                  setJustSaved(true);
                  window.setTimeout(() => setJustSaved(false), 1500);

                  if (taskId === "new") onOpenTask(savedId);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 focus:outline-none focus:ring-4 focus:ring-neutral-300"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
