import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RunView } from '../../shared/reportTypes.ts';
import { ApiError, listInspectionRuns, requestLegacyReport } from './reportApi.ts';

interface Props {
  inspectionId: string;
}

/**
 * Report panel using the older synchronous generation path.
 * The browser waits for the server to build the whole report before it shows anything.
 */
export function ReportPanel({ inspectionId }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<RunView | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLatest(null);
    setError(null);
    listInspectionRuns(inspectionId, controller.signal)
      .then(({ runs }) => {
        const completed = runs.find((run) => run.status === 'completed');
        setLatest(completed ?? null);
      })
      .catch(() => {
        /* the panel still works without history */
      });
    return () => controller.abort();
  }, [inspectionId]);

  async function generate() {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await requestLegacyReport(inspectionId);
      const { runs } = await listInspectionRuns(inspectionId);
      setLatest(runs.find((run) => run.id === result.runId) ?? null);
      setIsGenerating(false);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Report generation failed. Try again.';
      setError(message);
    }
  }

  return (
    <section className="panel" aria-labelledby="report-panel-heading" data-testid="report-panel">
      <h2 id="report-panel-heading">Report</h2>
      <div role="status" aria-live="polite" className={`status${latest && !isGenerating ? ' ok' : ''}`} data-testid="report-status">
        {isGenerating ? 'Generating report…' : latest ? 'Report ready' : 'No report generated.'}
      </div>
      {error ? (
        <div role="alert" className="alert" data-testid="report-error">
          {error}
        </div>
      ) : null}
      <div className="panel-controls">
        <button type="button" onClick={generate} disabled={isGenerating} data-testid="generate-report">
          Generate report
        </button>
        {latest && !isGenerating ? (
          <Link to={`/reports/${encodeURIComponent(latest.id)}`} data-testid="open-report">
            Open report
          </Link>
        ) : null}
      </div>
      {latest ? (
        <p className="meta">
          {latest.origin === 'legacy' ? 'Legacy' : `Attempt ${latest.attemptNumber}`} · run <code>{latest.id}</code> · revision {latest.inspectionRevision}
        </p>
      ) : null}
    </section>
  );
}
