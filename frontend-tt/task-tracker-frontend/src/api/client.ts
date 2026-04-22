const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  (import.meta.env.DEV
    ? "/api"
    : `${window.location.protocol}//${window.location.hostname}:7070/api`);

const AUTH_BASE =
  (import.meta.env.VITE_AUTH_BASE as string | undefined) ??
  (import.meta.env.DEV
    ? ""
    : `${window.location.protocol}//${window.location.hostname}:7070`);

const AUTH_STORAGE_KEY = "tt.auth.session";

export type AuthSession = {
  userId: number;
  username: string;
  accessToken: string;
  refreshToken: string;
};

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized", data?: unknown) {
    super(401, message, data);
    this.name = "UnauthorizedError";
  }
}

type RequestOptions = {
  auth?: boolean;
  allowRefresh?: boolean;
  baseUrl?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAuthSession(value: unknown): value is AuthSession {
  return (
    isRecord(value) &&
    typeof value.userId === "number" &&
    typeof value.username === "string" &&
    typeof value.accessToken === "string" &&
    typeof value.refreshToken === "string"
  );
}

function loadStoredSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isAuthSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

let sessionCache: AuthSession | null = loadStoredSession();
let refreshPromise: Promise<AuthSession | null> | null = null;

function persistSession(session: AuthSession | null) {
  sessionCache = session;
  try {
    if (session) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures and keep the in-memory session.
  }
}

function extractMessage(data: unknown, text: string, fallback: string) {
  if (isRecord(data)) {
    if (typeof data.message === "string" && data.message.trim()) return data.message;
    if (typeof data.error === "string" && data.error.trim()) return data.error;
    if (Array.isArray(data.errors)) {
      const messages = data.errors
        .map((item) => {
          if (isRecord(item) && typeof item.msg === "string") return item.msg.trim();
          return "";
        })
        .filter(Boolean);
      if (messages.length) return messages.join("\n");
    }
  }

  const trimmedText = text.trim();
  return trimmedText || fallback;
}

async function readResponse(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return { text, data: null as unknown };
  try {
    return { text, data: JSON.parse(text) as unknown };
  } catch {
    return { text, data: null as unknown };
  }
}

async function refreshAccessToken() {
  const currentSession = sessionCache;
  if (!currentSession?.refreshToken) {
    persistSession(null);
    return null;
  }

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const res = await fetch(`${AUTH_BASE}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: currentSession.refreshToken }),
    });

    const { text, data } = await readResponse(res);
    if (!res.ok) {
      persistSession(null);
      throw new UnauthorizedError(
        extractMessage(data, text, "Session expired. Sign in again."),
        data,
      );
    }

    if (!isRecord(data) || typeof data.accessToken !== "string" || !data.accessToken.trim()) {
      persistSession(null);
      throw new UnauthorizedError("Invalid refresh response.", data);
    }

    const nextSession: AuthSession = {
      ...currentSession,
      accessToken: data.accessToken,
    };

    persistSession(nextSession);
    return nextSession;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const shouldAuth = options.auth ?? true;
  const allowRefresh = options.allowRefresh ?? shouldAuth;
  const headers = new Headers(init.headers ?? {});

  if (!(init.body instanceof FormData) && init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (shouldAuth && sessionCache?.accessToken) {
    headers.set("Authorization", `Bearer ${sessionCache.accessToken}`);
  }

  const res = await fetch(`${options.baseUrl ?? API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (res.status === 401 && shouldAuth && allowRefresh && sessionCache?.refreshToken) {
    try {
      const refreshed = await refreshAccessToken();
      if (refreshed?.accessToken) {
        return requestJson<T>(path, init, { ...options, allowRefresh: false });
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new UnauthorizedError("Session expired. Sign in again.");
    }
  }

  const { text, data } = await readResponse(res);
  if (!res.ok) {
    const message = extractMessage(data, text, `API ${res.status}: ${res.statusText}`);
    if (res.status === 401) {
      persistSession(null);
      throw new UnauthorizedError(message, data);
    }
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}

export const authApi = {
  getSession: () => sessionCache,
  clearSession: () => persistSession(null),
  login: async (payload: { username: string; password: string }) => {
    const session = await requestJson<AuthSession>(
      "/login",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      { auth: false, allowRefresh: false, baseUrl: AUTH_BASE },
    );
    persistSession(session);
    return session;
  },
  register: async (payload: { username: string; password: string }) => {
    const session = await requestJson<AuthSession>(
      "/register",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      { auth: false, allowRefresh: false, baseUrl: AUTH_BASE },
    );
    persistSession(session);
    return session;
  },
  logout: async () => {
    try {
      if (sessionCache) {
        await requestJson<{ message: string }>(
          "/logout",
          { method: "POST" },
          { baseUrl: AUTH_BASE },
        );
      }
    } finally {
      persistSession(null);
    }
  },
  restoreSession: async () => {
    if (!sessionCache) return null;
    try {
      await requestJson<unknown>("/tasks", { method: "GET" }, { baseUrl: AUTH_BASE });
      return sessionCache;
    } catch (error) {
      if (error instanceof UnauthorizedError) return null;
      throw error;
    }
  },
};
