/**
 * Browser journeys for AC-01–AC-06. These describe the published behavior; they fail on the
 * unmodified starter by design (except where noted). Visible strings and control names are
 * published in workshop/acceptance.md so every participant knows what the checks look for.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ReportDocument } from '../../src/shared/reportTypes.ts';
import { begin, config, finish, newestRun, openInspection, panel, reset, settleIfPending, state, waitForRun } from '../helpers/browser.ts';

const expectedReports = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '..', '..', 'fixtures', 'expected-reports.json'), 'utf8')) as ReportDocument[];
const revisionTwo = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '..', '..', 'fixtures', 'snapshot-test-revision.json'), 'utf8')) as {
  inspectionId: string;
  revision: number;
  findings: ReportDocument['findings'];
};

async function expectReportPage(page: Page, inspectionId: string, revision: number, findings: ReportDocument['findings']) {
  await expect(page).toHaveURL(/\/reports\/[^/]+$/);
  await expect(page.getByTestId('report-page')).toBeVisible();
  await expect(page.getByTestId('report-revision')).toHaveText(String(revision));
  await expect(page.getByRole('link', { name: 'Back to inspection' })).toHaveAttribute('href', `/inspections/${inspectionId}`);
  for (const finding of findings) await expect(page.getByTestId(`report-finding-${finding.id}`)).toContainText(finding.description);
}

test.describe('acceptance journeys', () => {
  test.beforeEach(async ({ request }) => {
    await reset(request);
    await config(request, { mode: 'manual' });
  });

  test('[AC-01] Start shows queued, then generating, then ready — never success early', async ({ page, request }) => {
    await openInspection(page, 'insp-001');
    const p = panel(page);
    await p.generate.click();
    await expect(p.status).toHaveText('Report queued');
    await expect(p.root).toContainText(/Attempt 1/);
    await expect(p.generate).toBeDisabled();
    await expect(p.open).toHaveCount(0);
    await expect(p.retry).toHaveCount(0);
    const run = await waitForRun(request, 'insp-001', ['pending']);
    await begin(request, run.id);
    await expect(p.status).toHaveText('Generating report…');
    await expect(p.open).toHaveCount(0);
    await finish(request, run.id);
    await expect(p.status).toHaveText('Report ready');
    await expect(p.open).toBeVisible();
    await expect(p.generate).toBeEnabled();
  });

  test('[AC-02] the UI prevents repeated active requests and the server keeps one run', async ({ page, request }) => {
    await openInspection(page, 'insp-001');
    const p = panel(page);
    await p.generate.click();
    await expect(p.generate).toBeDisabled();
    // Try to fire the button again through the DOM despite the disabled state.
    await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-testid="report-panel"] button');
      button?.click();
      button?.click();
    });
    await waitForRun(request, 'insp-001', ['pending']);
    await page.waitForTimeout(700);
    const { runs } = await state(request);
    expect(runs.filter((run) => run.inspectionId === 'insp-001')).toHaveLength(1);
    await expect(p.status).toHaveText('Report queued');
    // Reload while pending: the panel resumes the same active run instead of starting another.
    await page.reload();
    await expect(panel(page).status).toHaveText('Report queued');
    await expect(panel(page).generate).toBeDisabled();
    const after = await state(request);
    expect(after.runs.filter((run) => run.inspectionId === 'insp-001')).toHaveLength(1);
  });

  test('[AC-03] a completed run opens its expected report for both inspections', async ({ page, request }) => {
    for (const inspectionId of ['insp-001', 'insp-002']) {
      await openInspection(page, inspectionId);
      const p = panel(page);
      await p.generate.click();
      const run = await waitForRun(request, inspectionId, ['pending']);
      await begin(request, run.id);
      await finish(request, run.id);
      await expect(p.status).toHaveText('Report ready');
      await p.open.click();
      const expected = expectedReports.find((r) => r.inspectionId === inspectionId)!;
      await expect(page).toHaveURL(new RegExp(`/reports/${run.id}$`));
      await expectReportPage(page, inspectionId, expected.inspectionRevision, expected.findings);
      const json = await page.getByTestId('report-json').textContent();
      expect(JSON.parse(json ?? '')).toEqual(expected);
    }
  });

  test('[AC-04] [AC-04-STRONG] a failure shows a useful error, exits generating and enables Retry', async ({ page, request }) => {
    await config(request, { failNextGeneration: true });
    await openInspection(page, 'insp-001');
    const p = panel(page);
    await p.generate.click();
    // On the modernized app a pending job appears and is driven to failure here.
    // On the older starter no job appears; the legacy request fails after its fixed delay.
    await settleIfPending(request, 'insp-001');
    await expect(p.alert).toHaveText('Report generation failed. Try again.', { timeout: 5000 });
    await expect(p.status).not.toHaveText('Generating report…');
    await expect(p.status).not.toHaveText('Report ready');
    await expect(p.open).toHaveCount(0);
    // The stronger assertion: the user can recover. The starter leaves the button disabled.
    await expect(p.retry).toBeVisible();
    await expect(p.retry).toBeEnabled();
  });

  test('[AC-05] Retry follows the new child, clears the stale error and preserves the original snapshot', async ({ page, request }) => {
    await config(request, { failNextGeneration: true });
    await openInspection(page, 'insp-001');
    const p = panel(page);
    await p.generate.click();
    const parent = await waitForRun(request, 'insp-001', ['pending']);
    await begin(request, parent.id);
    await finish(request, parent.id);
    await expect(p.retry).toBeEnabled();
    // Change the current inspection revision before retrying: the retry must use the original snapshot.
    const res = await request.post('/api/ops/inspection-revision', { data: revisionTwo });
    expect(res.ok()).toBe(true);
    await p.retry.click();
    await expect(p.status).toHaveText(/Requesting retry…|Report queued/);
    const child = await waitForRun(request, 'insp-001', ['pending']);
    expect(child.id).not.toBe(parent.id);
    expect(child.parentRunId).toBe(parent.id);
    await expect(p.root).toContainText(/Attempt 2/);
    await expect(p.alert).toHaveCount(0);
    await expect(p.status).toHaveText('Report queued');
    await begin(request, child.id);
    await expect(p.status).toHaveText('Generating report…');
    await finish(request, child.id);
    await expect(p.status).toHaveText('Report ready');
    await expect(p.alert).toHaveCount(0);
    await p.open.click();
    await expect(page).toHaveURL(new RegExp(`/reports/${child.id}$`));
    const expected = expectedReports.find((r) => r.inspectionId === 'insp-001')!;
    await expectReportPage(page, 'insp-001', 1, expected.findings);
    // Repeated retry of the same failed parent still returns the one child.
    const again = await request.post(`/api/report-runs/${parent.id}/retry`, { data: {} });
    expect(again.status()).toBe(200);
    expect(((await again.json()) as { run: { id: string } }).run.id).toBe(child.id);
    // A brand-new Start after the child finished uses the current revision (2).
    await openInspection(page, 'insp-001');
    await panel(page).generate.click();
    const fresh = await waitForRun(request, 'insp-001', ['pending']);
    expect(fresh.inspectionRevision).toBe(revisionTwo.revision);
    await begin(request, fresh.id);
    await finish(request, fresh.id);
    await panel(page).open.click();
    await expectReportPage(page, 'insp-001', revisionTwo.revision, revisionTwo.findings);
  });

  test('[AC-05] a repeated Retry click sends one request', async ({ page, request }) => {
    await config(request, { failNextGeneration: true });
    await openInspection(page, 'insp-001');
    const p = panel(page);
    await p.generate.click();
    const parent = await waitForRun(request, 'insp-001', ['pending']);
    await begin(request, parent.id);
    await finish(request, parent.id);
    await expect(p.retry).toBeEnabled();
    let retryRequests = 0;
    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/api\/report-runs\/[^/]+\/retry$/.test(req.url())) retryRequests += 1;
    });
    await p.retry.dblclick();
    await waitForRun(request, 'insp-001', ['pending']);
    await page.waitForTimeout(500);
    expect(retryRequests).toBe(1);
    const { runs } = await state(request);
    expect(runs.filter((run) => run.inspectionId === 'insp-001')).toHaveLength(2);
  });

  test('[AC-06] switching inspections never shows the previous inspection’s run or report', async ({ page, request }) => {
    await openInspection(page, 'insp-001');
    await panel(page).generate.click();
    const runA = await waitForRun(request, 'insp-001', ['pending']);
    // Delay one status response for run A so it arrives after navigation to B. Wait until that delayed
    // request has actually been issued before navigating, so a late answer is guaranteed to be in flight.
    let delayed = false;
    await page.route(`**/api/report-runs/${runA.id}`, async (route) => {
      if (!delayed) {
        delayed = true;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.continue();
    });
    await page.waitForRequest((req) => req.url().endsWith(`/api/report-runs/${runA.id}`), { timeout: 5000 });
    await page.getByRole('link', { name: 'Back to vehicles' }).click();
    await page.getByTestId('vehicle-row-veh-002').getByRole('link', { name: 'Open inspection' }).click();
    await expect(page.getByTestId('inspection-page')).toHaveAttribute('data-inspection-id', 'insp-002');
    const pB = panel(page);
    await expect(pB.status).toHaveText('No report generated.');
    await expect(pB.root).not.toContainText(runA.id);
    await begin(request, runA.id);
    await finish(request, runA.id);
    await page.waitForTimeout(2000);
    await expect(pB.status).toHaveText('No report generated.');
    await expect(pB.open).toHaveCount(0);
    await expect(pB.root).not.toContainText(runA.id);
    await expect(pB.root).not.toContainText(/Attempt/);
    // Back on A the completed run is shown and opens A's report.
    await openInspection(page, 'insp-001');
    await expect(panel(page).status).toHaveText('Report ready');
    await panel(page).open.click();
    await expect(page).toHaveURL(new RegExp(`/reports/${runA.id}$`));
    await expectReportPage(page, 'insp-001', 1, expectedReports[0]!.findings);
  });

  test('[AC-06] a modern report matches the legacy document for the same inspection', async ({ page, request }) => {
    const legacy = await request.post('/api/inspections/insp-002/report', { data: {} });
    const legacyDoc = ((await legacy.json()) as { report: ReportDocument }).report;
    await openInspection(page, 'insp-002');
    await panel(page).generate.click();
    const run = await waitForRun(request, 'insp-002', ['pending']);
    await begin(request, run.id);
    await finish(request, run.id);
    await panel(page).open.click();
    const json = await page.getByTestId('report-json').textContent();
    expect(JSON.parse(json ?? '')).toEqual(legacyDoc);
    expect(JSON.parse(json ?? '')).toEqual(expectedReports[1]);
    const current = await newestRun(request, 'insp-002');
    expect(json).not.toContain(current!.id);
  });
});
