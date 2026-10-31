// api client - talks to the backend, or to lib/mock.ts when NEXT_PUBLIC_USE_MOCK=true
import type {
  ExecuteRequest,
  ExecuteResult,
  Incident,
  IncidentDetail,
  Plan,
  Ticket,
} from "./types";

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown): Promise<T> =>
  http<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

const mock = () => import("./mock");

export const api = {
  tickets: async (params?: { status?: string; incident_id?: string }): Promise<Ticket[]> => {
    if (USE_MOCK) return (await mock()).listTickets(params);
    const qs = new URLSearchParams(params as Record<string, string> | undefined).toString();
    return http<Ticket[]>(`/tickets${qs ? `?${qs}` : ""}`);
  },
  incidents: async (): Promise<Incident[]> =>
    USE_MOCK ? (await mock()).listIncidents() : http<Incident[]>("/incidents"),
  incident: async (id: string): Promise<IncidentDetail> =>
    USE_MOCK ? (await mock()).getIncident(id) : http<IncidentDetail>(`/incidents/${id}`),
  plan: async (id: string): Promise<Plan> =>
    USE_MOCK ? (await mock()).createPlan(id) : post<Plan>(`/incidents/${id}/plan`),
  execute: async (id: string, req: ExecuteRequest): Promise<ExecuteResult> =>
    USE_MOCK ? (await mock()).executePlan(id, req) : post<ExecuteResult>(`/incidents/${id}/execute`, req),
  demoReset: async (): Promise<{ ok: boolean }> =>
    USE_MOCK ? (await mock()).resetDemo() : post<{ ok: boolean }>("/demo/reset"),
  demoWave: async (): Promise<{ started: boolean }> =>
    USE_MOCK
      ? (await mock()).startWave(12, 800)
      : post<{ started: boolean }>("/demo/wave", { count: 12, interval_ms: 800 }),
};
