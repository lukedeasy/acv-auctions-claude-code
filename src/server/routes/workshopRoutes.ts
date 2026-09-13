import { Router } from 'express';
import { SCHEDULER_MODES, type SchedulerMode } from '../../shared/reportTypes.ts';
import { ServiceError } from '../errors.ts';
import { parseFindings, type FixtureStore } from '../fixtures/loadFixtures.ts';
import type { ReportJobService } from '../reports/reportJobs.ts';
import { asyncHandler, requireIdParam, requireObjectBody } from '../http.ts';

/**
 * Workshop test controls. These exist only in the fictional teaching environment.
 * They must never be connected to real systems or expose filesystem/command operations.
 */
export function createWorkshopRoutes(deps: { fixtures: FixtureStore; service: ReportJobService }): Router {
  const router = Router();

  router.get('/state', (_req, res) => {
    res.json(deps.service.getWorkshopState());
  });

  router.post(
    '/reset',
    asyncHandler((req, res) => {
      requireObjectBody(req);
      res.json(deps.service.reset());
    }),
  );

  router.post(
    '/config',
    asyncHandler((req, res) => {
      const body = requireObjectBody(req);
      const allowed = new Set(['mode', 'failNextGeneration']);
      for (const key of Object.keys(body)) {
        if (!allowed.has(key)) throw new ServiceError('INVALID_REQUEST', `Unknown config key ${key}.`);
      }
      if ('mode' in body) {
        const mode = body.mode;
        if (typeof mode !== 'string' || !(SCHEDULER_MODES as readonly string[]).includes(mode)) {
          throw new ServiceError('INVALID_REQUEST', 'mode must be "automatic" or "manual".');
        }
        deps.service.setMode(mode as SchedulerMode);
      }
      if ('failNextGeneration' in body) {
        if (typeof body.failNextGeneration !== 'boolean') {
          throw new ServiceError('INVALID_REQUEST', 'failNextGeneration must be a boolean.');
        }
        deps.service.setFailNextGeneration(body.failNextGeneration);
      }
      res.json(deps.service.getWorkshopState());
    }),
  );

  router.post(
    '/runs/:runId/begin',
    asyncHandler((req, res) => {
      const runId = requireIdParam(req, 'runId');
      requireObjectBody(req);
      res.json({ run: deps.service.beginAttempt(runId) });
    }),
  );

  router.post(
    '/runs/:runId/finish',
    asyncHandler((req, res) => {
      const runId = requireIdParam(req, 'runId');
      requireObjectBody(req);
      res.json({ run: deps.service.finishAttempt(runId) });
    }),
  );

  router.post(
    '/inspection-revision',
    asyncHandler((req, res) => {
      const body = requireObjectBody(req);
      const { inspectionId, revision, findings } = body;
      if (typeof inspectionId !== 'string' || !inspectionId) throw new ServiceError('INVALID_REQUEST', 'inspectionId is required.');
      if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
        throw new ServiceError('INVALID_REQUEST', 'revision must be a positive integer.');
      }
      let parsedFindings;
      try {
        parsedFindings = parseFindings(findings, 'body');
      } catch (error) {
        throw new ServiceError('INVALID_REQUEST', error instanceof Error ? error.message : 'findings are invalid.');
      }
      const inspection = deps.fixtures.updateInspectionRevision(inspectionId, revision, parsedFindings);
      res.json({ inspection });
    }),
  );

  return router;
}
