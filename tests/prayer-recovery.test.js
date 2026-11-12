import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryEligible, recoverablePrayerEvents, mergeBackupState, validateBackup } from '../src/prayer-recovery.js';

const date = new Date(2026, 10, 12);
const day2 = new Date(2026, 10, 13);
const day3 = new Date(2026, 10, 14);
const at = (d,h) => new Date(d.getFullYear(),d.getMonth(),d.getDate(),h);
const ev = (key,d,h) => ({kind:'fard',key,date:new Date(d.getFullYear(),d.getMonth(),d.getDate()),start:at(d,h),end:at(d,h+1)});
const events = [
  ev('fajr',date,5),ev('dhuhr',date,12),ev('asr',date,15),ev('maghrib',date,18),ev('isha',date,20),
  ev('fajr',day2,5),ev('dhuhr',day2,12),ev('asr',day2,15),ev('maghrib',day2,18),ev('isha',day2,20),
  ev('fajr',day3,5),ev('dhuhr',day3,12),ev('asr',day3,15)
];
const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

test('recovery requires the two immediately preceding chronological Fard events to be complete', () => {
  const records = { [key(day2)]: { fard:{ fajr:true, dhuhr:true } } };
  assert.equal(recoveryEligible(events,records,at(day2,13).getTime()),true);
  records[key(day2)].fard.dhuhr = false;
  assert.equal(recoveryEligible(events,records,at(day2,13).getTime()),false);
});

test('only previously locked, unrecorded Fard events are offered for recovery', () => {
  const records = { [key(date)]: { fard:{ fajr:true } } };
  const voluntary = { kind:'voluntary', key:'duha', date:new Date(date.getFullYear(),date.getMonth(),date.getDate()), start:at(date,9), end:at(date,10) };
  const candidates = recoverablePrayerEvents([...events, voluntary],records,at(day2,13).getTime());
  assert.ok(candidates.some(item => item.key === 'dhuhr' && key(item.date) === key(date)));
  assert.ok(!candidates.some(item => item.key === 'fajr' && key(item.date) === key(date)));
  assert.ok(!candidates.some(item => item.key === 'isha' && key(item.date) === key(day2)));
  assert.ok(candidates.some(item => item.kind === 'voluntary' && item.key === 'duha')); 
});

test('backup merge preserves current conflicting values and imports non-conflicting values', () => {
  const result = mergeBackupState({ settings:{theme:'dark',clock:'24'}, history:{a:{fard:{fajr:true}}} }, { settings:{theme:'light',clock:'24'}, history:{a:{fard:{dhuhr:true}},b:{fard:{asr:true}}} });
  assert.equal(result.data.settings.theme,'dark');
  assert.equal(result.data.history.a.fard.dhuhr,true);
  assert.equal(result.data.history.b.fard.asr,true);
  assert.deepEqual(result.conflicts,['settings.theme']);
});

test('backup validation rejects malformed payloads and accepts a valid versioned JSON envelope', () => {
  assert.equal(validateBackup(null).ok,false);
  assert.equal(validateBackup({version:1,data:{}}).ok,false);
  assert.deepEqual(validateBackup({version:1,appVersion:'1.4.0',data:{history:{}}}),{ok:true,data:{history:{}},appVersion:'1.4.0'});
});
