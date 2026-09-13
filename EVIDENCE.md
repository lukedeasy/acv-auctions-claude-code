# Evidence

<!--
One entry per module. Each entry is short. Link larger artifacts under workshop/evidence/.
"Tested commit" is the commit you actually ran the checks on; you may commit this file afterwards.
Never paste a full personal transcript. A short exchange or tool-result excerpt is enough.
-->

## M1

- Tested commit: d1ae24f2af60ab33e63d0925b94f191d96f0178d
- Reproduction: REHEARSAL (Luke Deasy, facilitator). Reset, ticked Fail next generation, clicked Generate report on /inspections/insp-001; error shown, Generate button stayed disabled.
- Source references: src/client/reports/ReportPanel.tsx (catch branch never resets isGenerating); tests/baseline/screens.spec.ts [BASE-02] asserts only the alert text.
- Model/effort: default model and effort; reading three files did not justify a change.
- Claude excerpt: <!-- a few lines showing the claim you checked -->
- Decision: checked the claim in ReportPanel.tsx and confirmed with npm run check -- --stage baseline (BASE-02-STRONG fails on the generating text).
- Unresolved: none

## M2

- Tested commit:
- Clarification: <!-- the material question Claude asked, the source-backed answer or the open decision -->
- Claude excerpt:
- Decision: <!-- how the answer changed SPEC.md -->
- Unresolved:

## M3

- Tested commit:
- Subagent: <!-- question, tools, model; link the returned finding -->
- Claude excerpt:
- Decision: <!-- accepted, corrected or rejected the finding, and how the plan changed -->
- Unresolved:

## M4

- Tested commit:
- Check output: <!-- path to the m4 result JSON or the relevant lines -->
- Review context file: <!-- path under workshop/evidence/ -->
- Claude excerpt: <!-- the most consequential finding from /workshop-review -->
- Decision: <!-- verified the finding against the code; corrected or supported acceptance -->
- Unresolved:

## M5

- Tested commit:
- Completion condition: <!-- the /goal text or the cohort fallback prompt -->
- Hook observation: <!-- what the hook reported after a relevant edit; the failing case and the passing case -->
- Check output:
- UI evidence:
- Claude excerpt:
- Decision: <!-- the completion or blocker judgment checked against executed results -->
- Unresolved:

## M6

<!-- Order: commit your code → `npm run check -- --stage m6 --json workshop/evidence/m6-check.json` → fill this entry from that result → `npm run check -- --stage evidence` → commit. -->

- Tested commit: <!-- the code commit the m6 result names (testedCommit in the JSON); this entry is committed afterwards -->
- Outgoing review target: <!-- author login and the full 40-character SHA you reviewed -->
- Received findings: <!-- one line per finding: accepted_fixed | accepted_unresolved | disputed_with_evidence, or "none received" -->
- Final checks: <!-- workshop/evidence/m6-check.json -->
- Readiness: <!-- ready_for_merge only if every required check in that result passed; otherwise changes_required and name what is unresolved -->
- Decision:
- Unresolved:
