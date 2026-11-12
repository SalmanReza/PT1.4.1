import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('removed historical and Seerah feature bundles are not shipped', () => {
  for (const file of ['src/daily-content.js', 'src/daily-reflections.js']) assert.equal(fs.existsSync(path.join(root, file)), false);
  const app = read('src/app.js'), html = read('index.html'), content = read('src/islamic-content.js');
  for (const removed of ['Sunnah and Seerah', 'Prophetic Day', 'On This Day in Islamic History', 'Qur’anic Revelation']) {
    assert.doesNotMatch(html, new RegExp(removed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  assert.doesNotMatch(content, /ISLAMIC_HISTORY_EVENTS|HIJRI_DAY_NOTES|QURAN_REVELATION_RECORDS/);
});
