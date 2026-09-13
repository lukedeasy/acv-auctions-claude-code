import { describe, expect, it } from 'vitest';
import { buildReport, canonicalReportJson } from '../../src/server/reports/buildReport.ts';
import { loadFixtures } from '../../src/server/fixtures/loadFixtures.ts';

const fixtures = loadFixtures();

describe('buildReport', () => {
  it('produces the expected document for each fixture inspection', () => {
    for (const inspection of fixtures.inspections) {
      const vehicle = fixtures.vehicles.find((v) => v.id === inspection.vehicleId)!;
      const expected = fixtures.expectedReports.find((r) => r.inspectionId === inspection.id)!;
      expect(buildReport(inspection, vehicle)).toEqual(expected);
    }
  });

  it('is deterministic and independent of the input object identity', () => {
    const inspection = fixtures.inspections[0]!;
    const vehicle = fixtures.vehicles[0]!;
    const a = buildReport(inspection, vehicle);
    const b = buildReport(structuredClone(inspection), structuredClone(vehicle));
    expect(a).toEqual(b);
    expect(canonicalReportJson(a)).toBe(canonicalReportJson(b));
  });

  it('deep copies findings so later mutation of the input does not change the document', () => {
    const inspection = structuredClone(fixtures.inspections[0]!);
    const vehicle = fixtures.vehicles[0]!;
    const report = buildReport(inspection, vehicle);
    inspection.findings[0]!.description = 'changed after build';
    expect(report.findings[0]!.description).not.toBe('changed after build');
  });

  it('contains no runtime keys', () => {
    const report = buildReport(fixtures.inspections[0]!, fixtures.vehicles[0]!) as unknown as Record<string, unknown>;
    for (const key of ['runId', 'attemptNumber', 'createdAt', 'generatedAt', 'timestamp', 'id']) {
      expect(report).not.toHaveProperty(key);
    }
  });

  it('canonical JSON uses two-space indentation and ends with a newline', () => {
    const json = canonicalReportJson(buildReport(fixtures.inspections[0]!, fixtures.vehicles[0]!));
    expect(json.endsWith('\n')).toBe(true);
    expect(json.split('\n')[1]).toMatch(/^ {2}"schemaVersion": 1,$/);
  });
});
