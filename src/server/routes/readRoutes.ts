import { Router } from 'express';
import { CONTRACT_VERSION } from '../../shared/reportTypes.ts';
import { ServiceError } from '../errors.ts';
import type { FixtureStore } from '../fixtures/loadFixtures.ts';
import type { ReportJobService } from '../reports/reportJobs.ts';
import { asyncHandler, requireIdParam } from '../http.ts';

/** Prepared read endpoints. Learners do not need to change these. */
export function createReadRoutes(deps: { fixtures: FixtureStore; service: ReportJobService }): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', contractVersion: CONTRACT_VERSION });
  });

  router.get('/vehicles', (_req, res) => {
    res.json({ vehicles: deps.fixtures.listVehicles() });
  });

  router.get(
    '/inspections/:id',
    asyncHandler((req, res) => {
      const id = requireIdParam(req, 'id');
      const inspection = deps.fixtures.getInspection(id);
      const vehicle = deps.fixtures.getVehicle(inspection.vehicleId);
      res.json({ inspection, vehicle });
    }),
  );

  router.get(
    '/inspections/:id/reports',
    asyncHandler((req, res) => {
      const id = requireIdParam(req, 'id');
      deps.fixtures.getInspection(id);
      res.json({ runs: deps.service.list(id) });
    }),
  );

  router.get('/reports', (_req, res) => {
    res.json({ runs: deps.service.list() });
  });

  router.get(
    '/reports/:runId',
    asyncHandler((req, res) => {
      const runId = requireIdParam(req, 'runId');
      const run = deps.service.get(runId);
      if (run.status !== 'completed' || !run.report) {
        throw new ServiceError('REPORT_NOT_READY', `Run ${runId} is ${run.status}; the report is not ready.`);
      }
      res.json({ runId: run.id, report: run.report });
    }),
  );

  return router;
}
