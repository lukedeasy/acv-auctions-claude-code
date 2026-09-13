import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Inspection, Vehicle } from '../../shared/reportTypes.ts';
import { ReportPanel } from '../reports/ReportPanel.tsx';
import { ApiError, fetchJson } from '../reports/reportApi.ts';

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error' }
  | { kind: 'ready'; inspection: Inspection; vehicle: Vehicle };

export function InspectionPage() {
  const { inspectionId = '' } = useParams();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    fetchJson<{ inspection: Inspection; vehicle: Vehicle }>(`/api/inspections/${encodeURIComponent(inspectionId)}`, {
      signal: controller.signal,
    })
      .then(({ inspection, vehicle }) => setState({ kind: 'ready', inspection, vehicle }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof ApiError && error.status === 404) setState({ kind: 'missing' });
        else setState({ kind: 'error' });
      });
    return () => controller.abort();
  }, [inspectionId]);

  return (
    <section aria-labelledby="inspection-heading" data-testid="inspection-page" data-inspection-id={inspectionId}>
      <p>
        <Link to="/vehicles">Back to vehicles</Link>
      </p>
      {state.kind === 'loading' ? <p role="status">Loading inspection…</p> : null}
      {state.kind === 'missing' ? <p role="alert">Inspection not found.</p> : null}
      {state.kind === 'error' ? <p role="alert">Inspection could not be loaded.</p> : null}
      {state.kind === 'ready' ? (
        <>
          <h2 id="inspection-heading">
            {state.vehicle.year} {state.vehicle.make} {state.vehicle.model}
          </h2>
          <dl>
            <dt>Stock number</dt>
            <dd>{state.vehicle.stockNumber}</dd>
            <dt>Mileage</dt>
            <dd>{state.vehicle.mileage.toLocaleString('en-US')}</dd>
            <dt>Inspected</dt>
            <dd>
              {formatTime(state.inspection.inspectedAt)} · revision {state.inspection.revision}
            </dd>
            <dt>Inspector</dt>
            <dd>{state.inspection.inspectorLabel}</dd>
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
              {state.inspection.findings.map((finding) => (
                <tr key={finding.id}>
                  <td>{finding.area}</td>
                  <td>
                    <span className="severity">{finding.severity}</span>
                  </td>
                  <td>{finding.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ReportPanel key={inspectionId} inspectionId={inspectionId} />
        </>
      ) : null}
    </section>
  );
}

export function formatTime(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}
