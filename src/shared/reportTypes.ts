// Shared data contracts for Inspection Desk. Contract version inspection-desk-1.0.
// Everything here is fictional teaching data. Do not add real vehicle identifiers or people.

export const CONTRACT_VERSION = 'inspection-desk-1.0';

export type Severity = 'info' | 'minor' | 'major';

export interface Vehicle {
  id: string;
  stockNumber: string;
  year: number;
  make: string;
  model: string;
  mileage: number;
  exteriorColor: string;
}

export interface Finding {
  id: string;
  area: string;
  severity: Severity;
  description: string;
}

export interface Inspection {
  id: string;
  vehicleId: string;
  revision: number;
  inspectedAt: string;
  inspectorLabel: string;
  findings: Finding[];
}

/** The report content. It never contains a run ID, timestamp of generation, random value or current time. */
export interface ReportDocument {
  schemaVersion: 1;
  inspectionId: string;
  inspectionRevision: number;
  vehicle: Vehicle;
  inspectedAt: string;
  inspectorLabel: string;
  findings: Finding[];
}

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type RunOrigin = 'legacy' | 'job';

export interface RunError {
  code: 'SIMULATED_GENERATION_FAILURE';
  message: string;
}

/** Public, immutable view of a report run returned by the API. */
export interface RunView {
  id: string;
  origin: RunOrigin;
  inspectionId: string;
  vehicleId: string;
  inspectionRevision: number;
  attemptNumber: number;
  parentRunId: string | null;
  retryRunId: string | null;
  status: RunStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: RunError | null;
  report: ReportDocument | null;
}

export type SchedulerMode = 'automatic' | 'manual';

export interface WorkshopState {
  mode: SchedulerMode;
  failNextGeneration: boolean;
  runs: RunView[];
}

export interface StartRunResponse {
  run: RunView;
  reused: boolean;
}

export interface RunResponse {
  run: RunView;
}

export interface LegacyReportResponse {
  runId: string;
  report: ReportDocument;
}

export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'VEHICLE_NOT_FOUND'
  | 'INSPECTION_NOT_FOUND'
  | 'RUN_NOT_FOUND'
  | 'RUN_NOT_RETRYABLE'
  | 'ACTIVE_RUN_EXISTS'
  | 'INVALID_TRANSITION'
  | 'REPORT_NOT_READY'
  | 'SIMULATED_GENERATION_FAILURE'
  | 'NOT_IMPLEMENTED'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}

export const SIMULATED_FAILURE_MESSAGE = 'Report generation failed. Try again.';

export const SEVERITIES: readonly Severity[] = ['info', 'minor', 'major'];
export const RUN_STATUSES: readonly RunStatus[] = ['pending', 'running', 'completed', 'failed'];
export const SCHEDULER_MODES: readonly SchedulerMode[] = ['automatic', 'manual'];
