import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadFixtures } from '../../src/server/fixtures/loadFixtures.ts';
import { startTestApp, type TestApp } from '../helpers/testApp.ts';

const fixtures = loadFixtures();
let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.close();
});

describe('[BASE-01] prepared read routes', () => {
  it('[BASE-01] health reports the contract version', async () => {
    const res = await app.api<{ status: string; contractVersion: string }>('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', contractVersion: 'inspection-desk-1.0' });
  });

  it('[BASE-01] vehicles list matches the fixture order', async () => {
    const res = await app.api<{ vehicles: unknown[] }>('GET', '/api/vehicles');
    expect(res.status).toBe(200);
    expect(res.body.vehicles).toEqual(fixtures.vehicles);
  });

  it('[BASE-01] inspection detail returns inspection and vehicle; unknown ID is 404', async () => {
    const ok = await app.api<{ inspection: unknown; vehicle: unknown }>('GET', '/api/inspections/insp-001');
    expect(ok.status).toBe(200);
    expect(ok.body.inspection).toEqual(fixtures.inspections[0]);
    expect(ok.body.vehicle).toEqual(fixtures.vehicles[0]);
    const missing = await app.api<{ error: { code: string } }>('GET', '/api/inspections/insp-999');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('INSPECTION_NOT_FOUND');
  });

  it('[BASE-01] legacy generation returns the expected document and stores a legacy record', async () => {
    await app.api('POST', '/api/ops/reset', {});
    const res = await app.api<{ runId: string; report: unknown }>('POST', '/api/inspections/insp-001/report', {});
    expect(res.status).toBe(201);
    expect(res.body.report).toEqual(fixtures.expectedReports[0]);
    const list = await app.api<{ runs: Array<{ id: string; origin: string; status: string; attemptNumber: number }> }>('GET', '/api/inspections/insp-001/reports');
    expect(list.body.runs).toHaveLength(1);
    expect(list.body.runs[0]).toMatchObject({ id: res.body.runId, origin: 'legacy', status: 'completed', attemptNumber: 0 });
    const doc = await app.api<{ runId: string; report: unknown }>('GET', `/api/reports/${res.body.runId}`);
    expect(doc.status).toBe(200);
    expect(doc.body.report).toEqual(fixtures.expectedReports[0]);
  });

  it('[BASE-01] injected legacy failure returns 503 and stores nothing', async () => {
    await app.api('POST', '/api/ops/reset', {});
    await app.api('POST', '/api/ops/config', { failNextGeneration: true });
    const res = await app.api<{ error: { code: string; message: string } }>('POST', '/api/inspections/insp-002/report', {});
    expect(res.status).toBe(503);
    expect(res.body.error).toEqual({ code: 'SIMULATED_GENERATION_FAILURE', message: 'Report generation failed. Try again.' });
    const list = await app.api<{ runs: unknown[] }>('GET', '/api/inspections/insp-002/reports');
    expect(list.body.runs).toHaveLength(0);
    const state = await app.api<{ failNextGeneration: boolean }>('GET', '/api/ops/state');
    expect(state.body.failNextGeneration).toBe(false);
  });

  it('[BASE-01] request validation: missing object body is 400, unknown API path is JSON 404', async () => {
    const noBody = await fetch(`${app.baseUrl}/api/inspections/insp-001/report`, { method: 'POST' });
    expect(noBody.status).toBe(400);
    const arrayBody = await app.api<{ error: { code: string } }>('POST', '/api/ops/reset', []);
    expect(arrayBody.status).toBe(400);
    expect(arrayBody.body.error.code).toBe('INVALID_REQUEST');
    const unknown = await app.api<{ error: { code: string } }>('GET', '/api/nope');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
  });

  it('[BASE-01] operations endpoints: reset, config validation, revision helper', async () => {
    await app.api('POST', '/api/ops/reset', {});
    const bad = await app.api<{ error: { code: string } }>('POST', '/api/ops/config', { mode: 'sometimes' });
    expect(bad.status).toBe(400);
    const unknownKey = await app.api<{ error: { code: string } }>('POST', '/api/ops/config', { speed: 'fast' });
    expect(unknownKey.status).toBe(400);
    const manual = await app.api<{ mode: string }>('POST', '/api/ops/config', { mode: 'manual' });
    expect(manual.body.mode).toBe('manual');
    const rev = await app.api<{ inspection: { revision: number } }>('POST', '/api/ops/inspection-revision', {
      inspectionId: 'insp-001',
      revision: 2,
      findings: [{ id: 'finding-revision-2', area: 'Exterior', severity: 'info', description: 'Revision two finding for snapshot testing.' }],
    });
    expect(rev.status).toBe(200);
    expect(rev.body.inspection.revision).toBe(2);
    const lower = await app.api<{ error: { code: string } }>('POST', '/api/ops/inspection-revision', { inspectionId: 'insp-001', revision: 2, findings: [] });
    expect(lower.status).toBe(400);
    const after = await app.api<{ mode: string; runs: unknown[] }>('POST', '/api/ops/reset', {});
    expect(after.body.mode).toBe('automatic');
    const restored = await app.api<{ inspection: { revision: number } }>('GET', '/api/inspections/insp-001');
    expect(restored.body.inspection.revision).toBe(1);
  });

  it('[BASE-01] starter run routes exist and report NOT_IMPLEMENTED until the exercise is done', async () => {
    // These three are the open ticket work. On the unmodified starter they answer 501.
    // After modernization they answer 202/200 and this assertion is no longer relevant; the acceptance checks take over.
    const start = await app.api<{ error?: { code: string } }>('POST', '/api/inspections/insp-001/report-runs', {});
    expect([501, 202, 200]).toContain(start.status);
    const read = await app.api<{ error?: { code: string } }>('GET', '/api/report-runs/run-does-not-exist');
    expect([501, 404]).toContain(read.status);
    const retry = await app.api<{ error?: { code: string } }>('POST', '/api/report-runs/run-does-not-exist/retry', {});
    expect([501, 404]).toContain(retry.status);
  });
});
