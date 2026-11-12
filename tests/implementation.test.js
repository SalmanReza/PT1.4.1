import test from 'node:test';
import assert from 'node:assert/strict';
import { readText } from './helpers/read-text.js';
const app = readText('../src/app.js', import.meta.url);
const html = readText('../index.html', import.meta.url);
const css = readText('../src/styles.css', import.meta.url);

test('Completed Today sits between Next Prayer and Progress Cycle and contains no countdown controls', () => {
  const next = html.indexOf('id="nextName"');
  const completed = html.indexOf('id="completedTodaySection"');
  const progress = html.indexOf('class="progress-panel');
  assert.ok(next >= 0 && completed > next && progress > completed);
  assert.match(app, /function renderCompletedToday\(\)/);
  assert.match(app, /data-completed-undo/);
  assert.match(app, /data-completed-title/);
  assert.doesNotMatch(app.slice(app.indexOf('function renderCompletedToday'), app.indexOf('function renderFard')), /countdown|data-event-countdown/);
});

test('main clock opens a full temporal view with solar, lunar and prayer timing data', () => {
  assert.match(html, /id="liveClockOpen"/);
  assert.match(html, /id="temporalView"/);
  assert.match(app, /function openTemporalView\(\)/);
  assert.match(app, /function renderTemporalView\(\)/);
  assert.match(app, /function updateTemporalLive\(\)/);
  assert.match(app, /function updateCountdownWidgets\(\)/);
  assert.match(app, /temporalProhibited/);
  assert.match(html, /id="skyTimes"/);
  assert.match(app, /moonPosition\(now, state\.lat, state\.lon\)/);
});

test('event transitions are grouped, deduplicated and include the next prayer countdown', () => {
  assert.match(app, /const starting = \[\], ending = \[\], transitionIds = \[\]/);
  assert.match(app, /transition:\$\{dateKey\(event\.date\)\}:\$\{event\.key\}:\$\{type\}/);
  assert.match(app, /Next prayer: \$\{nextText\}/);
  assert.match(app, /state\.transitionSent\[id\] = now/);
});

test('recovery requires an explicit confirmation and a three-second press-and-hold', () => {
  assert.match(html, /id="recoveryHoldButton"/);
  assert.match(app, /function performPrayerRecovery\(\)/);
  assert.match(app, /I performed this prayer but forgot to record it/);
  assert.match(app, /setTimeout\(\(\) => \{ cancelRecoveryHold\(\); performPrayerRecovery\(\); \}, 3000\)/);
});

test('backup import validates JSON, creates a safety copy and supports Replace/Merge', () => {
  assert.match(html, /id="backupMode"/);
  assert.match(app, /function importBackupFile\(\)/);
  assert.match(app, /prayer-times-safety-backup/);
  assert.match(app, /mergeBackupState\(state, compatible\)/);
  assert.match(app, /Replace local data/);
});

test('Observatory path and colours are responsive but the prohibited-time band is spatially separate', () => {
  assert.match(app, /function altitudePassPath/);
  assert.match(app, /const bandY = Hh \* \.79/);
  assert.match(app, /lastSkyPathKey/);
  assert.match(app, /now >= event\.start && now < event\.end/);
  assert.match(app, /classList\.toggle\('is-best-time'/);
  assert.match(app, /function subPrayerAvailability/);
  assert.match(app, /slot\?\.position === 'before' && fardDone/);
  assert.match(app, /slot\?\.position === 'after' && !fardDone/);
  assert.match(app, /function eventHasActionableComponents/);
  assert.match(app, /part\.slot\.position === 'after'/);
  assert.match(app, /if \(kind === 'fard' && !shiaMode\(\)\)/);
  assert.match(app, /starSize = `\$\{W\}x\$\{Hh\}`/);
  assert.match(css, /\.sky-panel\[data-mode="night"\] \.sky-stars/);
});
