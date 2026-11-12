import test from 'node:test';
import assert from 'node:assert/strict';
import { bestTimeWindow, bestTimeState, bestTimeNote } from '../src/best-time.js';
import { readText } from './helpers/read-text.js';
const app = readText('../src/app.js', import.meta.url);
const html = readText('../index.html', import.meta.url);
const css = readText('../src/styles.css', import.meta.url);

const start = Date.UTC(2026, 10, 12, 12);
const event = (key, duration = 3600000) => ({ kind:'fard', key, start:new Date(start), end:new Date(start+duration) });

test('best-time state has upcoming, active and passed states with countdown values only when relevant', () => {
  const window = { start:start+1000, end:start+2000 };
  assert.deepEqual(bestTimeState(window,start), { state:'upcoming', remaining:1000 });
  assert.deepEqual(bestTimeState(window,start+1000), { state:'active', remaining:1000 });
  assert.deepEqual(bestTimeState(window,start+2000), { state:'passed', remaining:null });
});

test('event-specific windows respect night fractions and label approximate reminders honestly', () => {
  const maghrib = new Date(start-3600000), fajr = new Date(start+9*3600000);
  const isha = bestTimeWindow(event('isha',4*3600000), { maghrib, fajr });
  assert.equal(isha.start, event('isha').start.getTime());
  assert.equal(isha.end, maghrib.getTime() + (fajr.getTime()-maghrib.getTime())/3);
  assert.equal(isha.approximate, false);
  assert.equal(bestTimeWindow(event('dhuhr'), {}), null);
  assert.match(bestTimeNote('dhuhr').source, /Sahih Muslim 615c, 618/);
  const maghribWindow = bestTimeWindow(event('maghrib'), {});
  assert.equal(maghribWindow.approximate, true);
  assert.match(maghribWindow.reason, /not a fixed religious duration/);
});

test('countdown click opens a separate page and the best-time panel disappears after the preferred period', () => {
  assert.match(html, /id="countdownView"/);
  assert.match(html, /id="bestTimeFocus"/);
  assert.match(app, /function openEventCountdown\(dataset\)/);
  assert.match(app, /bestTimeState\(best, now\)/);
  assert.match(app, /bestPanel\?\.classList\.toggle\('is-active'/);
  assert.match(css, /\.best-time-focus\.is-active/);
  assert.match(css, /\.prayer-eta\.is-best-time/);
});

test('prayer title details and countdown actions are independent', () => {
  assert.match(app, /data-prayer-title/);
  assert.match(app, /data-prayer-detail/);
  assert.match(app, /data-event-countdown/);
  assert.match(app, /openEventCountdown\(button\.dataset\)/);
});
