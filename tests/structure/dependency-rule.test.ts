/**
 * [SYS-02] The new run/retry handlers must delegate to the prepared job service.
 * They may not import or call the report builder or the runtime store, directly or through a helper
 * they introduce. The legacy module is the one allowed builder caller.
 *
 * Method: parse the import graph starting at the routes module with the TypeScript compiler API,
 * follow relative imports into files outside the protected set, and inspect every reached file.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..', '..');
const ENTRY = 'src/server/routes/reports.ts';
// Prepared modules that already own the builder/store relationship. They are not inspected.
const ALLOWED_MODULES = new Set([
  'src/server/reports/reportJobs.ts',
  'src/server/reports/legacyGenerate.ts',
  'src/server/reports/scheduler.ts',
  'src/server/fixtures/loadFixtures.ts',
  'src/server/http.ts',
  'src/server/errors.ts',
]);
const FORBIDDEN_MODULES = ['src/server/reports/buildReport.ts', 'src/server/reports/reportStore.ts'];
const FORBIDDEN_IDENTIFIERS = ['buildReport', 'canonicalReportJson', 'ReportStore', 'toRunView'];

function resolveImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate) && !candidate.endsWith('/')) return candidate;
  }
  return null;
}

interface FileFacts {
  rel: string;
  imports: string[];
  identifiers: string[];
}

function inspect(file: string): FileFacts {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  const identifiers: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (spec && ts.isStringLiteral(spec)) imports.push(spec.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) imports.push(arg.text);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) imports.push(arg.text);
    } else if (ts.isIdentifier(node)) {
      identifiers.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { rel: path.relative(root, file), imports, identifiers };
}

function walkGraph(): Map<string, FileFacts> {
  const seen = new Map<string, FileFacts>();
  const queue = [path.join(root, ENTRY)];
  while (queue.length > 0) {
    const file = queue.shift()!;
    const rel = path.relative(root, file);
    if (seen.has(rel) || ALLOWED_MODULES.has(rel) || rel.startsWith('src/shared/')) continue;
    const facts = inspect(file);
    seen.set(rel, facts);
    for (const spec of facts.imports) {
      const resolved = resolveImport(file, spec);
      if (resolved) queue.push(resolved);
    }
  }
  return seen;
}

describe('[SYS-02] dependency rule for new report handlers', () => {
  it('[SYS-02] routes/reports.ts and any helper it introduces do not import the builder or the store', () => {
    const graph = walkGraph();
    expect(graph.has(ENTRY)).toBe(true);
    const violations: string[] = [];
    for (const facts of graph.values()) {
      for (const spec of facts.imports) {
        const resolved = resolveImport(path.join(root, facts.rel), spec);
        if (!resolved) continue;
        const rel = path.relative(root, resolved);
        if (FORBIDDEN_MODULES.includes(rel)) violations.push(`${facts.rel} imports ${rel}`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('[SYS-02] reached application files do not reference builder/store identifiers by name', () => {
    const graph = walkGraph();
    const violations: string[] = [];
    for (const facts of graph.values()) {
      for (const id of facts.identifiers) {
        if (FORBIDDEN_IDENTIFIERS.includes(id)) violations.push(`${facts.rel} references ${id}`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('[SYS-02] the allowed service path is still wired: routes/reports.ts uses the job service type', () => {
    const facts = inspect(path.join(root, ENTRY));
    expect(facts.imports.some((spec) => spec.includes('reports/reportJobs'))).toBe(true);
  });
});
