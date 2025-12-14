import type { KanbanBoard } from "../pages/kanban/kanban.types";

type BoardResponse = {
  board: KanbanBoard;
  nextTaskNumber: number;
};

const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  (import.meta.env.DEV
    ? "/api"
    : `${window.location.protocol}//${window.location.hostname}:7070/api`);

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export const ttApi = {
  getBoard: () => requestJson<BoardResponse>("/board"),
  putBoard: (payload: BoardResponse) =>
    requestJson<{ ok: true }>("/board", { method: "PUT", body: JSON.stringify(payload) }),
};

