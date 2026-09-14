# Inspection Desk

Inspection Desk is the workbench inspection coordinators use to look up a vehicle, read its inspection
findings and generate the inspection report. This repository contains the web client, the API and the
report-generation service.

## Quick start

```sh
npm ci
npm run prepare:local        # checks Node 24 and the ports, installs the pinned Chromium once
npm run dev                  # API http://127.0.0.1:4100, UI http://127.0.0.1:5173
npm run check -- --stage baseline
```

The baseline stage must be green before you start work. `BASE-02-STRONG` is a diagnostic and fails on
the current code: that is the open defect in the report-generation ticket.

## Current ticket

Read, in order: `workshop/ticket.md`, `workshop/product-decisions.md`, `workshop/acceptance.md`, then the
six briefs in `workshop/briefs/`. Record your work in `SPEC.md`, `PLAN.md` and `EVIDENCE.md`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts API and UI together; Ctrl+C stops both. Ports via `.env` (see `.env.example`). |
| `npm run build` / `npm run start` | Builds to `dist/` and serves app + API from one port (`INSPECTION_DESK_API_PORT`, default 4100). |
| `npm run check -- --stage <stage>` | `baseline`, `fast`, `m1`…`m6`, `evidence`. `--json <path>` writes a result file. Exit 0 pass, 1 failed check, 2 tooling problem. |
| `npm run test:unit` / `npm run test:e2e` | Raw Vitest / Playwright runs (the staged command is the documented path). |

Browser checks use ports 4190/5190 so they do not collide with `npm run dev`.

## What is protected and what is open

Protected: the job service (`src/server/reports/reportJobs.ts`), report builder, runtime store,
scheduler, legacy route, shared types, fixtures, service tests and the check runner.

Open for the ticket: `src/client/reports/ReportPanel.tsx`, `src/client/reports/reportApi.ts`,
`src/server/routes/reports.ts` (three handlers that currently return 501) and new tests under
`tests/acceptance/`. A justified change elsewhere is allowed if you explain it in `PLAN.md`.

## Claude Code configuration in this repository

- `CLAUDE.md`: project guidance. `.claude/rules/report-generation.md`: a rule loaded only when report
  source files are read.
- `.claude/agents/report-investigator.md`: a read-only investigator (Read, Grep, Glob; no shell).
- `.claude/skills/workshop-review/SKILL.md`: `/workshop-review <context file>` reviews a change in a
  separate context using that agent. Used on your own increment in M4 and a peer's in M6.
- `.claude/settings.json` + `.claude/hooks/check-report-change.mjs`: a `PostToolUse` hook that runs the
  fast checks after Claude edits report source files and reports failures back.

## Environment limits

State is kept in memory; restarting the API restores the seed data. There is no persistence, no
multi-process safety, no authentication, no PDF output and no deployment path. The **Operations** panel
(reset, failure testing, scheduling mode, manual run control) is for this environment only.

## License

MIT. See `LICENSE`.
