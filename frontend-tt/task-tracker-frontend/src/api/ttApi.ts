import type { KanbanBoard } from "../pages/kanban/kanban.types";
import { requestJson } from "./client";

export type Project = {
  id: number;
  name: string;
  theme: string;
  created_at?: string;
};

export type ChangelogEntry = {
  id: number;
  event_type: "project_created" | "task_created" | "task_updated" | "user_created";
  actor_user_id?: number | null;
  metadata?: {
    actorUsername?: string | null;
    projectId?: number | null;
    projectName?: string | null;
    taskId?: number | null;
    taskTitle?: string | null;
    taskNumber?: number | null;
    targetUserId?: number | null;
    targetUsername?: string | null;
  } | null;
  created_at: string;
};

type BoardResponse = {
  board: KanbanBoard;
  nextTaskNumber: number;
};

export const ttApi = {
  getProjects: () => requestJson<Project[]>("/projects"),
  createProject: (payload: { name: string; theme: string }) =>
    requestJson<Project>("/projects", { method: "POST", body: JSON.stringify(payload) }),
  getChangelog: (limit = 30) => requestJson<ChangelogEntry[]>(`/changelog?limit=${limit}`),
  getBoard: (projectId: number) => requestJson<BoardResponse>(`/projects/${projectId}/board`),
  putBoard: (projectId: number, payload: BoardResponse) =>
    requestJson<{ ok: true }>(`/projects/${projectId}/board`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
};
