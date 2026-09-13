import { describe, expect, it } from 'vitest';
import { ReportStore, type StoredRun } from '../../src/server/reports/reportStore.ts';
import { loadFixtures } from '../../src/server/fixtures/loadFixtures.ts';

const fixtures = loadFixtures();

function sample(id: string): Omit<StoredRun, 'sequence'> {
  return {
    id,
    origin: 'job',
    inspectionId: 'insp-001',
    attemptNumber: 1,
    parentRunId: null,
    retryRunId: null,
    inspectionSnapshot: structuredClone(fixtures.inspections[0]!),
    vehicleSnapshot: structuredClone(fixtures.vehicles[0]!),
    status: 'pending',
    createdAt: '2026-09-17T13:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    error: null,
    report: null,
    shouldFail: false,
  };
}

describe('ReportStore', () => {
  it('returns copies so callers cannot mutate stored state', () => {
    const store = new ReportStore();
    store.insert(sample('r1'));
    const read = store.get('r1')!;
    read.status = 'completed';
    read.inspectionSnapshot.findings.push({ id: 'x', area: 'X', severity: 'info', description: 'mutation attempt' });
    expect(store.get('r1')!.status).toBe('pending');
    expect(store.get('r1')!.inspectionSnapshot.findings).toHaveLength(2);
  });

  it('lists newest first by creation sequence, not by timestamp text', () => {
    const store = new ReportStore();
    store.insert({ ...sample('first'), createdAt: '2026-09-17T13:00:09.000Z' });
    store.insert({ ...sample('second'), createdAt: '2026-09-17T13:00:01.000Z' });
    expect(store.list().map((run) => run.id)).toEqual(['second', 'first']);
  });

  it('assigns attempt numbers per inspection', () => {
    const store = new ReportStore();
    expect(store.nextAttemptNumber('insp-001')).toBe(1);
    expect(store.nextAttemptNumber('insp-001')).toBe(2);
    expect(store.nextAttemptNumber('insp-002')).toBe(1);
  });

  it('reset clears runs, active pointers and counters', () => {
    const store = new ReportStore();
    store.insert(sample('r1'));
    store.setActiveJob('insp-001', 'r1');
    store.nextAttemptNumber('insp-001');
    store.reset();
    expect(store.list()).toHaveLength(0);
    expect(store.activeJobFor('insp-001')).toBeUndefined();
    expect(store.nextAttemptNumber('insp-001')).toBe(1);
  });
});
