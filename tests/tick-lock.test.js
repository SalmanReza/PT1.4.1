import test from 'node:test';
import assert from 'node:assert/strict';
import { lockInstant, isLockedAt, dayIsLocked, nextWatermark, lockTip, sealRecord } from '../src/tick-lock.js';

const day = new Date(2026, 10, 12);
const at = (d, hour) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0);
const event = (kind, key, date, hour) => ({ kind, key, date: new Date(date.getFullYear(), date.getMonth(), date.getDate()), start: at(date, hour), end: at(date, hour + 1) });
const d1 = day, d2 = new Date(2026, 10, 13), d3 = new Date(2026, 10, 14);
const events = [
  event('fard','fajr',d1,5), event('fard','dhuhr',d1,12), event('fard','asr',d1,15), event('fard','maghrib',d1,18), event('fard','isha',d1,20),
  event('fard','fajr',d2,5), event('fard','dhuhr',d2,12), event('fard','asr',d2,15), event('fard','maghrib',d2,18), event('fard','isha',d2,20),
  event('fard','fajr',d3,5), event('fard','dhuhr',d3,12), event('fard','asr',d3,15)
];

test('Fard records lock at the start of the second following Fard period', () => {
  const expected = { fajr: at(d1,15), dhuhr: at(d1,18), asr: at(d1,20), maghrib: at(d2,5), isha: at(d2,12) };
  for (const [key, boundary] of Object.entries(expected)) {
    const lock = lockInstant({ kind:'fard', key, date:d1 }, events);
    assert.equal(lock.at, boundary.getTime(), `${key} boundary`);
  }
});

test('voluntary event uses its chronological start and second following Fard boundary', () => {
  const duha = event('voluntary','duha',d1,9);
  const awwabin = event('voluntary','awwabin',d1,18);
  const qiyam = event('voluntary','qiyam',d1,21);
  const timeline = [...events, duha, awwabin, qiyam].sort((a,b)=>a.start-b.start);
  assert.equal(lockInstant({kind:'voluntary',key:'duha',date:d1},timeline).at, at(d1,15).getTime());
  assert.equal(lockInstant({kind:'voluntary',key:'awwabin',date:d1},timeline).at, at(d2,5).getTime());
  assert.equal(lockInstant({kind:'voluntary',key:'qiyam',date:d1},timeline).at, at(d2,12).getTime());
});

test('attached Sunnah/Nafl follows its associated Fard lock and locks at the exact boundary', () => {
  const item = { kind:'sunnah', key:'dhuhr_before', prayer:'dhuhr', date:d1 };
  const lock = lockInstant(item, events);
  assert.equal(lock.at, at(d1,18).getTime());
  assert.equal(isLockedAt(item, events, null, at(d1,17)), false);
  assert.equal(isLockedAt(item, events, null, at(d1,18)), true);
});

test('old prayer days are not sealed at Fajr; the watermark waits two days', () => {
  const add = (key, n) => { const d = new Date(`${key}T00:00:00`); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  assert.equal(dayIsLocked('2026-11-12','2026-11-12',null), false, 'yesterday remains open through its second following Fard period');
  assert.equal(dayIsLocked('2026-11-11','2026-11-12',null), true);
  assert.equal(nextWatermark(null,'2026-11-13',add), '2026-11-12');
});

test('sealRecord persists a lock only after the second following Fard starts', () => {
  const record = { fard:{ dhuhr:true } };
  const itemsFor = () => ({ item:{kind:'fard',key:'dhuhr',date:d1}, events, nextFajr:null });
  assert.equal(sealRecord(record,itemsFor,at(d1,17)),false);
  assert.equal(sealRecord(record,itemsFor,at(d1,18)),true);
  assert.equal(record.locked['fard:dhuhr'],1);
});

test('lock message names the second following Fard boundary', () => {
  assert.equal(lockTip('Maghrib'), 'Locked after Maghrib began');
  assert.match(lockTip(null), /second following Fard period/);
});
