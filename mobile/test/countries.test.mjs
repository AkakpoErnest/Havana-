import test from 'node:test';
import assert from 'node:assert/strict';
import { guessCountry, money } from '../src/countries.ts';

test('prices use the listing currency', () => {
  assert.equal(money(1200), 'GH₵1,200');
  assert.equal(money(1200, 'GHS'), 'GH₵1,200');
  assert.equal(money(25000, 'NGN'), '₦25,000');
  assert.equal(money(3500, 'KES'), 'KSh 3,500');
  assert.equal(money(null, 'KES'), 'KSh 0');
});

test('login starts on the phone region when Havana serves it', () => {
  assert.equal(guessCountry('en-KE'), 'KE');
  assert.equal(guessCountry('sw_KE'), 'KE');
  assert.equal(guessCountry('en-NG'), 'NG');
  assert.equal(guessCountry('en-GH'), 'GH');
  assert.equal(guessCountry('en-US'), 'GH');
  assert.equal(guessCountry('en'), 'GH');
});
