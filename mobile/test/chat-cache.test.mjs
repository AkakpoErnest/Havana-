import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLatest, mergeHistory } from '../src/chat-cache.ts';

const message = (id, createdAt, offerStatus = null) => ({
  id,
  createdAt,
  senderId: 'neighbour',
  type: offerStatus ? 'OFFER' : 'TEXT',
  text: 'Hello',
  amount: offerStatus ? 100 : null,
  offerStatus,
});
const page = (messages, hasMore = false, cursor = '2026-09-23T12:00:05Z') => ({
  conversation: { id: 'chat', item: { status: 'LIVE' } },
  messages,
  hasMore,
  cursor,
});

test('a rolling poll retains already-loaded messages and replaces changed offers', () => {
  const previous = page(
    [message('old', '2026-09-23T10:00:00Z'), message('offer', '2026-09-23T11:00:00Z', 'PENDING')],
    true,
  );
  const incoming = page([
    message('offer', '2026-09-23T11:00:00Z', 'ACCEPTED'),
    message('new', '2026-09-23T12:00:00Z'),
  ]);
  incoming.conversation.item.status = 'RESERVED';
  const result = mergeLatest(previous, incoming);
  assert.deepEqual(
    result.messages.map((m) => m.id),
    ['old', 'offer', 'new'],
  );
  assert.equal(result.messages[1].offerStatus, 'ACCEPTED');
  assert.equal(result.conversation.item.status, 'RESERVED');
  assert.equal(result.hasMore, true);
  assert.equal(result.cursor, '2026-09-23T12:00:05Z');
});

test('loading the final history page preserves fresh offer state and closes pagination', () => {
  const current = page([message('offer', '2026-09-23T11:00:00Z', 'DECLINED')], true);
  const older = page([
    message('first', '2026-09-23T09:00:00Z'),
    message('offer', '2026-09-23T11:00:00Z', 'PENDING'),
  ]);
  const result = mergeHistory(current, older);
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[1].offerStatus, 'DECLINED');
  assert.equal(result.hasMore, false);
  assert.equal(result.cursor, '2026-09-23T12:00:05Z');
  assert.equal(
    mergeLatest(result, page([message('next', '2026-09-23T12:00:00Z')], true)).hasMore,
    false,
  );
});

test('the first response supplies pagination and repeated responses stay deduplicated', () => {
  const incoming = page(
    [message('b', '2026-09-23T09:00:00Z'), message('a', '2026-09-23T09:00:00Z')],
    true,
  );
  const first = mergeLatest(undefined, incoming);
  assert.equal(first.hasMore, true);
  assert.deepEqual(
    mergeLatest(first, incoming).messages.map((m) => m.id),
    ['a', 'b'],
  );
});

test('saved ratings follow fresh polls and survive loading older messages', () => {
  const previous = page([message('recent', '2026-09-25T12:00:00Z')]);
  previous.conversation.myRating = null;
  const fresh = page([]);
  fresh.conversation.myRating = 4;
  const current = mergeLatest(previous, fresh);
  assert.equal(current.conversation.myRating, 4);
  const older = page([message('older', '2026-09-24T12:00:00Z')]);
  older.conversation.myRating = null;
  assert.equal(mergeHistory(current, older).conversation.myRating, 4);
});
