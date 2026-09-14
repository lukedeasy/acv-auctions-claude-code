import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunView, SchedulerMode, OpsState } from '../../shared/reportTypes.ts';
import { ApiError, fetchJson } from '../reports/reportApi.ts';

const REFRESH_MS = 750;

/**
 * Operations panel: reset, failure testing, scheduling mode and manual run control.
 * Everything here talks to /api/ops/*, which only touches this environment's in-memory data.
 */
export function OpsPanel() {
  const [state, setState] = useState<OpsState | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchJson<OpsState>('/api/ops/state');
      setState(next);
      setError(null);
    } catch {
      setError('The operations panel could not reach the API.');
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

  async function act(label: string, fn: () => Promise<unknown>, optimistic?: Partial<OpsState>) {
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
    <section className="ops" aria-labelledby="ops-heading" data-testid="ops-panel">
      <span className="badge">STAGING</span>
      <h2 id="ops-heading">Operations</h2>
      <p className="meta">This environment keeps its data in memory. Restarting the server restores the seed data.</p>
      <div className="row">
        <button type="button" onClick={() => act('Reset data', () => post('/api/ops/reset'))} data-testid="ops-reset">
          Reset data
        </button>
      </div>
      <fieldset>
        <legend>Failure testing</legend>
        <label>
          <input
            type="checkbox"
            checked={state?.failNextGeneration ?? false}
            onChange={(event) =>
              act('Fail next generation', () => post('/api/ops/config', { failNextGeneration: event.target.checked }), {
                failNextGeneration: event.target.checked,
              })
            }
            data-testid="ops-fail-next"
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
              name="ops-mode"
              value={mode}
              checked={state?.mode === mode}
              onChange={() => act(`Mode ${mode}`, () => post('/api/ops/config', { mode }), { mode })}
              data-testid={`ops-mode-${mode}`}
            />{' '}
            {mode === 'automatic' ? 'Automatic' : 'Manual'}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Selected attempt</legend>
        <label htmlFor="ops-run-select">Run</label>
        <select id="ops-run-select" value={effectiveSelectedId} onChange={(event) => setSelectedRunId(event.target.value)} data-testid="ops-run-select">
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
            onClick={() => selected && act('Begin selected attempt', () => post(`/api/ops/runs/${encodeURIComponent(selected.id)}/begin`))}
            data-testid="ops-begin"
          >
            Begin selected attempt
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!selected}
            onClick={() => selected && act('Finish selected attempt', () => post(`/api/ops/runs/${encodeURIComponent(selected.id)}/finish`))}
            data-testid="ops-finish"
          >
            Finish selected attempt
          </button>
        </div>
        {selected ? (
          <div className="selected" data-testid="ops-selected">
            <div>
              Run ID: <code data-testid="ops-selected-id">{selected.id}</code>
            </div>
            <div>
              Status: <span data-testid="ops-selected-status">{selected.status}</span>
            </div>
            <div>
              Report revision: <span data-testid="ops-selected-revision">{selected.inspectionRevision}</span>
            </div>
          </div>
        ) : null}
      </fieldset>
      {message ? (
        <p role="status" className="meta" data-testid="ops-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="alert" data-testid="ops-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
