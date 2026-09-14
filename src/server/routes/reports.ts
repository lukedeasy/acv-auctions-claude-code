import { Router } from 'express';
import { ServiceError } from '../errors.ts';
import type { LegacyGenerator } from '../reports/legacyGenerate.ts';
import type { ReportJobService } from '../reports/reportJobs.ts';
import { asyncHandler, requireIdParam, requireObjectBody } from '../http.ts';

/**
 * Report generation routes.
 *
 * The legacy synchronous route is prepared and stays available for content comparison.
 * The three run-based routes are the open work on the report-generation ticket. They must stay thin: validate the request,
 * call the prepared job service, and translate the result into the documented response.
 * Handlers here must not import the report builder or the runtime store.
 */
export function createReportRoutes(deps: { service: ReportJobService; legacy: LegacyGenerator }): Router {
  const router = Router();

  // Older synchronous path: the request waits for the whole build.
  router.post(
    '/inspections/:id/report',
    asyncHandler(async (req, res) => {
      const id = requireIdParam(req, 'id');
      requireObjectBody(req);
      const result = await deps.legacy.generate(id);
      res.status(201).json(result);
    }),
  );

  // --- Run-based endpoints (answer 501 until implemented) ---

  router.post(
    '/inspections/:id/report-runs',
    asyncHandler((req, _res) => {
      requireIdParam(req, 'id');
      requireObjectBody(req);
      throw new ServiceError('NOT_IMPLEMENTED', 'Starting a report run is not implemented yet.');
    }),
  );

  router.get(
    '/report-runs/:runId',
    asyncHandler((req, _res) => {
      requireIdParam(req, 'runId');
      throw new ServiceError('NOT_IMPLEMENTED', 'Reading a report run is not implemented yet.');
    }),
  );

  router.post(
    '/report-runs/:runId/retry',
    asyncHandler((req, _res) => {
      requireIdParam(req, 'runId');
      requireObjectBody(req);
      throw new ServiceError('NOT_IMPLEMENTED', 'Retrying a report run is not implemented yet.');
    }),
  );

  return router;
}
