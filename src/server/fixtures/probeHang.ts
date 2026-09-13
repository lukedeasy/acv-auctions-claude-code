// [PROBE] Isolation probe: a synchronous loop that never yields. The trusted acceptance test imports the fixture
// loader, so vitest's own per-test timer never fires and the check process runs until the hosted wall clock kills it.
export function hangForever(): never {
  console.log('PROBE_TIMEOUT synchronous hang started ' + new Date().toISOString());
  for (;;) {
    // never returns
  }
}
