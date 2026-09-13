import type { Inspection, ReportDocument, RunError, RunOrigin, RunStatus, RunView, Vehicle } from '../../shared/reportTypes.ts';

/** Internal stored run. Snapshots are immutable copies taken when the attempt was created. */
export interface StoredRun {
  id: string;
  origin: RunOrigin;
  inspectionId: string;
  attemptNumber: number;
  parentRunId: string | null;
  retryRunId: string | null;
  inspectionSnapshot: Inspection;
  vehicleSnapshot: Vehicle;
  status: RunStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: RunError | null;
  report: ReportDocument | null;
  /** Captured on creation from the "fail next generation" control. Never exposed through the API. */
  shouldFail: boolean;
  /** Monotonic creation sequence for newest-first ordering independent of clock formatting. */
  sequence: number;
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function toRunView(run: StoredRun): RunView {
  return {
    id: run.id,
    origin: run.origin,
    inspectionId: run.inspectionId,
    vehicleId: run.vehicleSnapshot.id,
    inspectionRevision: run.inspectionSnapshot.revision,
    attemptNumber: run.attemptNumber,
    parentRunId: run.parentRunId,
    retryRunId: run.retryRunId,
    status: run.status,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    error: run.error ? deepClone(run.error) : null,
    report: run.report ? deepClone(run.report) : null,
  };
}

/**
 * In-memory runtime state. It lives only while the server process runs; restarting resets it.
 * Callers never receive references into this state: every read returns a copy.
 */
export class ReportStore {
  private runs = new Map<string, StoredRun>();
  private activeJobByInspection = new Map<string, string>();
  private attemptCounters = new Map<string, number>();
  private sequence = 0;

  insert(run: Omit<StoredRun, 'sequence'>): StoredRun {
    if (this.runs.has(run.id)) throw new Error(`Run ${run.id} already exists`);
    this.sequence += 1;
    const stored: StoredRun = { ...deepClone(run), sequence: this.sequence };
    this.runs.set(stored.id, stored);
    return deepClone(stored);
  }

  get(id: string): StoredRun | undefined {
    const run = this.runs.get(id);
    return run ? deepClone(run) : undefined;
  }

  update(id: string, patch: Partial<Omit<StoredRun, 'id' | 'sequence'>>): StoredRun {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Run ${id} does not exist`);
    Object.assign(run, deepClone(patch));
    return deepClone(run);
  }

  list(inspectionId?: string): StoredRun[] {
    const all = [...this.runs.values()].filter((run) => !inspectionId || run.inspectionId === inspectionId);
    all.sort((a, b) => b.sequence - a.sequence);
    return all.map((run) => deepClone(run));
  }

  activeJobFor(inspectionId: string): StoredRun | undefined {
    const id = this.activeJobByInspection.get(inspectionId);
    return id ? this.get(id) : undefined;
  }

  hasAnyActiveJob(): boolean {
    return this.activeJobByInspection.size > 0;
  }

  setActiveJob(inspectionId: string, runId: string): void {
    this.activeJobByInspection.set(inspectionId, runId);
  }

  clearActiveJob(inspectionId: string, runId: string): void {
    if (this.activeJobByInspection.get(inspectionId) === runId) this.activeJobByInspection.delete(inspectionId);
  }

  nextAttemptNumber(inspectionId: string): number {
    const next = (this.attemptCounters.get(inspectionId) ?? 0) + 1;
    this.attemptCounters.set(inspectionId, next);
    return next;
  }

  reset(): void {
    this.runs.clear();
    this.activeJobByInspection.clear();
    this.attemptCounters.clear();
    this.sequence = 0;
  }
}
