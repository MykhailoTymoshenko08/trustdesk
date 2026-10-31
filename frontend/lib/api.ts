// api client - talks to the backend, or to lib/mock.ts when NEXT_PUBLIC_USE_MOCK=true
import type {
  AuditEntry,
  DevCard,
  EvalReport,
  ExecuteRequest,
  ExecuteResult,
  Incident,
  IncidentDetail,
  Gotcha,
  Metrics,
  NewTicket,
  Plan,
  QaItem,
  QaScoreRequest,
  Sourced,
  Ticket,
} from "./types";

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error?.message ?? `request failed: ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown): Promise<T> =>
  http<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

const mock = () => import("./mock");

// endpoints the backend may not have yet: fall back to sample data on 404/405 and say so
async function orSample<T>(real: () => Promise<T>, sample: () => Promise<T>): Promise<Sourced<T>> {
  if (USE_MOCK) return { data: await sample(), mocked: true };
  try {
    return { data: await real(), mocked: false };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
      return { data: await sample(), mocked: true };
    }
    throw e;
  }
}

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
  createTicket: async (body: NewTicket): Promise<Ticket> =>
    USE_MOCK ? (await mock()).createTicket(body) : post<Ticket>("/tickets", body),
  devcard: async (id: string): Promise<DevCard> =>
    USE_MOCK ? (await mock()).getDevCard(id) : http<DevCard>(`/incidents/${id}/devcard`),
  audit: async (incidentId?: string): Promise<AuditEntry[]> =>
    USE_MOCK
      ? (await mock()).listAudit(incidentId)
      : http<AuditEntry[]>(`/audit${incidentId ? `?incident_id=${incidentId}` : ""}`),
  rollback: async (id: string, by: string): Promise<AuditEntry> =>
    USE_MOCK ? (await mock()).rollbackAudit(id, by) : post<AuditEntry>(`/audit/${id}/rollback`, { by }),
  eval: async (): Promise<EvalReport> =>
    USE_MOCK ? (await mock()).getEval() : http<EvalReport>("/eval"),
  metrics: async (): Promise<Metrics> =>
    USE_MOCK ? (await mock()).getMetrics() : http<Metrics>("/metrics"),
  qa: async (): Promise<Sourced<QaItem[]>> =>
    orSample(() => http<QaItem[]>("/qa"), async () => (await mock()).listQa()),
  qaScore: async (body: QaScoreRequest): Promise<Sourced<QaItem>> =>
    orSample(() => post<QaItem>("/qa/score", body), async () => (await mock()).scoreReply(body)),
  gotcha: async (incidentId: string): Promise<Sourced<Gotcha>> =>
    orSample(
      () => http<Gotcha>(`/incidents/${incidentId}/gotcha`),
      async () => (await mock()).getGotcha(incidentId),
    ),
  demoReset: async (): Promise<{ ok: boolean }> =>
    USE_MOCK ? (await mock()).resetDemo() : post<{ ok: boolean }>("/demo/reset"),
  demoWave: async (): Promise<{ started: boolean }> =>
    USE_MOCK
      ? (await mock()).startWave(12, 800)
      : post<{ started: boolean }>("/demo/wave", { count: 12, interval_ms: 800 }),
};
