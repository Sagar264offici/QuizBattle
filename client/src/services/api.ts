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

export async function fetchJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const adminPw = getAdminPassword();
  const res = await fetch(`${API_BASE}${input}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(adminPw ? { "x-admin-password": adminPw } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any)?.error ?? "Request failed");
  }

  return (await res.json()) as T;
}
