import type { KanbanBoard } from "../pages/kanban/kanban.types";
import { requestJson } from "./client";

export type Project = {
  id: number;
  name: string;
  theme: string;
  created_at?: string;
};

type BoardResponse = {
  board: KanbanBoard;
  nextTaskNumber: number;
};

export const ttApi = {
  getProjects: () => requestJson<Project[]>("/projects"),
  createProject: (payload: { name: string; theme: string }) =>
    requestJson<Project>("/projects", { method: "POST", body: JSON.stringify(payload) }),
  getBoard: (projectId: number) => requestJson<BoardResponse>(`/projects/${projectId}/board`),
  putBoard: (projectId: number, payload: BoardResponse) =>
    requestJson<{ ok: true }>(`/projects/${projectId}/board`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
};
