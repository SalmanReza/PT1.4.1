import test from 'node:test';
import assert from 'node:assert/strict';
import { PRAYER_GUIDANCE } from '../src/islamic-content.js';
import { evidenceFor } from '../src/prayer-evidence.js';
import { readText } from './helpers/read-text.js';
const app = readText('../src/app.js', import.meta.url);

test('prayer guidance remains available while historical databases are excluded', () => {
  for (const key of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'duha', 'witr', 'tarawih', 'eid_prayer', 'istikhara']) assert.ok(PRAYER_GUIDANCE[key], `${key} guidance exists`);
  assert.equal('ISLAMIC_HISTORY_EVENTS' in PRAYER_GUIDANCE, false);
  assert.equal('QURAN_REVELATION_RECORDS' in PRAYER_GUIDANCE, false);
});

test('prayer card detail presents Qur’an/Hadith references and profile-aware rakah information', () => {
  assert.ok(evidenceFor('fajr', 'hanafi').items.length > 0);
  assert.match(app, /function referenceCardHtml\(key, titleText, date = selectedDate\)/);
  assert.match(app, /function rakahInfoForProfile\(key, guidance, date = selectedDate\)/);
  assert.match(app, /No separate grading is included in this local reference/);
  assert.match(app, /evidenceFor\(guidanceKey, school, lang\(\)\)/);
});
