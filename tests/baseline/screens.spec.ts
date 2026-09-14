import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config, openInspection, panel, reset } from '../helpers/browser.ts';

const expectedReports = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '..', '..', 'fixtures', 'expected-reports.json'), 'utf8')) as Array<{
  inspectionId: string;
  inspectionRevision: number;
  findings: Array<{ id: string; description: string }>;
}>;

test.describe('[BASE-01] screens', () => {
  test.beforeEach(async ({ request }) => {
    await reset(request);
  });

  test('[BASE-01] vehicles list renders fixture rows and links to inspections', async ({ page }) => {
    await page.goto('/vehicles');
    await expect(page.getByRole('heading', { name: 'Inspection Desk' })).toBeVisible();
    await expect(page.getByTestId('ops-panel')).toContainText('Operations');
    await expect(page.getByTestId('ops-panel')).toContainText('STAGING');
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('STK-20811');
    await expect(rows.nth(0)).toContainText('2021 Toyota RAV4');
    await expect(rows.nth(0)).toContainText('42,310');
    await expect(rows.nth(1)).toContainText('STK-20827');
    await rows.nth(0).getByRole('link', { name: 'Open inspection' }).click();
    await expect(page).toHaveURL(/\/inspections\/insp-001$/);
    await expect(page.getByRole('heading', { name: '2021 Toyota RAV4' })).toBeVisible();
  });

  test('[BASE-01] inspection screen shows details, findings and the report panel', async ({ page }) => {
    await openInspection(page, 'insp-002');
    await expect(page.getByText('STK-20827')).toBeVisible();
    await expect(page.getByText('61,205')).toBeVisible();
    await expect(page.getByText('revision 1')).toBeVisible();
    await expect(page.getByRole('row', { name: /Tires/ })).toContainText('major');
    await expect(page.getByRole('row', { name: /Tires/ })).toContainText('Rear tires require replacement.');
    await expect(panel(page).status).toHaveText('No report generated.');
    await expect(panel(page).generate).toBeEnabled();
    await expect(page.getByRole('link', { name: 'Back to vehicles' })).toBeVisible();
  });

  test('[BASE-01] generation shows progress, then a report link that opens the expected document', async ({ page }) => {
    // Path-agnostic: passes on the older synchronous path and on the modernized run-based path (automatic mode).
    await openInspection(page, 'insp-001');
    const p = panel(page);
    await p.generate.click();
    await expect(p.status).toHaveText(/Requesting report…|Report queued|Generating report…/);
    await expect(p.generate).toBeDisabled();
    await expect(p.status).toHaveText('Report ready', { timeout: 5000 });
    await expect(p.generate).toBeEnabled();
    await p.open.click();
    await expect(page).toHaveURL(/\/reports\/[^/]+$/);
    await expect(page.getByRole('heading', { name: /Report: 2021 Toyota RAV4/ })).toBeVisible();
    await expect(page.getByTestId('report-revision')).toHaveText('1');
    const expected = expectedReports.find((r) => r.inspectionId === 'insp-001')!;
    for (const finding of expected.findings) {
      await expect(page.getByTestId(`report-finding-${finding.id}`)).toContainText(finding.description);
    }
    const json = await page.getByTestId('report-json').textContent();
    expect(JSON.parse(json ?? '')).toEqual(expected);
    expect(json?.endsWith('\n')).toBe(true);
    await expect(page.getByTestId('download-json')).toHaveAttribute('download', 'report-insp-001-rev1.json');
  });

  test('[BASE-01] reports list, empty states and not-found/not-ready pages', async ({ page, request }) => {
    await page.goto('/reports');
    await expect(page.getByText('No reports yet. Generate one from an inspection.')).toBeVisible();
    await page.goto('/reports/run-does-not-exist');
    await expect(page.getByRole('alert')).toHaveText('Report not found.');
    // A legacy record appears in the list with a working Open report link.
    const res = await request.post('/api/inspections/insp-002/report', { data: {} });
    const { runId } = (await res.json()) as { runId: string };
    await page.goto('/reports');
    const row = page.getByTestId(`report-row-${runId}`);
    await expect(row).toContainText('Legacy');
    await expect(row).toContainText('completed');
    await row.getByRole('link', { name: 'Open report' }).click();
    await expect(page).toHaveURL(new RegExp(`/reports/${runId}$`));
  });

  test('[BASE-01] operations panel can reset, toggle failure and switch mode', async ({ page, request }) => {
    await page.goto('/vehicles');
    await page.getByTestId('ops-fail-next').check();
    await expect(page.getByTestId('ops-fail-next')).toBeChecked();
    await page.getByTestId('ops-mode-manual').check();
    await expect(page.getByTestId('ops-mode-manual')).toBeChecked();
    await page.getByTestId('ops-reset').click();
    await expect(page.getByTestId('ops-message')).toContainText('Reset data: done');
    await expect(page.getByTestId('ops-mode-automatic')).toBeChecked();
    await expect(page.getByTestId('ops-fail-next')).not.toBeChecked();
    const s = await request.get('/api/ops/state');
    expect(((await s.json()) as { runs: unknown[] }).runs).toHaveLength(0);
  });

  test('[BASE-01] narrow layout keeps the page usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/vehicles');
    await expect(page.getByRole('link', { name: 'Open inspection' }).first()).toBeVisible();
    await expect(page.getByTestId('ops-panel')).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
  });
});

test.describe('[BASE-02] injected failure', () => {
  test.beforeEach(async ({ request }) => {
    await reset(request);
    await config(request, { failNextGeneration: true });
  });

  // Deliberately weak baseline case: it checks only that the error message appears.
  // It passes on the starter even though the user is left with a disabled button.
  test('[BASE-02] the error message appears after the injected failure', async ({ page }) => {
    await openInspection(page, 'insp-001');
    await panel(page).generate.click();
    await expect(panel(page).alert).toHaveText('Report generation failed. Try again.', { timeout: 5000 });
  });
});
