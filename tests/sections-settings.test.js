import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCards, sanitizeSections, ALL_CARD_KEYS } from '../src/sections.js';
import { readText } from './helpers/read-text.js';
const html = readText('../index.html', import.meta.url);

test('only the four approved prayer-card categories can be toggled', () => {
  assert.deepEqual(ALL_CARD_KEYS, ['obligatory', 'daily', 'situational', 'seasonal']);
  assert.deepEqual(sanitizeCards({ daily: false, seasonal: false }), { obligatory: true, daily: false, situational: true, seasonal: false });
  assert.deepEqual(sanitizeSections({ descriptions: false, sunnah: true }), {});
});

test('settings no longer offer removed Seerah/history card controls', () => {
  assert.match(html, /data-card="obligatory"/);
  assert.match(html, /data-card="daily"/);
  assert.match(html, /data-card="situational"/);
  assert.match(html, /data-card="seasonal"/);
  assert.doesNotMatch(html, /showSunnahToggle|showOnThisDayToggle|data-card="onThisDay"|data-card="quranRevelation"/);
});
