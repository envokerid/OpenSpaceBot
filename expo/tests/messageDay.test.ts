import assert from 'node:assert/strict';
import { test } from 'node:test';
import { messageDay } from '../../shared/message-day.ts';

test('home message labels use calendar days and disambiguate older dates', () => {
  const now = new Date(2026, 8, 24, 0, 5).getTime();
  assert.equal(messageDay(now, now, 'en-US'), 'Today');
  assert.equal(messageDay(new Date(2026, 8, 23, 23, 59).getTime(), now, 'en-US'), 'Yesterday');
  assert.equal(messageDay(new Date(2026, 8, 22, 12).getTime(), now, 'en-US'), 'Tuesday');
  assert.equal(messageDay(new Date(2026, 8, 17, 12).getTime(), now, 'en-US'), 'Sep 17');
  assert.equal(messageDay(new Date(2025, 8, 24, 12).getTime(), now, 'en-US'), 'Sep 24, 2025');
  assert.equal(messageDay(NaN, now), '');
});

test('yesterday survives short and long daylight-saving days', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Europe/Vienna';
  try {
    assert.equal(messageDay(new Date(2026, 2, 28, 0, 1).getTime(), new Date(2026, 2, 29, 23, 59).getTime()), 'Yesterday');
    assert.equal(messageDay(new Date(2026, 9, 24, 0, 1).getTime(), new Date(2026, 9, 25, 23, 59).getTime()), 'Yesterday');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
