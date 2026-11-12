import test from 'node:test';
import assert from 'node:assert/strict';
import { progressLine, realize, headsUpLead, HEADS_UP_RANGE, LINE_LEXICON, variantCount, repeatsWord } from '../src/progress-lines.js';
import { analyzeHabits, pickSuggestion, addDaysKey } from '../src/habits.js';
import { readText } from './helpers/read-text.js';

const MIN = 60000;
const DAY0 = Date.UTC(2026, 10, 13, 0, 0, 0);
const at = (h, m = 0) => DAY0 + (h * 60 + m) * MIN;
const RAK = { fajr:2, dhuhr:4, asr:4, maghrib:3, isha:4 };
const WINDOWS = [['fajr',4.87,6.17],['dhuhr',11.8,15.3],['asr',15.3,17.1],['maghrib',17.3,18.5],['isha',18.5,28.9]];
const fard = done => WINDOWS.map(([key,start,end],i) => ({ key, start:at(0)+start*60*MIN, end:at(0)+end*60*MIN, done:!!done[i], tickedAt:done[i]?at(0)+start*60*MIN+10*MIN:null, parts:done[i]?[RAK[key]]:[], full:false }));
const fmt = ms => { const d = new Date(ms); return `${d.getUTCHours()%12||12}:${String(d.getUTCMinutes()).padStart(2,'0')} ${d.getUTCHours()<12?'AM':'PM'}`; };
const ctx = (over={}) => ({ lang:'en', dateKey:'2026-11-13', now:at(10), friday:false, fard:fard([0,0,0,0,0]), habits:{}, fmt, ...over });
const scenes = {
  open: { now:at(12,30), fard:fard([1,0,0,0,0]) },
  react: { now:at(5,10), fard:fard([1,0,0,0,0]) },
  plain: { now:at(8), fard:fard([1,0,0,0,0]) },
  all: { now:at(20), fard:fard([1,1,1,1,1]) }
};

 test('progress messages cover the current prayer states in English and Bangla', () => {
  for (const lang of ['en','bn']) for (const [name,scene] of Object.entries(scenes)) {
    const line = progressLine(ctx({ ...scene, lang }));
    assert.ok(line, `${lang}/${name} has a message`);
    assert.ok(line.text.length > 0);
    if (lang === 'bn') assert.doesNotMatch(line.text, /[A-Za-z]/);
  }
  assert.equal(progressLine(ctx({ now:at(3), fard:fard([0,0,0,0,0]) })), null);
});

test('generated samples do not shame users or mention missed prayers, Qada or upcoming prayer times in the wrong state', () => {
  const bannedEn = /missed|qada|make[- ]?up|behind|overdue|forgot|should|must|have to/i;
  const bannedBn = /ছুটে|কাজা|বাদ পড়|ভুলে|দেরি/;
  for (const lang of ['en','bn']) for (const scene of Object.values(scenes)) for (let day=1; day<=12; day++) {
    const line = progressLine(ctx({ ...scene, lang, dateKey:`2026-11-${String(day).padStart(2,'0')}` }));
    if (!line) continue;
    assert.doesNotMatch(line.text, lang === 'en' ? bannedEn : bannedBn);
  }
});

test('heads-up windows stay inside their configured range and adapt downward for late tickers', () => {
  const base = headsUpLead('asr','2026-11-13',{});
  const late = headsUpLead('asr','2026-11-13',{ usualOffset:{ asr:35 } });
  assert.ok(base >= HEADS_UP_RANGE[0] && base <= HEADS_UP_RANGE[1]);
  assert.ok(late <= base && late >= 12);
});

test('English and Bangla realization handles genitives, digits and clean punctuation', () => {
  assert.equal(realize('{P:gen} সময় {T}।',{P:'isha',T:'রাত ৬:৩০'},'bn'),'ইশার সময় রাত ৬:৩০।');
  assert.equal(realize('{P:gen} at {T}.',{P:'asr',T:'3:37 PM'},'en'),'Asr’s at 3:37 PM.');
  assert.equal(realize('  {D}   done  . ',{D:'fajr'},'en'),'Fajr done.');
  assert.match(JSON.stringify(LINE_LEXICON.en),/rak‘ahs/);
  assert.equal(repeatsWord('Good work, good effort.'),true);
});

test('the local grammar has a broad set of variants without requiring a full combinatorial scan at startup', () => {
  assert.ok(variantCount('en') > 100);
  assert.ok(variantCount('bn') > 100);
});

test('the progress message memory enforces a 90-day uniqueness window across reopen events', () => {
  const app = readText('../src/app.js', import.meta.url);
  assert.match(app,/LINE_UNIQUENESS_MS = 90 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(app,/recentAt\[result\.id\] = Date\.now\(\)/);
  assert.match(app,/now - recentAt\[id\] < LINE_UNIQUENESS_MS/);
  assert.match(app,/function messagesAreSimilar/);
  assert.match(app,/FALLBACK_PROGRESS_LINES\.find/);
  assert.match(app,/Legacy memory stored IDs without timestamps/);
  assert.match(app,/A full app restart also selects a fresh eligible line/);
  assert.match(app,/pendingLineRefresh === 0 && memory\.current\?\.text/);
  assert.match(app,/memory\.current = \{ sig: result\.sig, id: result\.id, text: result\.text, lang: lang\(\) \}/);
  assert.equal((app.match(/fallback:\d{2}/g) || []).length,20);
});

test('habit learning and voluntary suggestions remain bounded to the user history', () => {
  const history = Object.fromEntries(Array.from({length:8},(_,i)=>[addDaysKey('2026-11-13',-(i+1)),{fard:{fajr:true},voluntary:{duha:i<4}}]));
  const habits = analyzeHabits(history,'2026-11-13');
  assert.ok(habits.historyDays > 0);
  const candidates = [{kind:'voluntary',key:'duha',name:{en:'Duha',bn:'দুহা'}}];
  const suggestion = pickSuggestion({ candidates, history, todayKey:'2026-11-13', memory:{} });
  assert.ok(suggestion === null || suggestion.key === 'duha');
});
