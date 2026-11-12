import test from 'node:test';
import assert from 'node:assert/strict';
import { readText } from './helpers/read-text.js';
const html = readText('../index.html', import.meta.url);
const app = readText('../src/app.js', import.meta.url);
const css = readText('../src/styles.css', import.meta.url);

test('Home prayer categories are the only prayer-card groups and have distinct identities', () => {
  for (const id of ['obligatoryPrayerSection', 'dailyVoluntarySection', 'situationalVoluntarySection', 'specialDayPrayerSection']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(css, /\.prayer-card\.category-fard/);
  assert.match(css, /\.daily-voluntary-card/);
  assert.match(css, /\.situational-prayer-card/);
  assert.match(css, /\.special-day-prayer-card/);
  assert.match(app, /const situational = \['tahiyyatul_masjid', 'istikhara', 'tawbah'\]/);
  assert.match(app, /DATE_SPECIFIC_VOLUNTARY\.includes\(event\.key\)/);
});

test('the Islamic history cards and old Seerah tab are absent from the Home document', () => {
  for (const token of ['onThisDaySection', 'propheticDaySection', 'quranRevelationSection', 'sunnahSeerahTab', 'hijriPrayerEventCard']) assert.doesNotMatch(html, new RegExp(token, 'i'));
});
