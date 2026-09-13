import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Vehicle } from '../../shared/reportTypes.ts';
import { fetchJson } from '../reports/reportApi.ts';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; vehicles: Vehicle[] };

export function VehiclesPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback((signal?: AbortSignal) => {
    setState({ kind: 'loading' });
    fetchJson<{ vehicles: Vehicle[] }>('/api/vehicles', { signal })
      .then(({ vehicles }) => setState({ kind: 'ready', vehicles }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ kind: 'error' });
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <section aria-labelledby="vehicles-heading">
      <h2 id="vehicles-heading">Vehicles</h2>
      {state.kind === 'loading' ? <p role="status">Loading vehicles…</p> : null}
      {state.kind === 'error' ? (
        <div>
          <p role="alert" className="alert">
            Vehicles could not be loaded.
          </p>
          <button type="button" className="secondary" onClick={() => load()}>
            Try again
          </button>
        </div>
      ) : null}
      {state.kind === 'ready' && state.vehicles.length === 0 ? <p>No sample vehicles.</p> : null}
      {state.kind === 'ready' && state.vehicles.length > 0 ? (
        <table className="responsive-table">
          <thead>
            <tr>
              <th scope="col">Stock number</th>
              <th scope="col">Vehicle</th>
              <th scope="col" className="numeric">
                Mileage
              </th>
              <th scope="col">Inspection</th>
            </tr>
          </thead>
          <tbody>
            {state.vehicles.map((vehicle) => (
              <tr key={vehicle.id} data-testid={`vehicle-row-${vehicle.id}`}>
                <td data-label="Stock number">{vehicle.stockNumber}</td>
                <td data-label="Vehicle">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </td>
                <td data-label="Mileage" className="numeric">
                  {vehicle.mileage.toLocaleString('en-US')}
                </td>
                <td data-label="Inspection">
                  <Link to={`/inspections/${encodeURIComponent(inspectionIdFor(vehicle))}`}>Open inspection</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

// Fixture convention: vehicle veh-001 has inspection insp-001. The starter keeps this simple mapping.
function inspectionIdFor(vehicle: Vehicle): string {
  return vehicle.id.replace(/^veh-/, 'insp-');
}
