/** Push registration bookkeeping, free of native modules so the SEC-002 races can be unit-tested.
 *
 * - `current` is the active session's registration; only that session's own logout moves it.
 * - `pending` holds cleanups from ended sessions. Cleaning up never touches `current`, and the server
 *   only deletes an exact registration id, so a delayed old cleanup can't remove a newer registration.
 * - Logout (`end`) only touches local storage and returns; network cleanup runs in the background (`flush`).
 * - A registration is always journaled into `pending` before `current` is removed or replaced, so a failed or
 *   interrupted storage write leaves it in `current`, and `recover` (signed-out launch) queues it from there. */
export type Registration = { token: string; registration: string };
export type PushStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};
export type PushApi = {
  /** Registers the token for the signed-in account; resolves to the server's registration id. */
  register(token: string): Promise<string>;
  /** Removes exactly this registration (works without a session). */
  unregister(registration: Registration): Promise<void>;
};

export const CURRENT_KEY = 'havana.push.current';
export const PENDING_KEY = 'havana.push.pending';

export function createPushState(store: PushStore, api: PushApi) {
  let generation = 0;
  let active = false; // a signed-in session is running (between begin and end)
  let flushing: Promise<void> | null = null;
  let rerun = false;
  // Every local read/modify/write runs one at a time (network calls stay outside), so a slow store
  // can't interleave: e.g. logout reading `current` while a registration is still writing it.
  let queue: Promise<unknown> = Promise.resolve();
  const locked = <T>(step: () => Promise<T>): Promise<T> => {
    const run = queue.then(step, step);
    queue = run.catch(() => undefined);
    return run;
  };

  const parse = <T>(raw: string | null, fallback: T): T => {
    try {
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  // Only call these inside `locked`.
  const readPending = async () => parse<Registration[]>(await store.get(PENDING_KEY), []);
  const addPending = async (r: Registration) => {
    const list = await readPending();
    if (!list.some((p) => p.registration === r.registration))
      await store.set(PENDING_KEY, JSON.stringify([...list, r]));
  };

  // Journal first: if saving the cleanup fails, `current` is kept and `recover` retries from it.
  const retire = async () => {
    const current = parse<Registration | null>(await store.get(CURRENT_KEY), null);
    if (current) await addPending(current);
    await store.remove(CURRENT_KEY);
  };

  /** Sends queued cleanups; failures stay queued for the next attempt. A request that arrives while a run is
   *  in progress makes that run do one more pass, so cleanups queued mid-run are never skipped. */
  function flush(): Promise<void> {
    if (flushing) {
      rerun = true;
      return flushing;
    }
    flushing = (async () => {
      do {
        rerun = false;
        const attempted = await locked(readPending);
        const done: string[] = [];
        for (const r of attempted) {
          try {
            await api.unregister(r);
            done.push(r.registration);
          } catch {
            // Offline or server error: retried on the next flush.
          }
        }
        // Reconcile under the lock: anything queued during the network calls is kept.
        await locked(async () => {
          const left = (await readPending()).filter((p) => !done.includes(p.registration));
          if (left.length) await store.set(PENDING_KEY, JSON.stringify(left));
          else await store.remove(PENDING_KEY);
        });
      } while (rerun);
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  return {
    /** A signed-in session started; returns its generation for `register`. */
    begin: () => {
      active = true;
      return ++generation;
    },
    /** Registers `token` for session `gen`. If that session ended meanwhile, the registration is queued for cleanup instead. */
    async register(gen: number, token: string) {
      const r: Registration = { token, registration: await api.register(token) };
      // Checked inside the lock, so it can't race with end() reading/clearing `current`.
      await locked(async () => {
        if (gen !== generation) await addPending(r);
        else {
          // A leftover from a session whose logout couldn't save its cleanup: queue it before replacing it.
          const old = parse<Registration | null>(await store.get(CURRENT_KEY), null);
          if (old && old.registration !== r.registration) await addPending(old);
          await store.set(CURRENT_KEY, JSON.stringify(r));
        }
      });
      void flush();
    },
    /** Logout / session expiry / account deletion: local-only and quick; server cleanup continues in the background. */
    async end() {
      generation++; // synchronous: any registration not yet in the lock will see the session ended
      active = false;
      await locked(retire);
      void flush();
    },
    /** Signed-out launch: queue any registration a failed logout left in `current`, then send cleanups. */
    async recover() {
      await locked(async () => {
        if (!active) await retire();
      });
      await flush();
    },
    flush,
  };
}
