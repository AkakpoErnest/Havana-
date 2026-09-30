import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPushState, CURRENT_KEY, PENDING_KEY } from '../src/push-state.ts';

// Fake phone storage + fake server with the real server's rule: cleanup deletes only an exact registration id.
function setup() {
  const disk = new Map();
  const store = {
    get: async (k) => disk.get(k) ?? null,
    set: async (k, v) => void disk.set(k, v),
    remove: async (k) => void disk.delete(k),
  };
  const server = new Map(); // token -> { account, registration }
  let ids = 0;
  let account = 'A';
  const gates = { register: null, unregister: null, fail: false };
  const api = {
    async register(token) {
      if (gates.register) await gates.register;
      const registration = `reg-${++ids}`;
      server.set(token, { account, registration });
      return registration;
    },
    async unregister({ token, registration }) {
      if (gates.unregister) await gates.unregister;
      if (gates.fail) throw new Error('offline');
      if (server.get(token)?.registration === registration) server.delete(token);
    },
  };
  const state = createPushState(store, api);
  return { state, disk, server, gates, setAccount: (a) => (account = a) };
}
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const TOKEN = 'ExponentPushToken[phone]';

test("Codex race: an old cleanup still in flight cannot remove the next session's registration", async () => {
  const { state, disk, server, gates, setAccount } = setup();
  await state.register(state.begin(), TOKEN); // A signed in
  const slow = deferred();
  gates.unregister = slow.promise; // A's cleanup will hang in the network
  await state.end(); // A logs out
  const cleanup = state.flush();
  setAccount('B');
  await state.register(state.begin(), TOKEN); // B signs in on the same phone while A's cleanup is pending
  slow.resolve();
  gates.unregister = null;
  await cleanup;
  await state.flush();
  assert.equal(server.get(TOKEN)?.account, 'B', "server still sends B's pushes");
  assert.equal(
    JSON.parse(disk.get(CURRENT_KEY)).registration,
    server.get(TOKEN).registration,
    'B stays stored',
  );
  assert.equal(disk.get(PENDING_KEY), undefined, "A's cleanup is done");
});

test('logout returns immediately even when the network hangs', async () => {
  const { state, gates } = setup();
  await state.register(state.begin(), TOKEN);
  gates.unregister = new Promise(() => {}); // never answers
  const finished = await Promise.race([
    state.end().then(() => 'done'),
    new Promise((r) => setTimeout(() => r('blocked'), 100)),
  ]);
  assert.equal(finished, 'done');
});

test('a failed cleanup stays queued and succeeds on a later retry', async () => {
  const { state, disk, server, gates } = setup();
  await state.register(state.begin(), TOKEN);
  gates.fail = true;
  await state.end();
  await state.flush();
  assert.equal(server.has(TOKEN), true, 'still registered while offline');
  assert.equal(JSON.parse(disk.get(PENDING_KEY)).length, 1, 'cleanup remembered');
  gates.fail = false;
  await state.flush(); // e.g. app returns to foreground / next launch
  assert.equal(server.has(TOKEN), false);
  assert.equal(disk.get(PENDING_KEY), undefined);
});

test('a registration that finishes after logout is cleaned up instead of kept', async () => {
  const { state, disk, server, gates } = setup();
  const slow = deferred();
  gates.register = slow.promise;
  const registering = state.register(state.begin(), TOKEN);
  await state.end(); // logged out before the server answered
  gates.register = null;
  slow.resolve();
  await registering;
  await state.flush();
  assert.equal(server.has(TOKEN), false, 'no pushes for the logged-out account');
  assert.equal(disk.get(CURRENT_KEY), undefined);
});
