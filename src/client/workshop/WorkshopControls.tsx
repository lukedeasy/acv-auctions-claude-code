import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunView, SchedulerMode, WorkshopState } from '../../shared/reportTypes.ts';
import { ApiError, fetchJson } from '../reports/reportApi.ts';

const REFRESH_MS = 750;

/**
 * Test controls for the fictional teaching environment. Always visible; not a product feature.
 * Everything here talks to /api/workshop/* which only touches in-memory sample data.
 */
export function WorkshopControls() {
  const [state, setState] = useState<WorkshopState | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchJson<WorkshopState>('/api/workshop/state');
      setState(next);
      setError(null);
    } catch {
      setError('Workshop controls could not reach the API.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    timer.current = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [refresh]);

  const runs = state?.runs ?? [];
  const newestActive = runs.find((run) => run.status === 'pending' || run.status === 'running');
  const effectiveSelectedId = selectedRunId && runs.some((run) => run.id === selectedRunId) ? selectedRunId : (newestActive?.id ?? runs[0]?.id ?? '');
  const selected: RunView | undefined = runs.find((run) => run.id === effectiveSelectedId);

  async function act(label: string, fn: () => Promise<unknown>, optimistic?: Partial<WorkshopState>) {
    setMessage(null);
    setError(null);
    if (optimistic) setState((previous) => (previous ? { ...previous, ...optimistic } : previous));
    try {
      await fn();
      setMessage(`${label}: done`);
      await refresh();
    } catch (err) {
      const text = err instanceof ApiError ? `${err.code}: ${err.message}` : `${label} failed`;
      setError(text);
      await refresh();
    }
  }

  const post = (path: string, body: unknown = {}) => fetchJson(path, { method: 'POST', body: JSON.stringify(body) });

  return (
    <section className="workshop" aria-labelledby="workshop-heading" data-testid="workshop-controls">
      <span className="badge">WORKSHOP SIMULATION</span>
      <h2 id="workshop-heading">Workshop controls</h2>
      <p className="meta">Sample data lives in server memory; restarting the server resets everything.</p>
      <div className="row">
        <button type="button" onClick={() => act('Reset sample data', () => post('/api/workshop/reset'))} data-testid="ws-reset">
          Reset sample data
        </button>
      </div>
      <fieldset>
        <legend>Failure injection</legend>
        <label>
          <input
            type="checkbox"
            checked={state?.failNextGeneration ?? false}
            onChange={(event) =>
              act('Fail next generation', () => post('/api/workshop/config', { failNextGeneration: event.target.checked }), {
                failNextGeneration: event.target.checked,
              })
            }
            data-testid="ws-fail-next"
          />{' '}
          Fail next generation
        </label>
      </fieldset>
      <fieldset>
        <legend>Scheduling</legend>
        {(['automatic', 'manual'] as SchedulerMode[]).map((mode) => (
          <label key={mode}>
            <input
              type="radio"
              name="ws-mode"
              value={mode}
              checked={state?.mode === mode}
              onChange={() => act(`Mode ${mode}`, () => post('/api/workshop/config', { mode }), { mode })}
              data-testid={`ws-mode-${mode}`}
            />{' '}
            {mode === 'automatic' ? 'Automatic' : 'Manual'}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Selected attempt</legend>
        <label htmlFor="ws-run-select">Run</label>
        <select id="ws-run-select" value={effectiveSelectedId} onChange={(event) => setSelectedRunId(event.target.value)} data-testid="ws-run-select">
          {runs.length === 0 ? <option value="">No runs yet</option> : null}
          {runs.map((run) => (
            <option key={run.id} value={run.id}>
              {run.inspectionId} · {run.origin === 'legacy' ? 'Legacy' : `Attempt ${run.attemptNumber}`} · {run.status}
            </option>
          ))}
        </select>
        <div className="row">
          <button
            type="button"
            className="secondary"
            disabled={!selected}
            onClick={() => selected && act('Begin selected attempt', () => post(`/api/workshop/runs/${encodeURIComponent(selected.id)}/begin`))}
            data-testid="ws-begin"
          >
            Begin selected attempt
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!selected}
            onClick={() => selected && act('Finish selected attempt', () => post(`/api/workshop/runs/${encodeURIComponent(selected.id)}/finish`))}
            data-testid="ws-finish"
          >
            Finish selected attempt
          </button>
        </div>
        {selected ? (
          <div className="selected" data-testid="ws-selected">
            <div>
              Run ID: <code data-testid="ws-selected-id">{selected.id}</code>
            </div>
            <div>
              Status: <span data-testid="ws-selected-status">{selected.status}</span>
            </div>
            <div>
              Report revision: <span data-testid="ws-selected-revision">{selected.inspectionRevision}</span>
            </div>
          </div>
        ) : null}
      </fieldset>
      {message ? (
        <p role="status" className="meta" data-testid="ws-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="alert" data-testid="ws-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
