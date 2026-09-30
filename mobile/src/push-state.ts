/** Push registration bookkeeping, free of native modules so the SEC-002 races can be unit-tested.
 *
 * - `current` is the active session's registration; only that session's own logout moves it.
 * - `pending` holds cleanups from ended sessions. Cleaning up never touches `current`, and the server
 *   only deletes an exact registration id, so a delayed old cleanup can't remove a newer registration.
 * - Logout (`end`) only touches local storage and returns; network cleanup runs in the background (`flush`). */
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
  let flushing: Promise<void> | null = null;

  const parse = <T>(raw: string | null, fallback: T): T => {
    try {
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const readPending = async () => parse<Registration[]>(await store.get(PENDING_KEY), []);
  const addPending = async (r: Registration) => {
    const list = await readPending();
    if (!list.some((p) => p.registration === r.registration))
      await store.set(PENDING_KEY, JSON.stringify([...list, r]));
  };

  /** Sends queued cleanups; failures stay queued for the next attempt. Concurrent calls share one run. */
  function flush(): Promise<void> {
    if (flushing) return flushing;
    flushing = (async () => {
      const attempted = await readPending();
      const done: string[] = [];
      for (const r of attempted) {
        try {
          await api.unregister(r);
          done.push(r.registration);
        } catch {
          // Offline or server error: retried on the next flush.
        }
      }
      // Re-read: logouts during the flush may have queued more.
      const latest = await readPending();
      const left = latest.filter((p) => !done.includes(p.registration));
      if (left.length) await store.set(PENDING_KEY, JSON.stringify(left));
      else await store.remove(PENDING_KEY);
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  return {
    /** A signed-in session started; returns its generation for `register`. */
    begin: () => ++generation,
    /** Registers `token` for session `gen`. If that session ended meanwhile, the registration is queued for cleanup instead. */
    async register(gen: number, token: string) {
      const r: Registration = { token, registration: await api.register(token) };
      if (gen !== generation) {
        await addPending(r);
        void flush();
        return;
      }
      await store.set(CURRENT_KEY, JSON.stringify(r));
      void flush();
    },
    /** Logout / session expiry / account deletion: local-only and quick; server cleanup continues in the background. */
    async end() {
      generation++;
      const current = parse<Registration | null>(await store.get(CURRENT_KEY), null);
      await store.remove(CURRENT_KEY);
      if (current) await addPending(current);
      void flush();
    },
    flush,
  };
}
