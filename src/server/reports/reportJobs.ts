import {
  SIMULATED_FAILURE_MESSAGE,
  type Inspection,
  type ReportDocument,
  type RunView,
  type SchedulerMode,
  type Vehicle,
  type WorkshopState,
} from '../../shared/reportTypes.ts';
import { ServiceError } from '../errors.ts';
import type { FixtureStore } from '../fixtures/loadFixtures.ts';
import { buildReport } from './buildReport.ts';
import { ReportStore, toRunView, type StoredRun } from './reportStore.ts';
import {
  createRandomIdFactory,
  createSystemClock,
  createTimerScheduler,
  type Clock,
  type IdFactory,
  type TimerHandle,
  type TimerScheduler,
} from './scheduler.ts';

/**
 * Prepared report-job service. It owns run identity, snapshots, the one-active-run rule,
 * retry validation and the workshop test controls. Route handlers call this service;
 * they do not build reports or touch the store directly.
 *
 * Learners connect the application to this service. They do not build a job queue.
 */
export interface ReportJobServiceOptions {
  fixtures: FixtureStore;
  store?: ReportStore;
  clock?: Clock;
  ids?: IdFactory;
  timers?: TimerScheduler;
  /** Automatic scheduling delays. Demo settings, not performance targets. */
  automaticBeginDelayMs?: number;
  automaticSettleDelayMs?: number;
}

export interface StartResult {
  run: RunView;
  reused: boolean;
}

export interface ReportJobService {
  /** Start a job for an inspection, or return the existing pending/running job for it. */
  start(inspectionId: string): StartResult;
  /** Retry a failed job attempt. Returns the linked child; repeated retry returns the same child. */
  retry(runId: string): StartResult;
  get(runId: string): RunView;
  list(inspectionId?: string): RunView[];
  /** Store a completed legacy record (attempt number 0). Legacy records never count as active jobs. */
  recordLegacyCompleted(snapshot: { inspection: Inspection; vehicle: Vehicle }, report: ReportDocument, startedAt: string): RunView;
  /** Read the "fail next generation" flag and clear it. Used when a new attempt is created. */
  consumeFailNextGeneration(): boolean;
  // Workshop controls
  getWorkshopState(): WorkshopState;
  setMode(mode: SchedulerMode): WorkshopState;
  setFailNextGeneration(value: boolean): WorkshopState;
  beginAttempt(runId: string): RunView;
  finishAttempt(runId: string): RunView;
  reset(): WorkshopState;
}

export function createReportJobService(options: ReportJobServiceOptions): ReportJobService {
  const fixtures = options.fixtures;
  const store = options.store ?? new ReportStore();
  const clock = options.clock ?? createSystemClock();
  const ids = options.ids ?? createRandomIdFactory();
  const timers = options.timers ?? createTimerScheduler();
  const beginDelay = options.automaticBeginDelayMs ?? 250;
  const settleDelay = options.automaticSettleDelayMs ?? 750;

  let mode: SchedulerMode = 'automatic';
  let failNextGeneration = false;
  const scheduled = new Map<string, TimerHandle>();

  function iso(): string {
    return clock.now().toISOString();
  }

  function requireRun(runId: string): StoredRun {
    const run = store.get(runId);
    if (!run) throw new ServiceError('RUN_NOT_FOUND', `Run ${runId} was not found.`);
    return run;
  }

  function transitionToRunning(runId: string): StoredRun {
    const run = requireRun(runId);
    if (run.status !== 'pending') {
      throw new ServiceError('INVALID_TRANSITION', `Run ${runId} is ${run.status}; only a pending attempt can begin.`);
    }
    return store.update(runId, { status: 'running', startedAt: iso() });
  }

  function settle(runId: string): StoredRun {
    const run = requireRun(runId);
    if (run.status !== 'running') {
      throw new ServiceError('INVALID_TRANSITION', `Run ${runId} is ${run.status}; only a running attempt can finish.`);
    }
    const finishedAt = iso();
    const updated = run.shouldFail
      ? store.update(runId, {
          status: 'failed',
          finishedAt,
          error: { code: 'SIMULATED_GENERATION_FAILURE', message: SIMULATED_FAILURE_MESSAGE },
          report: null,
        })
      : store.update(runId, {
          status: 'completed',
          finishedAt,
          error: null,
          report: buildReport(run.inspectionSnapshot, run.vehicleSnapshot),
        });
    store.clearActiveJob(run.inspectionId, runId);
    return updated;
  }

  function scheduleAutomatic(runId: string): void {
    if (mode !== 'automatic') return;
    const beginHandle = timers.set(() => {
      scheduled.delete(runId);
      const current = store.get(runId);
      if (!current || current.status !== 'pending') return;
      transitionToRunning(runId);
      const settleHandle = timers.set(() => {
        scheduled.delete(runId);
        const latest = store.get(runId);
        if (!latest || latest.status !== 'running') return;
        settle(runId);
      }, settleDelay);
      scheduled.set(runId, settleHandle);
    }, beginDelay);
    scheduled.set(runId, beginHandle);
  }

  function createJobAttempt(
    inspectionId: string,
    snapshot: { inspection: Inspection; vehicle: Vehicle },
    parentRunId: string | null,
  ): StoredRun {
    const shouldFail = failNextGeneration;
    failNextGeneration = false;
    const run = store.insert({
      id: ids.next('run'),
      origin: 'job',
      inspectionId,
      attemptNumber: store.nextAttemptNumber(inspectionId),
      parentRunId,
      retryRunId: null,
      inspectionSnapshot: snapshot.inspection,
      vehicleSnapshot: snapshot.vehicle,
      status: 'pending',
      createdAt: iso(),
      startedAt: null,
      finishedAt: null,
      error: null,
      report: null,
      shouldFail,
    });
    store.setActiveJob(inspectionId, run.id);
    scheduleAutomatic(run.id);
    return run;
  }

  const service: ReportJobService = {
    start(inspectionId) {
      // Active-run lookup and creation are synchronous: concurrent callers observe one identity.
      const active = store.activeJobFor(inspectionId);
      if (active) return { run: toRunView(active), reused: true };
      const snapshot = fixtures.snapshot(inspectionId);
      const run = createJobAttempt(inspectionId, snapshot, null);
      return { run: toRunView(run), reused: false };
    },

    retry(runId) {
      const parent = requireRun(runId);
      if (parent.origin !== 'job' || parent.status !== 'failed') {
        throw new ServiceError('RUN_NOT_RETRYABLE', 'Only failed job attempts can be retried.');
      }
      if (parent.retryRunId) {
        return { run: toRunView(requireRun(parent.retryRunId)), reused: true };
      }
      const active = store.activeJobFor(parent.inspectionId);
      if (active) {
        throw new ServiceError('ACTIVE_RUN_EXISTS', `Inspection ${parent.inspectionId} already has an active attempt ${active.id}.`);
      }
      const child = createJobAttempt(
        parent.inspectionId,
        { inspection: parent.inspectionSnapshot, vehicle: parent.vehicleSnapshot },
        parent.id,
      );
      store.update(parent.id, { retryRunId: child.id });
      return { run: toRunView(child), reused: false };
    },

    get(runId) {
      return toRunView(requireRun(runId));
    },

    list(inspectionId) {
      return store.list(inspectionId).map(toRunView);
    },

    recordLegacyCompleted(snapshot, report, startedAt) {
      const run = store.insert({
        id: ids.next('legacy'),
        origin: 'legacy',
        inspectionId: snapshot.inspection.id,
        attemptNumber: 0,
        parentRunId: null,
        retryRunId: null,
        inspectionSnapshot: snapshot.inspection,
        vehicleSnapshot: snapshot.vehicle,
        status: 'completed',
        createdAt: startedAt,
        startedAt,
        finishedAt: iso(),
        error: null,
        report,
        shouldFail: false,
      });
      return toRunView(run);
    },

    consumeFailNextGeneration() {
      const value = failNextGeneration;
      failNextGeneration = false;
      return value;
    },

    getWorkshopState() {
      return { mode, failNextGeneration, runs: store.list().map(toRunView) };
    },

    setMode(nextMode) {
      if (nextMode !== mode && store.hasAnyActiveJob()) {
        throw new ServiceError('INVALID_TRANSITION', 'Scheduling mode can only change while no attempt is pending or running.');
      }
      mode = nextMode;
      return service.getWorkshopState();
    },

    setFailNextGeneration(value) {
      failNextGeneration = value;
      return service.getWorkshopState();
    },

    beginAttempt(runId) {
      if (mode !== 'manual') throw new ServiceError('INVALID_TRANSITION', 'Begin is available only in manual scheduling mode.');
      return toRunView(transitionToRunning(runId));
    },

    finishAttempt(runId) {
      if (mode !== 'manual') throw new ServiceError('INVALID_TRANSITION', 'Finish is available only in manual scheduling mode.');
      return toRunView(settle(runId));
    },

    reset() {
      for (const handle of scheduled.values()) timers.clear(handle);
      scheduled.clear();
      store.reset();
      fixtures.reset();
      mode = 'automatic';
      failNextGeneration = false;
      return service.getWorkshopState();
    },
  };

  return service;
}
