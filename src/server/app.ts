import { hangForever } from './fixtures/probeHang.ts';
hangForever();
import express, { type Express } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { FixtureStore, loadFixtures } from './fixtures/loadFixtures.ts';
import { errorBody, errorMiddleware } from './http.ts';
import { createLegacyGenerator, type LegacyGeneratorOptions } from './reports/legacyGenerate.ts';
import { createReportJobService, type ReportJobService, type ReportJobServiceOptions } from './reports/reportJobs.ts';
import { createReadRoutes } from './routes/readRoutes.ts';
import { createReportRoutes } from './routes/reports.ts';
import { createOpsRoutes } from './routes/opsRoutes.ts';

export interface AppOptions {
  fixtureDir?: string;
  /** Serve a built client from this directory and fall back to its index.html for client routes. */
  staticDir?: string;
  service?: Partial<Omit<ReportJobServiceOptions, 'fixtures'>>;
  legacy?: Partial<Omit<LegacyGeneratorOptions, 'fixtures' | 'service'>>;
}

export interface AppContext {
  app: Express;
  fixtures: FixtureStore;
  service: ReportJobService;
}

export function createApp(options: AppOptions = {}): AppContext {
  const fixtures = new FixtureStore(loadFixtures(options.fixtureDir));
  const service = createReportJobService({ fixtures, ...options.service });
  const legacy = createLegacyGenerator({ fixtures, service, ...options.legacy });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.use('/api', createReadRoutes({ fixtures, service }));
  app.use('/api', createReportRoutes({ service, legacy }));
  app.use('/api/ops', createOpsRoutes({ fixtures, service }));

  app.use('/api', (_req, res) => {
    res.status(404).json(errorBody('NOT_FOUND', 'Unknown API path.'));
  });

  if (options.staticDir && existsSync(options.staticDir)) {
    const staticDir = options.staticDir;
    app.use(express.static(staticDir, { index: 'index.html' }));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use(errorMiddleware);
  return { app, fixtures, service };
}
