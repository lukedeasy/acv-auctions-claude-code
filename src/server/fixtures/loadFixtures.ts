import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEVERITIES, type Finding, type Inspection, type ReportDocument, type Vehicle } from '../../shared/reportTypes.ts';
import { ServiceError } from '../errors.ts';
import { deepClone } from '../reports/reportStore.ts';

export interface FixtureData {
  vehicles: Vehicle[];
  inspections: Inspection[];
  expectedReports: ReportDocument[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function parseVehicle(value: unknown, where: string): Vehicle {
  if (!isRecord(value)) throw new Error(`${where}: vehicle must be an object`);
  const { id, stockNumber, year, make, model, mileage, exteriorColor } = value;
  if (typeof id !== 'string' || !id) throw new Error(`${where}: vehicle id`);
  if (typeof stockNumber !== 'string' || !stockNumber) throw new Error(`${where}: stockNumber`);
  if (!isNonNegativeInteger(year)) throw new Error(`${where}: year`);
  if (typeof make !== 'string' || !make) throw new Error(`${where}: make`);
  if (typeof model !== 'string' || !model) throw new Error(`${where}: model`);
  if (!isNonNegativeInteger(mileage)) throw new Error(`${where}: mileage must be a nonnegative integer`);
  if (typeof exteriorColor !== 'string' || !exteriorColor) throw new Error(`${where}: exteriorColor`);
  return { id, stockNumber, year, make, model, mileage, exteriorColor };
}

export function parseFinding(value: unknown, where: string): Finding {
  if (!isRecord(value)) throw new Error(`${where}: finding must be an object`);
  const { id, area, severity, description } = value;
  if (typeof id !== 'string' || !id) throw new Error(`${where}: finding id`);
  if (typeof area !== 'string' || !area) throw new Error(`${where}: finding area`);
  if (typeof severity !== 'string' || !(SEVERITIES as readonly string[]).includes(severity)) {
    throw new Error(`${where}: finding severity must be one of ${SEVERITIES.join(', ')}`);
  }
  if (typeof description !== 'string' || !description) throw new Error(`${where}: finding description`);
  return { id, area, severity: severity as Finding['severity'], description };
}

export function parseFindings(value: unknown, where: string): Finding[] {
  if (!Array.isArray(value)) throw new Error(`${where}: findings must be an array`);
  const findings = value.map((item, index) => parseFinding(item, `${where}.findings[${index}]`));
  const ids = new Set(findings.map((finding) => finding.id));
  if (ids.size !== findings.length) throw new Error(`${where}: finding ids must be unique`);
  return findings;
}

export function parseInspection(value: unknown, where: string): Inspection {
  if (!isRecord(value)) throw new Error(`${where}: inspection must be an object`);
  const { id, vehicleId, revision, inspectedAt, inspectorLabel, findings } = value;
  if (typeof id !== 'string' || !id) throw new Error(`${where}: inspection id`);
  if (typeof vehicleId !== 'string' || !vehicleId) throw new Error(`${where}: vehicleId`);
  if (!isNonNegativeInteger(revision) || revision < 1) throw new Error(`${where}: revision must be a positive integer`);
  if (typeof inspectedAt !== 'string' || Number.isNaN(Date.parse(inspectedAt))) throw new Error(`${where}: inspectedAt must be ISO`);
  if (typeof inspectorLabel !== 'string' || !inspectorLabel) throw new Error(`${where}: inspectorLabel`);
  return { id, vehicleId, revision, inspectedAt, inspectorLabel, findings: parseFindings(findings, where) };
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function defaultFixtureDir(): string {
  if (process.env.INSPECTION_DESK_FIXTURE_DIR) return path.resolve(process.env.INSPECTION_DESK_FIXTURE_DIR);
  // Walk up from this module (src/server/fixtures or dist/server/server/fixtures) to the repository root.
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, 'fixtures', 'vehicles.json');
    if (existsSync(candidate)) return path.join(dir, 'fixtures');
    dir = path.dirname(dir);
  }
  throw new Error('Could not locate the fixtures directory; set INSPECTION_DESK_FIXTURE_DIR.');
}

export function loadFixtures(fixtureDir = defaultFixtureDir()): FixtureData {
  const vehiclesRaw = readJson(path.join(fixtureDir, 'vehicles.json'));
  const inspectionsRaw = readJson(path.join(fixtureDir, 'inspections.json'));
  const expectedRaw = readJson(path.join(fixtureDir, 'expected-reports.json'));
  if (!Array.isArray(vehiclesRaw) || !Array.isArray(inspectionsRaw) || !Array.isArray(expectedRaw)) {
    throw new Error('Fixture files must contain arrays');
  }
  const vehicles = vehiclesRaw.map((item, index) => parseVehicle(item, `vehicles[${index}]`));
  const inspections = inspectionsRaw.map((item, index) => parseInspection(item, `inspections[${index}]`));
  const vehicleIds = new Set(vehicles.map((vehicle) => vehicle.id));
  for (const inspection of inspections) {
    if (!vehicleIds.has(inspection.vehicleId)) throw new Error(`Inspection ${inspection.id} references unknown vehicle`);
  }
  return { vehicles, inspections, expectedReports: expectedRaw as ReportDocument[] };
}

/**
 * Current (mutable) copy of the fixtures used by the running server. Reset restores the loaded data.
 * Runs keep their own snapshots, so changing the current revision never changes an existing run.
 */
export class FixtureStore {
  private vehicles: Vehicle[] = [];
  private inspections: Inspection[] = [];

  constructor(private readonly source: FixtureData) {
    this.reset();
  }

  reset(): void {
    this.vehicles = deepClone(this.source.vehicles);
    this.inspections = deepClone(this.source.inspections);
  }

  listVehicles(): Vehicle[] {
    return deepClone(this.vehicles);
  }

  getVehicle(id: string): Vehicle {
    const vehicle = this.vehicles.find((item) => item.id === id);
    if (!vehicle) throw new ServiceError('VEHICLE_NOT_FOUND', `Vehicle ${id} was not found.`);
    return deepClone(vehicle);
  }

  getInspection(id: string): Inspection {
    const inspection = this.inspections.find((item) => item.id === id);
    if (!inspection) throw new ServiceError('INSPECTION_NOT_FOUND', `Inspection ${id} was not found.`);
    return deepClone(inspection);
  }

  /** Snapshot of the inspection and its vehicle at this moment. */
  snapshot(inspectionId: string): { inspection: Inspection; vehicle: Vehicle } {
    const inspection = this.getInspection(inspectionId);
    const vehicle = this.getVehicle(inspection.vehicleId);
    return { inspection, vehicle };
  }

  /** Workshop helper: replace the current revision and findings. Existing run snapshots are untouched. */
  updateInspectionRevision(inspectionId: string, revision: number, findings: Finding[]): Inspection {
    const inspection = this.inspections.find((item) => item.id === inspectionId);
    if (!inspection) throw new ServiceError('INSPECTION_NOT_FOUND', `Inspection ${inspectionId} was not found.`);
    if (!Number.isInteger(revision) || revision <= inspection.revision) {
      throw new ServiceError('INVALID_REQUEST', `Revision must be an integer above the current revision ${inspection.revision}.`);
    }
    inspection.revision = revision;
    inspection.findings = deepClone(findings);
    return deepClone(inspection);
  }
}
