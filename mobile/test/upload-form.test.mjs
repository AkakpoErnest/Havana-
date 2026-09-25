import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoForm } from '../src/upload-form.ts';

test('browser photos are uploaded as file bytes in selection order', async () => {
  const form = await photoForm(
    ['data:image/jpeg;base64,/9j/2Q==', 'data:image/jpeg;base64,AQID'],
    'web',
  );
  const files = form.getAll('photos');
  assert.equal(files.length, 2);
  assert.equal(files[0].name, 'item-0.jpg');
  assert.equal(files[0].type, 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await files[0].arrayBuffer())], [255, 216, 255, 217]);
  assert.equal(files[1].name, 'item-1.jpg');
  assert.deepEqual([...new Uint8Array(await files[1].arrayBuffer())], [1, 2, 3]);
});

test('an unreadable browser photo stops publishing instead of uploading an error body', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Not found', { status: 404 }));
  await assert.rejects(photoForm(['blob:expired-photo'], 'web'), /select it again/);
});

test('native uploads pass local file URIs directly without trying to fetch them', async (t) => {
  const parts = [];
  t.mock.method(FormData.prototype, 'append', (...part) => parts.push(part));
  t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Native local files must not be fetched');
  });
  await photoForm(['file:///cache/photo.jpg'], 'android');
  assert.deepEqual(parts, [
    [
      'photos',
      {
        uri: 'file:///cache/photo.jpg',
        name: 'item-0.jpg',
        type: 'image/jpeg',
      },
    ],
  ]);
});
