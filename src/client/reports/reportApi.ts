import type { ApiErrorBody, LegacyReportResponse, RunView } from '../../shared/reportTypes.ts';

/** Error thrown for non-2xx API responses. Carries the documented error code when present. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body && body.error && typeof body.error.code === 'string') {
      return new ApiError(response.status, body.error.code, body.error.message);
    }
  } catch {
    // fall through
  }
  return new ApiError(response.status, 'UNKNOWN', `Request failed with status ${response.status}.`);
}

export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as T;
}

/** Older synchronous generation: the request waits until the server has built the report. */
export function requestLegacyReport(inspectionId: string, signal?: AbortSignal): Promise<LegacyReportResponse> {
  return fetchJson<LegacyReportResponse>(`/api/inspections/${encodeURIComponent(inspectionId)}/report`, {
    method: 'POST',
    body: '{}',
    signal,
  });
}

/** Latest records for an inspection (newest first). Prepared read route. */
export function listInspectionRuns(inspectionId: string, signal?: AbortSignal): Promise<{ runs: RunView[] }> {
  return fetchJson<{ runs: RunView[] }>(`/api/inspections/${encodeURIComponent(inspectionId)}/reports`, { signal });
}
