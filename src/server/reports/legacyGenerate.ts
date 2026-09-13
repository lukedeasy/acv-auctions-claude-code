import { SIMULATED_FAILURE_MESSAGE, type LegacyReportResponse } from '../../shared/reportTypes.ts';
import { ServiceError } from '../errors.ts';
import type { FixtureStore } from '../fixtures/loadFixtures.ts';
import { buildReport } from './buildReport.ts';
import type { ReportJobService } from './reportJobs.ts';
import { createSystemClock, type Clock } from './scheduler.ts';

/**
 * The older synchronous generation path. The request waits for the whole build.
 * It is kept for baseline comparison of report contents; the modernized UI moves to run-based generation.
 * This module is the one legacy module allowed to call the report builder directly.
 */
export interface LegacyGeneratorOptions {
  fixtures: FixtureStore;
  service: ReportJobService;
  /** Injected wait. Tests replace it; they do not sleep to infer correctness. */
  delay?: (ms: number) => Promise<void>;
  delayMs?: number;
  clock?: Clock;
}

export interface LegacyGenerator {
  generate(inspectionId: string): Promise<LegacyReportResponse>;
}

export function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createLegacyGenerator(options: LegacyGeneratorOptions): LegacyGenerator {
  const delay = options.delay ?? defaultDelay;
  const delayMs = options.delayMs ?? 500;
  const clock = options.clock ?? createSystemClock();
  return {
    async generate(inspectionId) {
      // Capture the snapshot and the failure decision before waiting, so nothing during the wait changes the input.
      const snapshot = options.fixtures.snapshot(inspectionId);
      const shouldFail = options.service.consumeFailNextGeneration();
      const startedAt = clock.now().toISOString();
      await delay(delayMs);
      if (shouldFail) {
        throw new ServiceError('SIMULATED_GENERATION_FAILURE', SIMULATED_FAILURE_MESSAGE);
      }
      const report = buildReport(snapshot.inspection, snapshot.vehicle);
      const run = options.service.recordLegacyCompleted(snapshot, report, startedAt);
      return { runId: run.id, report };
    },
  };
}
