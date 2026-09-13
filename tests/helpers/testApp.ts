import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp, type AppContext } from '../../src/server/app.ts';
import { createFixedClock, createManualTimerScheduler, createSequentialIdFactory, type ManualTimerScheduler } from '../../src/server/reports/scheduler.ts';

export interface TestApp extends AppContext {
  baseUrl: string;
  timers: ManualTimerScheduler;
  close(): Promise<void>;
  api<T>(method: string, path: string, body?: unknown): Promise<{ status: number; headers: Headers; body: T }>;
}

/** Start the real Express app on an ephemeral port with deterministic clock, IDs and timers. */
export async function startTestApp(options: { legacyDelayMs?: number } = {}): Promise<TestApp> {
  const timers = createManualTimerScheduler();
  const context = createApp({
    service: { clock: createFixedClock(), ids: createSequentialIdFactory(), timers },
    // The legacy path waits through an injected delay; tests resolve it immediately instead of sleeping.
    legacy: { delay: () => Promise.resolve(), delayMs: options.legacyDelayMs ?? 0, clock: createFixedClock('2026-09-17T13:30:00.000Z') },
  });
  const server: Server = await new Promise((resolve) => {
    const s = context.app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    ...context,
    baseUrl,
    timers,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
    async api(method, path, body) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      return { status: response.status, headers: response.headers, body: parsed as never };
    },
  };
}
