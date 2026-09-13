# M1 — Investigate the existing application (10 minutes)

**Claude Code capability:** targeted context. File references, the project instructions in `CLAUDE.md`,
the path-scoped rule in `.claude/rules/report-generation.md`, and the model/effort you choose for an
investigation. A rule in a file is guidance; it does not restrict what a tool can do.

**Opening:** Run the existing application. Reproduce the failed report request. Use Claude Code to
trace the request from the button to the server, then check the explanation against the code.

## Do

1. `npm run dev`. Open `http://127.0.0.1:5173/inspections/insp-001`.
2. In **Workshop controls**, tick **Fail next generation**. Click **Generate report**. Observe the error
   and the button. That is the symptom.
3. Ask Claude to explain it. Useful starting prompt:

   > Investigate why report generation leaves the interface stuck after failure. Read the project
   > instructions and relevant code. Reproduce the symptom with the supplied controls. Cite the state
   > update responsible and what the current test does and does not check. Do not implement the fix.

4. Verify the cited condition yourself in `src/client/reports/ReportPanel.tsx`. Look at what
   `tests/baseline/screens.spec.ts` ([BASE-02]) asserts and what `npm run check -- --stage baseline`
   reports under `BASE-02-STRONG`.
5. Note the model and effort you used (`/model`) and whether this task justified changing it. Use
   `/context` if you want to see what Claude is carrying.
6. Do not change application code in this module.

## Submit

Fill the **M1** entry in `EVIDENCE.md`: the tested commit (the starter commit you investigated),
reproduction steps, `path:line` references, the model/effort decision with a reason, a short excerpt of
Claude's claim, and what you checked or corrected. Commit and
push. If your upstream PR does not exist yet, open it now (see `CONTRIBUTING.md`).

`npm run check -- --stage m1` verifies the entry's structure and that cited paths exist. It awards no points.

## How M1 is graded (5 method points)

| Level | Looks like |
| --- | --- |
| 0 | An unsupported diagnosis, or a screenshot of a model name with no investigation. |
| 2.5 | A useful observed investigation with a material verification missing (for example the claim about the test was not checked). |
| 5 | Correct reproduction, correct source reasoning checked against the code, and an evidenced context/model decision with a reason. |

More agents, more commands or a more expensive model earn nothing by themselves.

## If you fall behind

The symptom is the disabled **Generate report** button after `Report generation failed. Try again.`
The entry point is `src/client/reports/ReportPanel.tsx` → `src/client/reports/reportApi.ts` →
`POST /api/inspections/:id/report` in `src/server/routes/reports.ts`. Record in EVIDENCE.md that
you used this supplied starting point.
