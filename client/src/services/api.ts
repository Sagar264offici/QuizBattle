const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3000";

export async function fetchJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${input}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any)?.error ?? "Request failed");
  }

  return (await res.json()) as T;
}
