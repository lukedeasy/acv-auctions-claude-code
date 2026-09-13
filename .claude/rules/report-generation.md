---
paths:
  - src/client/reports/**
  - src/server/routes/reports.ts
  - src/server/reports/**
  - src/shared/reportTypes.ts
---

# Report generation rule (loaded when these files are read)

- Preserve report contents. For the same inspection snapshot, the modern path must produce exactly the
  document `src/server/reports/buildReport.ts` produces. Do not change the builder, the fixtures or
  `fixtures/expected-reports.json`.
- Route handlers call the prepared job service in `src/server/reports/reportJobs.ts`. They do not import
  or call `buildReport` or `ReportStore`. The legacy route in `legacyGenerate.ts` is the one exception.
- The service already owns run identity, the one-active-run rule and retry validation. Wire its result;
  do not re-implement those rules in the handler or the UI.
- This file is guidance loaded into context. It is not a permission control and it does not prevent an edit.
