import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RunView } from '../../shared/reportTypes.ts';
import { fetchJson } from '../reports/reportApi.ts';
import { formatTime } from './InspectionPage.tsx';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; runs: RunView[] };

export function ReportsPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchJson<{ runs: RunView[] }>('/api/reports', { signal: controller.signal })
      .then(({ runs }) => setState({ kind: 'ready', runs }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ kind: 'error' });
      });
    return () => controller.abort();
  }, []);

  return (
    <section aria-labelledby="reports-heading">
      <h2 id="reports-heading">Reports</h2>
      {state.kind === 'loading' ? <p role="status">Loading reports…</p> : null}
      {state.kind === 'error' ? <p role="alert">Reports could not be loaded.</p> : null}
      {state.kind === 'ready' && state.runs.length === 0 ? <p>No reports yet. Generate one from an inspection.</p> : null}
      {state.kind === 'ready' && state.runs.length > 0 ? (
        <table className="responsive-table">
          <thead>
            <tr>
              <th scope="col">Vehicle</th>
              <th scope="col">Inspection</th>
              <th scope="col">Attempt</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {state.runs.map((run) => (
              <tr key={run.id} data-testid={`report-row-${run.id}`}>
                <td data-label="Vehicle">{run.vehicleId}</td>
                <td data-label="Inspection">
                  {run.inspectionId} · rev {run.inspectionRevision}
                </td>
                <td data-label="Attempt">{run.origin === 'legacy' ? 'Legacy' : `Attempt ${run.attemptNumber}`}</td>
                <td data-label="Status">{run.status}</td>
                <td data-label="Created">{formatTime(run.createdAt)}</td>
                <td data-label="Action">
                  {run.status === 'completed' ? (
                    <Link to={`/reports/${encodeURIComponent(run.id)}`}>Open report</Link>
                  ) : (
                    <Link to={`/inspections/${encodeURIComponent(run.inspectionId)}`}>Open inspection</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
