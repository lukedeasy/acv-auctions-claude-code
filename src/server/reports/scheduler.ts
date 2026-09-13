/**
 * Timer abstraction so the job service can be driven by real timers in the app
 * and by a manual/fake scheduler in tests. Tests never sleep to infer correctness.
 */
export interface TimerHandle {
  readonly id: number;
}

export interface TimerScheduler {
  set(callback: () => void, delayMs: number): TimerHandle;
  clear(handle: TimerHandle): void;
}

export function createTimerScheduler(): TimerScheduler {
  const active = new Map<number, NodeJS.Timeout>();
  let next = 1;
  return {
    set(callback, delayMs) {
      const id = next++;
      const timeout = setTimeout(() => {
        active.delete(id);
        callback();
      }, delayMs);
      active.set(id, timeout);
      return { id };
    },
    clear(handle) {
      const timeout = active.get(handle.id);
      if (timeout) {
        clearTimeout(timeout);
        active.delete(handle.id);
      }
    },
  };
}

/** Test scheduler: callbacks run only when a test advances virtual time explicitly. */
export interface ManualTimerScheduler extends TimerScheduler {
  advance(ms: number): void;
  pendingCount(): number;
}

export function createManualTimerScheduler(): ManualTimerScheduler {
  interface Entry {
    id: number;
    due: number;
    callback: () => void;
  }
  let now = 0;
  let next = 1;
  const entries: Entry[] = [];
  return {
    set(callback, delayMs) {
      const id = next++;
      entries.push({ id, due: now + delayMs, callback });
      return { id };
    },
    clear(handle) {
      const index = entries.findIndex((entry) => entry.id === handle.id);
      if (index >= 0) entries.splice(index, 1);
    },
    advance(ms) {
      const target = now + ms;
      // Run due callbacks in due order; callbacks may schedule more work.
      for (;;) {
        entries.sort((a, b) => a.due - b.due || a.id - b.id);
        const nextEntry = entries[0];
        if (!nextEntry || nextEntry.due > target) break;
        entries.shift();
        now = nextEntry.due;
        nextEntry.callback();
      }
      now = target;
    },
    pendingCount() {
      return entries.length;
    },
  };
}

export interface Clock {
  now(): Date;
}

export function createSystemClock(): Clock {
  return { now: () => new Date() };
}

/** Deterministic clock for tests: each call advances by one second so ordering stays visible. */
export function createFixedClock(startIso = '2026-09-17T13:00:00.000Z', stepMs = 1000): Clock & { current(): Date } {
  let current = new Date(startIso).getTime();
  return {
    now() {
      const value = new Date(current);
      current += stepMs;
      return value;
    },
    current() {
      return new Date(current);
    },
  };
}

export interface IdFactory {
  next(prefix: string): string;
}

export function createRandomIdFactory(): IdFactory {
  return {
    next(prefix) {
      return `${prefix}-${crypto.randomUUID()}`;
    },
  };
}

export function createSequentialIdFactory(): IdFactory {
  let counter = 0;
  return {
    next(prefix) {
      counter += 1;
      return `${prefix}-${String(counter).padStart(4, '0')}`;
    },
  };
}
