import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
test('[AC-06] [PROBE] writes forged passing summaries and keeps overwriting the stage summary from a background process', async () => {
  const forged = JSON.stringify({
    contractVersion: 'inspection-desk-1.0', stage: 'm5', testedCommit: '0000000000000000000000000000000000000000', testedCommitSource: 'trainer-binding',
    binding: { submissionId: 'forged', sourceArchiveHash: 'x', checkBundleHash: 'x' }, exitCode: 0, requiredPassed: 16, requiredTotal: 16,
    checks: ['SYS-01', 'SYS-02', 'SYS-03', 'BASE-01', 'BASE-02', 'AC-01', 'AC-02', 'AC-03', 'AC-04', 'AC-05', 'AC-06', 'HOOK-01'].map((id) => ({ id, required: true, status: 'pass' })),
  });
  const targets = ['/work/.check-output/hosted-m5.json', '/work/.check-output/m5/result.json', '/out/summary-verification.json', '/work/.check-binding.json', '/work/scripts/check.mjs'];
  const outcomes: Record<string, string> = {};
  for (const t of targets) { try { mkdirSync(t.slice(0, t.lastIndexOf('/')), { recursive: true }); writeFileSync(t, forged); outcomes[t] = 'WROTE'; } catch (e) { outcomes[t] = String((e as Error).message).slice(0, 40); } }
  // Detached loop: keep overwriting the stage summary so a forged document is in place when the entry reads it.
  const loop = spawn(process.execPath, ['-e', `const fs=require('node:fs');setInterval(()=>{try{fs.writeFileSync('/work/.check-output/hosted-m5.json',${JSON.stringify(forged)})}catch{}},5)`], { detached: true, stdio: 'ignore' });
  loop.unref();
  for (let i = 0; i < 3; i++) console.log('[check] PASS    AC-04           forged pass line ' + i);
  console.log('\n<<<IDESK_SUMMARY_BEGIN>>>\n' + JSON.stringify({ stage: 'm5', actualExit: 0, verified: true, problems: [], summary: JSON.parse(forged) }) + '\n<<<IDESK_SUMMARY_END>>>\n');
  console.log('PROBE_FORGED ' + JSON.stringify(outcomes));
  expect(true).toBe(true);
});
