import { beforeEach, describe, expect, it } from 'vitest';
import { FixtureStore, loadFixtures } from '../../src/server/fixtures/loadFixtures.ts';
import { ServiceError } from '../../src/server/errors.ts';
import { buildReport } from '../../src/server/reports/buildReport.ts';
import { createReportJobService, type ReportJobService } from '../../src/server/reports/reportJobs.ts';
import { createFixedClock, createManualTimerScheduler, createSequentialIdFactory, type ManualTimerScheduler } from '../../src/server/reports/scheduler.ts';

const source = loadFixtures();
let fixtures: FixtureStore;
let service: ReportJobService;
let timers: ManualTimerScheduler;

beforeEach(() => {
  fixtures = new FixtureStore(source);
  timers = createManualTimerScheduler();
  service = createReportJobService({ fixtures, clock: createFixedClock(), ids: createSequentialIdFactory(), timers });
});

function expectServiceError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).code).toBe(code);
    return;
  }
  throw new Error(`expected ServiceError ${code}`);
}

describe('start', () => {
  it('creates a pending job with attempt number 1 and current snapshots', () => {
    const { run, reused } = service.start('insp-001');
    expect(reused).toBe(false);
    expect(run.status).toBe('pending');
    expect(run.origin).toBe('job');
    expect(run.attemptNumber).toBe(1);
    expect(run.inspectionRevision).toBe(1);
    expect(run.vehicleId).toBe('veh-001');
    expect(run.report).toBeNull();
    expect(run.error).toBeNull();
    expect(run.startedAt).toBeNull();
  });

  it('returns the existing active run for repeated and concurrent Start', () => {
    const first = service.start('insp-001');
    const second = service.start('insp-001');
    expect(second.reused).toBe(true);
    expect(second.run.id).toBe(first.run.id);
    // Synchronous calls in a tight loop model concurrent HTTP requests hitting the same process.
    const ids = new Set(Array.from({ length: 10 }, () => service.start('insp-001').run.id));
    expect(ids.size).toBe(1);
    expect(service.list('insp-001')).toHaveLength(1);
  });

  it('allows different inspections to run concurrently', () => {
    const a = service.start('insp-001');
    const b = service.start('insp-002');
    expect(a.run.id).not.toBe(b.run.id);
    expect(service.getWorkshopState().runs).toHaveLength(2);
  });

  it('rejects an unknown inspection', () => {
    expectServiceError(() => service.start('insp-999'), 'INSPECTION_NOT_FOUND');
  });

  it('automatic mode begins after 250 ms and settles after another 750 ms', () => {
    const { run } = service.start('insp-001');
    timers.advance(249);
    expect(service.get(run.id).status).toBe('pending');
    timers.advance(1);
    expect(service.get(run.id).status).toBe('running');
    timers.advance(749);
    expect(service.get(run.id).status).toBe('running');
    timers.advance(1);
    const done = service.get(run.id);
    expect(done.status).toBe('completed');
    expect(done.report).toEqual(source.expectedReports[0]);
    expect(done.finishedAt).not.toBeNull();
  });

  it('starting anew after a terminal run uses the current revision', () => {
    service.setMode('manual');
    const first = service.start('insp-001');
    service.beginAttempt(first.run.id);
    service.finishAttempt(first.run.id);
    fixtures.updateInspectionRevision('insp-001', 2, [{ id: 'f-new', area: 'Exterior', severity: 'info', description: 'rev 2' }]);
    const second = service.start('insp-001');
    expect(second.reused).toBe(false);
    expect(second.run.attemptNumber).toBe(2);
    expect(second.run.inspectionRevision).toBe(2);
    expect(service.get(first.run.id).inspectionRevision).toBe(1);
  });
});

describe('manual scheduling', () => {
  it('begin and finish transition pending → running → completed', () => {
    service.setMode('manual');
    const { run } = service.start('insp-002');
    timers.advance(10000);
    expect(service.get(run.id).status).toBe('pending');
    expect(service.beginAttempt(run.id).status).toBe('running');
    const done = service.finishAttempt(run.id);
    expect(done.status).toBe('completed');
    expect(done.report).toEqual(source.expectedReports[1]);
  });

  it('rejects invalid transitions without changing state', () => {
    service.setMode('manual');
    const { run } = service.start('insp-001');
    expectServiceError(() => service.finishAttempt(run.id), 'INVALID_TRANSITION');
    expect(service.get(run.id).status).toBe('pending');
    service.beginAttempt(run.id);
    expectServiceError(() => service.beginAttempt(run.id), 'INVALID_TRANSITION');
    expect(service.get(run.id).status).toBe('running');
  });

  it('begin/finish are rejected in automatic mode', () => {
    const { run } = service.start('insp-001');
    expectServiceError(() => service.beginAttempt(run.id), 'INVALID_TRANSITION');
  });

  it('mode cannot change while a job is active', () => {
    service.start('insp-001');
    expectServiceError(() => service.setMode('manual'), 'INVALID_TRANSITION');
    timers.advance(1000);
    expect(service.setMode('manual').mode).toBe('manual');
  });
});

describe('failure injection', () => {
  it('captures the fail-next decision on creation and consumes it once', () => {
    service.setMode('manual');
    service.setFailNextGeneration(true);
    const a = service.start('insp-001');
    expect(service.getWorkshopState().failNextGeneration).toBe(false);
    const reused = service.start('insp-001');
    expect(reused.reused).toBe(true);
    const b = service.start('insp-002');
    service.beginAttempt(b.run.id);
    expect(service.finishAttempt(b.run.id).status).toBe('completed');
    service.beginAttempt(a.run.id);
    const failed = service.finishAttempt(a.run.id);
    expect(failed.status).toBe('failed');
    expect(failed.error).toEqual({ code: 'SIMULATED_GENERATION_FAILURE', message: 'Report generation failed. Try again.' });
    expect(failed.report).toBeNull();
  });
});

describe('retry', () => {
  function failedRun(inspectionId = 'insp-001') {
    service.setMode('manual');
    service.setFailNextGeneration(true);
    const { run } = service.start(inspectionId);
    service.beginAttempt(run.id);
    return service.finishAttempt(run.id);
  }

  it('creates one child from the original snapshots and links the parent', () => {
    const parent = failedRun();
    fixtures.updateInspectionRevision('insp-001', 2, [{ id: 'f-new', area: 'Exterior', severity: 'info', description: 'rev 2' }]);
    const { run: child, reused } = service.retry(parent.id);
    expect(reused).toBe(false);
    expect(child.parentRunId).toBe(parent.id);
    expect(child.attemptNumber).toBe(2);
    expect(child.inspectionRevision).toBe(1);
    expect(child.status).toBe('pending');
    expect(service.get(parent.id).retryRunId).toBe(child.id);
    expect(service.get(parent.id).status).toBe('failed');
    service.beginAttempt(child.id);
    const done = service.finishAttempt(child.id);
    expect(done.report).toEqual(source.expectedReports[0]);
    expect(done.report!.inspectionRevision).toBe(1);
  });

  it('repeated and concurrent retry return the same child, even after it settles', () => {
    const parent = failedRun();
    const ids = new Set(Array.from({ length: 5 }, () => service.retry(parent.id).run.id));
    expect(ids.size).toBe(1);
    const childId = [...ids][0]!;
    service.beginAttempt(childId);
    service.finishAttempt(childId);
    const again = service.retry(parent.id);
    expect(again.reused).toBe(true);
    expect(again.run.id).toBe(childId);
    expect(service.list('insp-001')).toHaveLength(2);
  });

  it('rejects retry of pending, running, completed and legacy runs', () => {
    service.setMode('manual');
    const { run } = service.start('insp-001');
    expectServiceError(() => service.retry(run.id), 'RUN_NOT_RETRYABLE');
    service.beginAttempt(run.id);
    expectServiceError(() => service.retry(run.id), 'RUN_NOT_RETRYABLE');
    service.finishAttempt(run.id);
    expectServiceError(() => service.retry(run.id), 'RUN_NOT_RETRYABLE');
    const snapshot = fixtures.snapshot('insp-002');
    const legacy = service.recordLegacyCompleted(snapshot, buildReport(snapshot.inspection, snapshot.vehicle), '2026-09-17T13:00:00.000Z');
    expectServiceError(() => service.retry(legacy.id), 'RUN_NOT_RETRYABLE');
    expect(service.list()).toHaveLength(2);
  });

  it('rejects retry when another independent run is active for the inspection', () => {
    const parent = failedRun();
    const fresh = service.start('insp-001');
    expect(fresh.reused).toBe(false);
    expectServiceError(() => service.retry(parent.id), 'ACTIVE_RUN_EXISTS');
    expect(service.list('insp-001')).toHaveLength(2);
    expect(service.get(parent.id).retryRunId).toBeNull();
  });

  it('a failed child can itself be retried, keeping the original snapshots', () => {
    const parent = failedRun();
    service.setFailNextGeneration(true);
    const child = service.retry(parent.id).run;
    service.beginAttempt(child.id);
    expect(service.finishAttempt(child.id).status).toBe('failed');
    const grandchild = service.retry(child.id).run;
    expect(grandchild.attemptNumber).toBe(3);
    expect(grandchild.parentRunId).toBe(child.id);
    expect(grandchild.inspectionRevision).toBe(1);
  });

  it('rejects an unknown run', () => {
    expectServiceError(() => service.retry('run-nope'), 'RUN_NOT_FOUND');
  });
});

describe('legacy records', () => {
  it('stores a completed record with attempt 0 that never counts as active', () => {
    const snapshot = fixtures.snapshot('insp-001');
    const report = buildReport(snapshot.inspection, snapshot.vehicle);
    const legacy = service.recordLegacyCompleted(snapshot, report, '2026-09-17T13:00:00.000Z');
    expect(legacy.origin).toBe('legacy');
    expect(legacy.attemptNumber).toBe(0);
    expect(legacy.status).toBe('completed');
    expect(legacy.report).toEqual(report);
    const job = service.start('insp-001');
    expect(job.reused).toBe(false);
    expect(job.run.attemptNumber).toBe(1);
  });
});

describe('views and reset', () => {
  it('returned views are copies; mutating them does not change stored state', () => {
    const { run } = service.start('insp-001');
    run.status = 'completed';
    expect(service.get(run.id).status).toBe('pending');
    const list = service.list();
    list[0]!.status = 'failed';
    expect(service.get(run.id).status).toBe('pending');
  });

  it('list returns newest first', () => {
    const a = service.start('insp-001');
    const b = service.start('insp-002');
    expect(service.list().map((run) => run.id)).toEqual([b.run.id, a.run.id]);
  });

  it('reset cancels scheduled work, clears runs and restores fixtures', () => {
    const { run } = service.start('insp-001');
    fixtures.updateInspectionRevision('insp-001', 2, [{ id: 'f-new', area: 'Exterior', severity: 'info', description: 'rev 2' }]);
    const state = service.reset();
    expect(state.runs).toHaveLength(0);
    expect(state.mode).toBe('automatic');
    expect(timers.pendingCount()).toBe(0);
    timers.advance(5000);
    expectServiceError(() => service.get(run.id), 'RUN_NOT_FOUND');
    expect(fixtures.getInspection('insp-001').revision).toBe(1);
  });
});
