# M5 — Complete failure/retry and verify completion (20 minutes)

**Claude Code capability:** a `PostToolUse` command hook whose script decides pass/fail; a measurable
completion condition (`/goal` where available, otherwise the published fallback prompt); a short
`/loop` demonstration with an explicit interval, then cancellation. Hooks, goals and loops go beyond the
supplied internal guides; they are workshop extensions, and no survey demand for any particular command is
claimed.

**Opening:** Finish recovery and prove it. Give Claude an observable completion condition and inspect
what the checks actually establish.

## Do

1. Inspect the hook: `.claude/settings.json` (event `PostToolUse`, matcher `Edit|Write|MultiEdit`)
   and `.claude/hooks/check-report-change.mjs`. It runs `npm run check -- --stage fast` only after edits
   to report source files and reports failures back to Claude. It runs after the edit; it cannot undo it.
2. Implement increment B: `Retry report` calls the retry endpoint (not Start), the panel follows the
   child attempt and clears the old error, stale responses are ignored, and a new test under
   `tests/acceptance/` exposes the original stuck-state defect.
3. Recommended completion condition (when `/goal` is available):

   ```text
   /goal Implement increment B in PLAN.md. The m5 checks must pass on the current code, the original
   report contents and supplied service/check configuration must remain unchanged, and you must show
   the executed check output. If a requirement cannot be satisfied within those boundaries, report the
   blocker. Do not merge or deploy.
   ```

   Fallback if `/goal` is unavailable: paste the same text as a normal prompt and run the checks
   yourself after each attempt. Same criteria; say which mode you used.
4. Observe the hook after a relevant edit. If a check fails, use its output to direct the correction,
   then observe the passing case. If your change passes first time, inspect the labeled failure example
   in `workshop/evidence-examples.md` instead of breaking working code.
5. Run `npm run check -- --stage m5 --json workshop/evidence/m5-check.json`. Check the running UI.
   Compare the goal/evaluator's conclusion with the executed output; clear any unfinished goal.

## Submit

The complete M5 candidate, the check output, UI evidence, the hook observation, the completion
condition and your checked conclusion. Commit and push. **This commit is captured for peer review.**

## How M5 is graded (5 method points)

| Level | Looks like |
| --- | --- |
| 0 | An unsupported completion claim. |
| 2.5 | A useful bounded check cycle with a material missing observation. |
| 5 | A measurable condition, accurately described hook/check evidence, and a supported completion or blocker decision. |

Passing the six application cases earns the separate 40 behavior points. Scheduling a loop earns
nothing extra.
