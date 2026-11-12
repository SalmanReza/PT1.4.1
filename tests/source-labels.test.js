import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLabel } from '../src/source-label.js';
import { readText } from './helpers/read-text.js';
const app = readText('../src/app.js', import.meta.url);

test('source labels and progress memory remain available after removing historical content', () => {
  assert.equal(sourceLabel('B'), 'Bukhari');
  assert.equal(sourceLabel('M', 'bn'), 'মুসলিম');
  assert.equal(sourceLabel('Q2:255'), 'Qur’an 2:255');
  assert.equal(sourceLabel('Q2:255', 'bn'), 'কুরআন ২:২৫৫');
  assert.match(app, /LINE_UNIQUENESS_MS = 90 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(app, /recentAt\[result\.id\] = Date\.now\(\)/);
});
