import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { RunView, OpsState } from '../../src/shared/reportTypes.ts';

/** Operations helpers for browser tests. They call the same /api/ops routes the panel uses. */
export async function reset(request: APIRequestContext): Promise<void> {
  const res = await request.post('/api/ops/reset', { data: {} });
  expect(res.ok()).toBe(true);
}

export async function config(request: APIRequestContext, body: { mode?: 'automatic' | 'manual'; failNextGeneration?: boolean }): Promise<void> {
  const res = await request.post('/api/ops/config', { data: body });
  expect(res.ok(), await res.text()).toBe(true);
}

export async function state(request: APIRequestContext): Promise<OpsState> {
  const res = await request.get('/api/ops/state');
  expect(res.ok()).toBe(true);
  return (await res.json()) as OpsState;
}

export async function newestRun(request: APIRequestContext, inspectionId?: string): Promise<RunView | undefined> {
  const { runs } = await state(request);
  return runs.find((run) => !inspectionId || run.inspectionId === inspectionId);
}

/** Wait until a job for the inspection exists in the given status(es). */
export async function waitForRun(request: APIRequestContext, inspectionId: string, statuses: RunView['status'][], timeoutMs = 5000): Promise<RunView> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const run = await newestRun(request, inspectionId);
    if (run && run.origin === 'job' && statuses.includes(run.status)) return run;
    if (Date.now() > deadline) throw new Error(`no job run for ${inspectionId} reached ${statuses.join('/')} within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function begin(request: APIRequestContext, runId: string): Promise<RunView> {
  const res = await request.post(`/api/ops/runs/${runId}/begin`, { data: {} });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { run: RunView }).run;
}

export async function finish(request: APIRequestContext, runId: string): Promise<RunView> {
  const res = await request.post(`/api/ops/runs/${runId}/finish`, { data: {} });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { run: RunView }).run;
}

/**
 * If a pending job exists for the inspection within a short window, begin and finish it.
 * Returns the settled run, or null when no job appeared (the older legacy path creates no pending job).
 */
export async function settleIfPending(request: APIRequestContext, inspectionId: string, windowMs = 1500): Promise<RunView | null> {
  const deadline = Date.now() + windowMs;
  while (Date.now() < deadline) {
    const run = await newestRun(request, inspectionId);
    if (run && run.origin === 'job' && run.status === 'pending') {
      await begin(request, run.id);
      return finish(request, run.id);
    }
    if (run && run.origin === 'job' && run.status === 'running') return finish(request, run.id);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

export function panel(page: Page) {
  return {
    root: page.getByTestId('report-panel'),
    status: page.getByTestId('report-status'),
    generate: page.getByRole('button', { name: 'Generate report' }),
    retry: page.getByRole('button', { name: 'Retry report' }),
    checkAgain: page.getByRole('button', { name: 'Check again' }),
    open: page.getByRole('link', { name: 'Open report' }),
    alert: page.getByTestId('report-panel').getByRole('alert'),
  };
}

export async function openInspection(page: Page, inspectionId: string): Promise<void> {
  await page.goto(`/inspections/${inspectionId}`);
  await expect(page.getByTestId('inspection-page')).toHaveAttribute('data-inspection-id', inspectionId);
  await expect(page.getByTestId('report-panel')).toBeVisible();
}
