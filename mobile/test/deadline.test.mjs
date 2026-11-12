import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withDeadline } from '../src/deadline.ts';
test('deadline rejects an operation that ignores abort', async () => {
  let signal;
  await assert.rejects(
    withDeadline(
      (s) => {
        signal = s;
        return new Promise(() => {});
      },
      15,
      'Timed out',
    ),
    /Timed out/,
  );
  assert.equal(signal.aborted, true);
});
test('deadline covers stalled response body reads', async () => {
  await assert.rejects(
    withDeadline(
      async () => {
        const response = await Promise.resolve({ json: () => new Promise(() => {}) });
        return response.json();
      },
      15,
      'Timed out',
    ),
    /Timed out/,
  );
});
test('cancelled startup can be followed by a fresh request', async () => {
  const parent = new AbortController();
  const pending = withDeadline(() => new Promise(() => {}), 1000, 'Cancelled', parent.signal);
  parent.abort();
  await assert.rejects(pending, /Cancelled/);
  assert.equal(await withDeadline(async () => 'profile', 1000, 'Timed out'), 'profile');
});
