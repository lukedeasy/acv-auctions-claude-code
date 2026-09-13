import type { Inspection, ReportDocument, Vehicle } from '../../shared/reportTypes.ts';

/**
 * Deterministic report builder. Same inspection + vehicle input always produces the same document.
 * The document contains no run ID, attempt time, random value or current time.
 */
export function buildReport(inspection: Inspection, vehicle: Vehicle): ReportDocument {
  return {
    schemaVersion: 1,
    inspectionId: inspection.id,
    inspectionRevision: inspection.revision,
    vehicle: {
      id: vehicle.id,
      stockNumber: vehicle.stockNumber,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      mileage: vehicle.mileage,
      exteriorColor: vehicle.exteriorColor,
    },
    inspectedAt: inspection.inspectedAt,
    inspectorLabel: inspection.inspectorLabel,
    findings: inspection.findings.map((finding) => ({
      id: finding.id,
      area: finding.area,
      severity: finding.severity,
      description: finding.description,
    })),
  };
}

/** Canonical exported form: two-space indentation and a terminal newline. */
export function canonicalReportJson(report: ReportDocument): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
