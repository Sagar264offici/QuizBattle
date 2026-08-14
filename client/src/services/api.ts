const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  ((import.meta as any).env?.DEV ? "http://localhost:3000" : "");

// Stored admin password for header-based auth (avoids cookie cross-lambda issues)
let _adminPassword: string | null = null;
export function setAdminPassword(pw: string) { _adminPassword = pw; }
export function getAdminPassword() { return _adminPassword ?? sessionStorage.getItem("quizbattle-admin-pw") ?? ""; }
export function clearAdminPassword() {
  _adminPassword = null;
  sessionStorage.removeItem("quizbattle-admin-pw");
}

/**
 * QuizBattle runs in two isolated modes:
 *  - "live": the real 100-question college quiz (default, unchanged behavior)
 *  - "test": the 20-question testing mode used before the event
 * Test-mode requests are scoped under /api/test/... so the two never share state.
 */
export type QuizMode = "live" | "test";

export function apiPath(mode: QuizMode, path: string): string {
  if (mode === "test") {
    return path.replace(/^\/api\//, "/api/test/");
  }
  return path;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** True when the server reported that this student session was ended by the host. */
export function isSessionExpired(err: unknown): boolean {
  return err instanceof ApiError && err.code === "SESSION_EXPIRED";
}

/** True when the server reported that this student was individually removed by the host. */
export function isParticipantKicked(err: unknown): boolean {
  return err instanceof ApiError && err.code === "PARTICIPANT_KICKED";
}

/** Default per-request timeout so a slow/hung server never blocks the UI forever. */
const REQUEST_TIMEOUT_MS = 10000;

export async function fetchJson<T>(
  input: string,
  init?: RequestInit,
  mode: QuizMode = "live",
): Promise<T> {
  const adminPw = getAdminPassword();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const res = await fetch(`${API_BASE}${apiPath(mode, input)}`, {
    ...init,
    credentials: "include",
    signal: init?.signal ?? controller.signal,
    headers: {
      "Content-Type": "application/json",
      ...(adminPw ? { "x-admin-password": adminPw } : {}),
      ...(init?.headers ?? {}),
    },
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      (data as any)?.error ?? "Request failed",
      res.status,
      (data as any)?.code,
    );
  }

  return (await res.json()) as T;
}
