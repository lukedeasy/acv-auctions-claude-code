# Inspection Desk

Fictional vehicle-inspection report workbench. TypeScript, React + Vite (client), Express (server),
Vitest + Playwright (checks). Node 24. In-memory sample data; restarting the API resets it.

## Commands

- `npm ci` then `npm run prepare:local` once. `npm run dev` starts API (4100) and UI (5173).
- `npm run check -- --stage <baseline|fast|m1|m2|m3|m4|m5|m6>`; add `--json <path>` for a result file.
- `fast` has no browser and is what the PostToolUse hook runs after edits to report source files.

## Where things are

- Learner area: `src/client/reports/ReportPanel.tsx`, `src/client/reports/reportApi.ts`,
  `src/server/routes/reports.ts`, new tests under `tests/acceptance/` (new files only).
- Prepared, read but do not change: `src/server/reports/reportJobs.ts` (job service: start/retry/get/list,
  one active run per inspection, retry rules), `buildReport.ts`, `reportStore.ts`, `scheduler.ts`,
  `legacyGenerate.ts`, `src/shared/reportTypes.ts`, `fixtures/`, `tests/service/`, `scripts/check.mjs`.
- Assignment: `workshop/ticket.md`, `workshop/product-decisions.md`, `workshop/acceptance.md`, briefs in `workshop/briefs/`.
- Your work record: `SPEC.md`, `PLAN.md`, `EVIDENCE.md` (keep the assignment there, not here).

## Rules

- Report contents must not change. `buildReport.ts` defines them; `fixtures/expected-reports.json` is the oracle.
- New route handlers call the job service. They never import `buildReport` or `ReportStore` (SYS-02).
- Do not edit protected files (SYS-03). Add new test files instead of changing supplied ones.
- Validate HTTP input at the boundary; a TypeScript cast is not validation.
- Prefer small, reviewable changes; explain any change outside the learner area in PLAN.md.
