/**
 * Evidence and specification structure checks used by scripts/check.mjs (stages m1–m3 and evidence).
 * Pure functions over a project root so they can be unit-tested against temporary directories.
 *
 * These checks are diagnostics of document shape and internal consistency. They cannot judge whether a
 * specification, plan or decision is good; that is assessed from the evidence by a person or a validated grader.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const ALL_AC = ['AC-01', 'AC-02', 'AC-03', 'AC-04', 'AC-05', 'AC-06'];
// Unfilled outline values: empty, an HTML comment, a bare dash, or the usual TODO markers.
export const PLACEHOLDER = /^(?:<[^>]*>|\(fill in\)|TODO|TBD|_?not filled_?|—|-)?$/i;

export function readDoc(root, name) {
  const file = path.join(root, name);
  if (!existsSync(file)) throw new Error(`${name} is missing`);
  return readFileSync(file, 'utf8');
}

export function section(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => /^##\s+/.test(line) && line.replace(/^##\s+/, '').trim().startsWith(heading));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

export function fieldValue(text, label) {
  const match = new RegExp(`^\\s*(?:[-*]\\s*)?\\*{0,2}${escapeRegExp(label)}\\*{0,2}\\s*:\\s*(.*)$`, 'mi').exec(text);
  return match ? match[1].trim() : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Paths cited in an entry (optionally with :line suffixes). */
export function citedPaths(body) {
  const cited = new Set();
  for (const match of body.matchAll(/`?((?:src|tests|scripts|workshop|fixtures|\.claude)\/[\w./-]+?)(?::\d+(?:-\d+)?)?`?(?=[\s,;)`]|$)/g)) cited.add(match[1]);
  return [...cited];
}

// M1 and M3 entries must cite at least one source path; other entries only need any cited path to exist.
export function checkCitedPaths(root, body, label, requireOne = true) {
  const problems = [];
  const cited = citedPaths(body);
  if (requireOne && cited.length === 0) problems.push(`${label}: no source path is cited (expected at least one path under src/, tests/ or similar)`);
  for (const rel of cited) {
    if (!existsSync(path.join(root, rel))) problems.push(`${label}: cited path does not exist: ${rel}`);
  }
  return problems;
}

export function checkEvidenceEntry(root, moduleId, requiredFields, { requireCitedPath = true } = {}) {
  const text = readDoc(root, 'EVIDENCE.md');
  const body = section(text, moduleId);
  if (body === null) return [`EVIDENCE.md has no "## ${moduleId}" section`];
  const problems = [];
  for (const field of requiredFields) {
    const value = fieldValue(body, field);
    if (value === null) problems.push(`${moduleId}: missing field "${field}:"`);
    else if (PLACEHOLDER.test(value)) problems.push(`${moduleId}: field "${field}:" is not filled in`);
  }
  const commit = fieldValue(body, 'Tested commit');
  if (commit && !/^[a-f0-9]{7,40}\b/i.test(commit)) problems.push(`${moduleId}: "Tested commit:" should start with a commit SHA (7–40 hex characters)`);
  problems.push(...checkCitedPaths(root, body, moduleId, requireCitedPath));
  return problems;
}

export function checkEvidenceEntryQuiet(root, moduleId, requiredFields, options) {
  try {
    return checkEvidenceEntry(root, moduleId, requiredFields, options);
  } catch (error) {
    return [String(error.message)];
  }
}

export function checkSpec(root) {
  const text = readDoc(root, 'SPEC.md');
  const problems = [];
  for (const heading of ['Problem and evidence', 'Intended behavior', 'Failure cases', 'Constraints', 'Acceptance criteria', 'Scope', 'Open decisions']) {
    const body = section(text, heading);
    if (body === null) problems.push(`SPEC.md: missing "## ${heading}" section`);
    else if (body.replace(/<!--[\s\S]*?-->/g, '').trim().length < 20) problems.push(`SPEC.md: "## ${heading}" is empty`);
  }
  const acceptance = section(text, 'Acceptance criteria') ?? '';
  const rows = [...acceptance.matchAll(/^\|\s*(AC-0[1-6])\s*\|/gm)].map((m) => m[1]);
  for (const id of ALL_AC) {
    const count = rows.filter((row) => row === id).length;
    if (count === 0) problems.push(`SPEC.md: acceptance table has no row for ${id}`);
    if (count > 1) problems.push(`SPEC.md: acceptance ID ${id} appears ${count} times; IDs must be unique`);
  }
  const acceptanceLines = acceptance.split('\n').filter((line) => /^\|\s*AC-0[1-6]\s*\|/.test(line));
  for (const line of acceptanceLines) {
    const cells = line.split('|').map((cell) => cell.trim()).filter((_, index, all) => index > 0 && index < all.length - 1);
    if (cells.length < 4) problems.push(`SPEC.md: row "${cells[0]}" needs example, expected result and planned check columns`);
    else if (cells.slice(1).some((cell) => cell.length === 0 || PLACEHOLDER.test(cell))) problems.push(`SPEC.md: row "${cells[0]}" has an unfilled cell`);
  }
  return problems;
}

export function checkPlan(root) {
  const text = readDoc(root, 'PLAN.md');
  const problems = [];
  for (const heading of ['Kind of change', 'Increment A', 'Increment B', 'Acceptance mapping', 'Change estimate', 'Subagent investigation', 'Alternatives considered']) {
    const body = section(text, heading);
    if (body === null) problems.push(`PLAN.md: missing "## ${heading}" section`);
    else if (body.replace(/<!--[\s\S]*?-->/g, '').trim().length < 20) problems.push(`PLAN.md: "## ${heading}" is empty`);
  }
  const mapping = section(text, 'Acceptance mapping') ?? '';
  for (const id of ALL_AC) {
    const row = mapping.split('\n').find((line) => new RegExp(`^\\|\\s*${id}\\s*\\|`).test(line));
    if (!row) {
      problems.push(`PLAN.md: acceptance mapping has no row for ${id}`);
      continue;
    }
    const cells = row.split('|').map((cell) => cell.trim()).filter((_, index, all) => index > 0 && index < all.length - 1);
    if (cells.length < 4 || cells.slice(1).some((cell) => cell.length === 0 || PLACEHOLDER.test(cell))) problems.push(`PLAN.md: ${id} row must name the increment, file(s) and check`);
    else if (!/\b(A|B)\b/.test(cells[1])) problems.push(`PLAN.md: ${id} row must assign increment A or B`);
  }
  const estimate = section(text, 'Change estimate') ?? '';
  for (const field of ['Application code', 'Tests']) {
    const value = fieldValue(estimate, field);
    if (value === null) problems.push(`PLAN.md: change estimate missing "${field}:" range`);
    else if (!/\d+\s*(?:–|-|to)\s*\d+/.test(value)) problems.push(`PLAN.md: "${field}:" should be a range such as 40–80 lines`);
  }
  const subagent = section(text, 'Subagent investigation') ?? '';
  for (const field of ['Question', 'Tools', 'Model', 'Finding', 'Verification', 'Effect on plan']) {
    const value = fieldValue(subagent, field);
    if (value === null) problems.push(`PLAN.md: subagent investigation missing "${field}:"`);
    else if (PLACEHOLDER.test(value)) problems.push(`PLAN.md: subagent "${field}:" is not filled in`);
  }
  problems.push(...checkCitedPaths(root, subagent, 'PLAN.md subagent investigation'));
  return problems;
}

/**
 * M6 evidence must agree with the check output it cites:
 *  - "Final checks:" names a check result JSON that exists, parses and comes from stage m6;
 *  - that file's testedCommit matches "Tested commit:" (the code version actually checked, which may be
 *    an earlier commit than the one that adds this evidence);
 *  - "Readiness:" agrees with that file: ready_for_merge only when every required check passed,
 *    changes_required only when something failed or "Unresolved:" names outstanding work.
 * The sequence is therefore: run `--stage m6 --json workshop/evidence/m6-check.json`, write the
 * entry from that result, then run `--stage evidence`. Nothing here requires a file to contain its own commit ID.
 */
export function checkM6Evidence(root) {
  const problems = checkEvidenceEntry(root, 'M6', ['Tested commit', 'Outgoing review target', 'Received findings', 'Final checks', 'Readiness', 'Decision'], { requireCitedPath: false });
  const body = section(readDoc(root, 'EVIDENCE.md'), 'M6') ?? '';
  const target = fieldValue(body, 'Outgoing review target');
  if (target && !/[a-f0-9]{40}/i.test(target)) problems.push('M6: "Outgoing review target:" must include the full 40-character SHA you reviewed');
  const readiness = fieldValue(body, 'Readiness');
  if (readiness && !/^(ready_for_merge|changes_required)\b/.test(readiness)) problems.push('M6: "Readiness:" must be ready_for_merge or changes_required');
  const findings = fieldValue(body, 'Received findings');
  if (findings && !/(accepted_fixed|accepted_unresolved|disputed_with_evidence|none received)/.test(body)) problems.push('M6: each received finding needs a disposition: accepted_fixed, accepted_unresolved or disputed_with_evidence (or "none received")');

  const finalChecks = fieldValue(body, 'Final checks');
  const testedCommit = fieldValue(body, 'Tested commit');
  const unresolved = fieldValue(body, 'Unresolved') ?? '';
  const cited = finalChecks ? citedPaths(finalChecks).find((p) => p.endsWith('.json')) ?? (finalChecks.match(/[\w./-]+\.json/) ?? [null])[0] : null;
  if (!cited) {
    problems.push('M6: "Final checks:" must name the check result JSON written by `npm run check -- --stage m6 --json <path>`');
    return problems;
  }
  const file = path.join(root, cited);
  if (!existsSync(file)) {
    problems.push(`M6: cited check result does not exist: ${cited}. Run \`npm run check -- --stage m6 --json ${cited}\` first, then write this entry, then run \`--stage evidence\`.`);
    return problems;
  }
  let result;
  try {
    result = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    problems.push(`M6: cited check result is not valid JSON: ${cited}`);
    return problems;
  }
  if (result.stage !== 'm6') problems.push(`M6: cited check result is from stage "${result.stage}", not m6: ${cited}`);
  if (!Array.isArray(result.checks) || typeof result.exitCode !== 'number') {
    problems.push(`M6: cited check result has no checks/exitCode: ${cited}`);
    return problems;
  }
  const fileCommit = typeof result.testedCommit === 'string' ? result.testedCommit : null;
  if (!fileCommit) problems.push(`M6: cited check result records no tested commit (run the checks from a committed, clean checkout so the result names the code version)`);
  else if (testedCommit && !PLACEHOLDER.test(testedCommit) && !fileCommit.startsWith(testedCommit.split(/\s/)[0].toLowerCase())) {
    problems.push(`M6: "Tested commit:" ${testedCommit.split(/\s/)[0]} does not match the tested commit in ${cited} (${fileCommit.slice(0, 12)})`);
  }
  if (result.workingTreeDirty === true) problems.push(`M6: ${cited} was produced on a working tree with uncommitted changes; run the checks on the committed code version`);
  const failing = result.checks.filter((c) => c.required && c.status !== 'pass').map((c) => c.id);
  if (readiness && readiness.startsWith('ready_for_merge')) {
    if (result.exitCode !== 0 || failing.length > 0) problems.push(`M6: "Readiness: ready_for_merge" but ${cited} reports failing required checks: ${failing.join(', ') || `exit ${result.exitCode}`}`);
  } else if (readiness && readiness.startsWith('changes_required')) {
    if (failing.length === 0 && result.exitCode === 0 && /^(none|n\/a|-)?$/i.test(unresolved)) {
      problems.push(`M6: "Readiness: changes_required" but ${cited} passed every required check and "Unresolved:" names nothing; state what remains or record ready_for_merge`);
    }
  }
  return problems;
}
