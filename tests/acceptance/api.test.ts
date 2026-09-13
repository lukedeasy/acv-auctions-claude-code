/**
 * HTTP-level acceptance assertions for AC-01–AC-06. These run without a browser.
 * They exercise the three learner endpoints, so they fail on the unmodified starter (501) by design.
 * The browser journeys in journeys.spec.ts cover the visible UI parts of the same cases.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RunView } from '../../src/shared/reportTypes.ts';
import { loadFixtures } from '../../src/server/fixtures/loadFixtures.ts';
import { startTestApp, type TestApp } from '../helpers/testApp.ts';

const fixtures = loadFixtures();
let app: TestApp;
type Start = { run: RunView; reused: boolean };
type Err = { error: { code: string; message: string } };

beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await app.api('POST', '/api/workshop/reset', {});
  await app.api('POST', '/api/workshop/config', { mode: 'manual' });
});

const start = (id: string) => app.api<Start>('POST', `/api/inspections/${id}/report-runs`, {});
const read = (runId: string) => app.api<{ run: RunView }>('GET', `/api/report-runs/${runId}`);
const retry = (runId: string) => app.api<Start>('POST', `/api/report-runs/${runId}/retry`, {});
const begin = (runId: string) => app.api<{ run: RunView }>('POST', `/api/workshop/runs/${runId}/begin`, {});
const finish = (runId: string) => app.api<{ run: RunView }>('POST', `/api/workshop/runs/${runId}/finish`, {});
const failNext = () => app.api('POST', '/api/workshop/config', { failNextGeneration: true });

async function failedRun(id = 'insp-001'): Promise<RunView> {
  await failNext();
  const { body } = await start(id);
  await begin(body.run.id);
  const done = await finish(body.run.id);
  expect(done.body.run.status).toBe('failed');
  return done.body.run;
}

describe('AC-01 progress', () => {
  it('[AC-01] Start returns 202 with a pending run and Location before settlement', async () => {
    const res = await start('insp-001');
    expect(res.status).toBe(202);
    expect(res.body.reused).toBe(false);
    expect(res.body.run.status).toBe('pending');
    expect(res.body.run.report).toBeNull();
    expect(res.headers.get('location')).toBe(`/api/report-runs/${res.body.run.id}`);
    const pending = await read(res.body.run.id);
    expect(pending.status).toBe(200);
    expect(pending.body.run.status).toBe('pending');
    await begin(res.body.run.id);
    const running = await read(res.body.run.id);
    expect(running.body.run.status).toBe('running');
    expect(running.body.run.report).toBeNull();
    expect(running.body.run.startedAt).not.toBeNull();
  });

  it('[AC-01] unknown run ID is 404 RUN_NOT_FOUND; missing body is 400', async () => {
    const missing = await app.api<Err>('GET', '/api/report-runs/run-nope');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('RUN_NOT_FOUND');
    const noBody = await fetch(`${app.baseUrl}/api/inspections/insp-001/report-runs`, { method: 'POST' });
    expect(noBody.status).toBe(400);
    const unknownInspection = await app.api<Err>('POST', '/api/inspections/insp-999/report-runs', {});
    expect(unknownInspection.status).toBe(404);
    expect(unknownInspection.body.error.code).toBe('INSPECTION_NOT_FOUND');
  });
});

describe('AC-02 one active run', () => {
  it('[AC-02] repeated Start returns 200 reused with the same run', async () => {
    const first = await start('insp-001');
    const second = await start('insp-001');
    expect(second.status).toBe(200);
    expect(second.body.reused).toBe(true);
    expect(second.body.run.id).toBe(first.body.run.id);
    expect(second.headers.get('location')).toBe(`/api/report-runs/${first.body.run.id}`);
  });

  it('[AC-02] concurrent Start requests observe one identity; other inspections get their own run', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => start('insp-001')));
    const ids = new Set(responses.map((r) => r.body.run.id));
    expect(ids.size).toBe(1);
    expect(responses.filter((r) => r.status === 202)).toHaveLength(1);
    const other = await start('insp-002');
    expect(other.status).toBe(202);
    expect(ids.has(other.body.run.id)).toBe(false);
    const list = await app.api<{ runs: RunView[] }>('GET', '/api/reports');
    expect(list.body.runs).toHaveLength(2);
  });
});

describe('AC-03 correct result', () => {
  it('[AC-03] a finished run is completed and its report matches the expected document for both inspections', async () => {
    for (const [index, id] of ['insp-001', 'insp-002'].entries()) {
      const { body } = await start(id);
      await begin(body.run.id);
      await finish(body.run.id);
      const done = await read(body.run.id);
      expect(done.body.run.status).toBe('completed');
      expect(done.body.run.error).toBeNull();
      expect(done.body.run.report).toEqual(fixtures.expectedReports[index]);
      const doc = await app.api<{ runId: string; report: unknown }>('GET', `/api/reports/${body.run.id}`);
      expect(doc.status).toBe(200);
      expect(doc.body.report).toEqual(fixtures.expectedReports[index]);
    }
  });

  it('[AC-03] report route refuses an unfinished run', async () => {
    const { body } = await start('insp-001');
    const doc = await app.api<Err>('GET', `/api/reports/${body.run.id}`);
    expect(doc.status).toBe(409);
    expect(doc.body.error.code).toBe('REPORT_NOT_READY');
  });
});

describe('AC-04 failure recovery', () => {
  it('[AC-04] a captured failure settles as failed with a useful error and no report', async () => {
    const failed = await failedRun();
    expect(failed.error).toEqual({ code: 'SIMULATED_GENERATION_FAILURE', message: 'Report generation failed. Try again.' });
    expect(failed.report).toBeNull();
    expect(failed.finishedAt).not.toBeNull();
    const view = await read(failed.id);
    expect(view.body.run.status).toBe('failed');
    const doc = await app.api<Err>('GET', `/api/reports/${failed.id}`);
    expect(doc.status).toBe(409);
  });
});

describe('AC-05 safe retry', () => {
  it('[AC-05] retry creates one child from the original snapshot and links the parent', async () => {
    const parent = await failedRun();
    const rev = fixtures.inspections[0]!;
    await app.api('POST', '/api/workshop/inspection-revision', {
      inspectionId: 'insp-001',
      revision: rev.revision + 1,
      findings: [{ id: 'finding-revision-2', area: 'Exterior', severity: 'info', description: 'Revision two finding for snapshot testing.' }],
    });
    const res = await retry(parent.id);
    expect(res.status).toBe(202);
    expect(res.body.reused).toBe(false);
    expect(res.body.run.parentRunId).toBe(parent.id);
    expect(res.body.run.attemptNumber).toBe(2);
    expect(res.body.run.inspectionRevision).toBe(1);
    expect(res.headers.get('location')).toBe(`/api/report-runs/${res.body.run.id}`);
    const parentView = await read(parent.id);
    expect(parentView.body.run.retryRunId).toBe(res.body.run.id);
    expect(parentView.body.run.status).toBe('failed');
    await begin(res.body.run.id);
    await finish(res.body.run.id);
    const done = await read(res.body.run.id);
    expect(done.body.run.report).toEqual(fixtures.expectedReports[0]);
  });

  it('[AC-05] repeated and concurrent retry return the same child (200 reused), even after it settles', async () => {
    const parent = await failedRun();
    const responses = await Promise.all(Array.from({ length: 6 }, () => retry(parent.id)));
    const ids = new Set(responses.map((r) => r.body.run.id));
    expect(ids.size).toBe(1);
    expect(responses.filter((r) => r.status === 202)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 200 && r.body.reused)).toHaveLength(5);
    const childId = [...ids][0]!;
    await begin(childId);
    await finish(childId);
    const again = await retry(parent.id);
    expect(again.status).toBe(200);
    expect(again.body.run.id).toBe(childId);
    const list = await app.api<{ runs: RunView[] }>('GET', '/api/inspections/insp-001/reports');
    expect(list.body.runs).toHaveLength(2);
  });

  it('[AC-05] ineligible retry returns 409 and creates nothing', async () => {
    const { body } = await start('insp-001');
    const pending = await retry(body.run.id);
    expect(pending.status).toBe(409);
    expect((pending.body as unknown as Err).error.code).toBe('RUN_NOT_RETRYABLE');
    await begin(body.run.id);
    await finish(body.run.id);
    const completed = await retry(body.run.id);
    expect(completed.status).toBe(409);
    const legacy = await app.api<{ runId: string }>('POST', '/api/inspections/insp-002/report', {});
    const legacyRetry = await retry(legacy.body.runId);
    expect(legacyRetry.status).toBe(409);
    expect((legacyRetry.body as unknown as Err).error.code).toBe('RUN_NOT_RETRYABLE');
    const unknown = await retry('run-nope');
    expect(unknown.status).toBe(404);
    const list = await app.api<{ runs: RunView[] }>('GET', '/api/reports');
    expect(list.body.runs).toHaveLength(2);
  });

  it('[AC-05] retry conflicts when another independent run is active for the inspection', async () => {
    const parent = await failedRun();
    const fresh = await start('insp-001');
    expect(fresh.status).toBe(202);
    const res = await retry(parent.id);
    expect(res.status).toBe(409);
    expect((res.body as unknown as Err).error.code).toBe('ACTIVE_RUN_EXISTS');
    const list = await app.api<{ runs: RunView[] }>('GET', '/api/inspections/insp-001/reports');
    expect(list.body.runs).toHaveLength(2);
  });
});

describe('AC-06 preserved contents', () => {
  it('[AC-06] legacy and job documents are identical for the same snapshot and contain no runtime values', async () => {
    const legacy = await app.api<{ runId: string; report: Record<string, unknown> }>('POST', '/api/inspections/insp-001/report', {});
    const { body } = await start('insp-001');
    await begin(body.run.id);
    await finish(body.run.id);
    const job = await read(body.run.id);
    expect(job.body.run.report).toEqual(legacy.body.report);
    expect(job.body.run.report).toEqual(fixtures.expectedReports[0]);
    const text = JSON.stringify(job.body.run.report);
    expect(text).not.toContain(body.run.id);
    expect(text).not.toContain(body.run.createdAt);
    for (const key of ['runId', 'attemptNumber', 'createdAt', 'status']) expect(job.body.run.report).not.toHaveProperty(key);
  });
});
