import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ReportDocument, RunView } from '../../shared/reportTypes.ts';
import { ApiError, fetchJson } from '../reports/reportApi.ts';
import { formatTime } from './InspectionPage.tsx';

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'not-ready'; inspectionId: string | null }
  | { kind: 'error' }
  | { kind: 'ready'; runId: string; report: ReportDocument };

/** Canonical export formatting: two-space indentation and a terminal newline. Matches the server's export rule. */
export function canonicalReportJson(report: ReportDocument): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function ReportPage() {
  const { runId = '' } = useParams();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    fetchJson<{ runId: string; report: ReportDocument }>(`/api/reports/${encodeURIComponent(runId)}`, { signal: controller.signal })
      .then(({ runId: id, report }) => setState({ kind: 'ready', runId: id, report }))
      .catch(async (error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof ApiError && error.status === 404) {
          setState({ kind: 'missing' });
          return;
        }
        if (error instanceof ApiError && error.code === 'REPORT_NOT_READY') {
          // The prepared list route tells us which inspection the unfinished run belongs to.
          const inspectionId = await fetchJson<{ runs: RunView[] }>('/api/reports', { signal: controller.signal })
            .then(({ runs }) => runs.find((run) => run.id === runId)?.inspectionId ?? null)
            .catch(() => null);
          if (!controller.signal.aborted) setState({ kind: 'not-ready', inspectionId });
          return;
        }
        setState({ kind: 'error' });
      });
    return () => controller.abort();
  }, [runId]);

  if (state.kind === 'loading') return <p role="status">Loading report…</p>;
  if (state.kind === 'missing') return <p role="alert">Report not found.</p>;
  if (state.kind === 'error') return <p role="alert">Report could not be loaded.</p>;
  if (state.kind === 'not-ready') {
    return (
      <div>
        <p role="alert">Report is not ready.</p>
        {state.inspectionId ? <Link to={`/inspections/${encodeURIComponent(state.inspectionId)}`}>Back to inspection</Link> : null}
      </div>
    );
  }

  const { report } = state;
  const json = canonicalReportJson(report);
  const href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;

  return (
    <article aria-labelledby="report-heading" data-testid="report-page" data-run-id={state.runId}>
      <p>
        <Link to={`/inspections/${encodeURIComponent(report.inspectionId)}`}>Back to inspection</Link>
      </p>
      <h2 id="report-heading">
        Report: {report.vehicle.year} {report.vehicle.make} {report.vehicle.model}
      </h2>
      <dl>
        <dt>Stock number</dt>
        <dd>{report.vehicle.stockNumber}</dd>
        <dt>Mileage</dt>
        <dd>{report.vehicle.mileage.toLocaleString('en-US')}</dd>
        <dt>Exterior color</dt>
        <dd>{report.vehicle.exteriorColor}</dd>
        <dt>Inspection</dt>
        <dd>
          {report.inspectionId} · revision <span data-testid="report-revision">{report.inspectionRevision}</span>
        </dd>
        <dt>Inspected</dt>
        <dd>{formatTime(report.inspectedAt)}</dd>
        <dt>Inspector</dt>
        <dd>{report.inspectorLabel}</dd>
      </dl>
      <h3>Findings</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Area</th>
            <th scope="col">Severity</th>
            <th scope="col">Description</th>
          </tr>
        </thead>
        <tbody>
          {report.findings.map((finding) => (
            <tr key={finding.id} data-testid={`report-finding-${finding.id}`}>
              <td>{finding.area}</td>
              <td>
                <span className="severity">{finding.severity}</span>
              </td>
              <td>{finding.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <a href={href} download={`report-${report.inspectionId}-rev${report.inspectionRevision}.json`} data-testid="download-json">
          Download JSON
        </a>
      </p>
      <details>
        <summary>Show JSON</summary>
        <pre className="json" data-testid="report-json">
          {json}
        </pre>
      </details>
    </article>
  );
}
