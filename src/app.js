import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TrayIcon } from '@tauri-apps/api/tray';
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from '@tauri-apps/plugin-autostart';
import { calculatePrayerTimes, formatTime, dateKey, jafariMidnight, CALCULATION_METHODS, SCHOOLS, HIGH_LATITUDE_RULES, DEFAULT_PROFILE, sanitizeProfile, presetForSchool, isShiaProfile } from './prayer-engine.js';
import { parseCoordinates, isGoogleMapsUrl } from './location.js';
import { PRAYER_GUIDANCE } from './islamic-content.js';
import { weekStart, sevenCycleDates, weeklyFardTally, isFridayDhuhr, FRIDAY_DHUHR_LABEL, WEEK_DAY_LABELS, FRIDAY } from './weekly-cycle.js';
import { shortcutFor, pageScrollDistance } from './keyboard.js';
import { figureSvg, figureChanges, progressSummary } from './progress-figure.js';
import { slotLabel, slotShortLabel, fardPartLabel, prayerParts, FARD_RAKAHS, findSlot, layerState, splitVoluntary, isSeasonal } from './prayer-layers.js';
import { playCues, soundCues, sanitizeTickStyle, DEFAULT_TICK_STYLE } from './sound.js';
import { trayTooltipText } from './tray-tooltip.js';
import { activeProhibition, PROHIBITED_LABELS, SUNRISE_PROHIBITED_MINUTES, SUNSET_PROHIBITED_MINUTES } from './forbidden-times.js';
import { parseReminderMinutes, sanitizeReminderMap, isReminderDue, preReminderFireAt, PRE_REMINDER_MAX } from './reminder-schedule.js';
import { APP_VERSION, copyrightText } from './branding.js';
import { UI_FONTS, DEFAULT_UI_FONT, sanitizeUiFont, uiFontStack, uiFontLabel } from './ui-fonts.js';
import { dayStatus } from './day-status.js';
import { progressLine, VOLUNTARY_HEADS_UP_MINUTES } from './progress-lines.js';
import { analyzeHabits, pickSuggestion, addDaysKey } from './habits.js';
import { lockInstant, dayIsLocked, nextWatermark, sealRecord, lockKey, lockTip } from './tick-lock.js';
import { bestTimeWindow, bestTimeState, bestTimeNote } from './best-time.js';
import { recoveryEligible, recoverablePrayerEvents, mergeBackupState, validateBackup } from './prayer-recovery.js';
import { migrateHistory } from './history-migrate.js';
import { sunPosition, moonPosition, moonPhase, phaseName, moonPass, passFraction, timeArcPoint, timeArcPath, skyColors, sunIntensity, moonLitPath, zoneSpans } from './sky.js';
import { cardNote } from './prayer-card-notes.js';
import { evidenceFor, JAFARI_HIDDEN } from './prayer-evidence.js';
import { nextBoundary, needsRefresh, boundaryDelay } from './prayer-boundary.js';
import { buildTimeline, eventLabel } from './day-timeline.js';
import { nextPrayerEventAfter, activeIntervals } from './interval-rows.js';
import { cardCountdown } from './card-countdown.js';
import { sanitizeSections, sanitizeCards } from './sections.js';
import { reminderRowVisible } from './season.js';
import { prohibitedIntervals } from './forbidden-times.js';
import { formatClock, sanitizeClockFormat, DEFAULT_CLOCK_FORMAT } from './time-format.js';

const $ = id => document.getElementById(id);

const FARD = [
  { key: 'fajr', en: 'Fajr', bn: 'ফজর' },
  { key: 'dhuhr', en: 'Dhuhr', bn: 'যোহর' },
  { key: 'asr', en: 'Asr', bn: 'আসর' },
  { key: 'maghrib', en: 'Maghrib', bn: 'মাগরিব' },
  { key: 'isha', en: 'Isha', bn: 'ইশা' }
];

const THEMES = [
  ['Obsidian', 'dark', '#101719', '#192326', '#a9c6b5'],
  ['Midnight', 'dark', '#111a2a', '#1b2a40', '#9dbfe6'],
  ['Forest', 'dark', '#111c18', '#1c2b23', '#9bc8a7'],
  ['Burgundy', 'dark', '#21151b', '#30212a', '#d7a2b0'],
  ['Graphite', 'dark', '#191b1e', '#25292e', '#c9d0d4'],
  ['Porcelain', 'light', '#f2f3ef', '#ffffff', '#456b58'],
  ['Ivory', 'light', '#f3eee3', '#fffaf1', '#8a7046'],
  ['Mist Blue', 'light', '#edf3f7', '#ffffff', '#4d7397'],
  ['Sage', 'light', '#edf2eb', '#ffffff', '#52785b'],
  ['Rose', 'light', '#f5eeee', '#fffafa', '#95616b']
];

const VOLUNTARY = [
  { key: 'duha', en: 'Ishraq / Duha', bn: 'ইশরাক / দুহা', desc: 'Morning voluntary prayer after sunrise, before the Zawal interval.', rakahs: 'Commonly 2 or more rak‘ahs.' },
  { key: 'awwabin', en: 'Awwabin', bn: 'আওয়াবিন', desc: 'Voluntary prayer after Maghrib and before Isha. Terminology and recommended rak‘ahs differ among scholarly traditions.', rakahs: 'Commonly prayed in sets of 2.' },
  { key: 'qiyam', en: 'Qiyam al-Layl', bn: 'কিয়ামুল লাইল', desc: 'Voluntary night prayer after Isha and before Fajr.', rakahs: 'Prayed in sets of 2; no fixed maximum.' },
  { key: 'tahajjud', en: 'Tahajjud', bn: 'তাহাজ্জুদ', desc: 'Night prayer after sleep. This app highlights the final third of the night as a practical time window.', rakahs: 'Prayed in sets of 2.' },
  { key: 'tarawih', en: 'Tarawih', bn: 'তারাবিহ', desc: 'Night prayer during Ramadan, performed after Isha.', rakahs: 'Common Hanafi practice: 20 rak‘ahs.' },
  { key: 'eid_prayer', en: 'Eid prayer', bn: 'ঈদের নামাজ', desc: 'Special congregational prayer on Eid al-Fitr and Eid al-Adha.', rakahs: '2 rak‘ahs with additional takbirs according to the school.' },
  { key: 'witr', en: 'Witr', bn: 'বিতর', desc: 'The concluding odd-numbered prayer of the night; Hanafi practice treats it as wajib.', rakahs: '3 rak‘ahs in Hanafi practice.' },
  { key: 'rawatib', en: 'Sunnah Rawatib', bn: 'সুন্নাতে রাতিবাহ', desc: 'The regular Sunnah prayers associated with the five obligatory prayers. See the guidance section for the complete 12-rak‘ah arrangement.', rakahs: '12 regular Sunnah rak‘ahs across the day and night.' }
];

const REMINDER_VOLUNTARY = VOLUNTARY.filter(item => item.key !== 'rawatib');

const DEFAULTS = {
  // Location is deliberately unset on a fresh installation. The user must
  // supply a Google Maps link or enter coordinates; no device geolocation.
  lat: null,
  lon: null,
  place: '',
  theme: 'Obsidian',
  language: 'en',
  sound: true,
  tickStyle: DEFAULT_TICK_STYLE,
  // Calculation profile (v1.3.1). Default unchanged: Karachi 18°/18°, Hanafi Asr, no high-latitude rule.
  profile: { ...DEFAULT_PROFILE },
  // 24-hour (default, as before) or 12-hour, applied everywhere a time is shown.
  clock: DEFAULT_CLOCK_FORMAT,
  // Interface font id (see src/ui-fonts.js); 'system' is the unchanged v1.3.0 look.
  uiFont: DEFAULT_UI_FONT,
  notifications: false,
  reminders: {},
  preReminders: {},
  reminderSent: {},
  compact: false,
  startup: false,
  adjustments: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
  history: {},
  transitionSent: {},
  lockWatermark: null,
  // Home page sections that can be hidden in Settings (all shown by default). Hidden sections are not rendered.
  sections: {},
  cards: sanitizeCards()
};

const saved = loadState() || {};
const state = {
  ...DEFAULTS,
  ...saved,
  adjustments: { ...DEFAULTS.adjustments, ...(saved.adjustments || {}) },
  history: migrateHistory(saved.history),
  lockWatermark: /^\d{4}-\d{2}-\d{2}$/.test(saved.lockWatermark || '') ? saved.lockWatermark : null,
  sections: sanitizeSections(saved.sections),
  cards: sanitizeCards(saved.cards),
  reminders: saved.reminders && typeof saved.reminders === 'object' ? saved.reminders : {},
  reminderSent: saved.reminderSent && typeof saved.reminderSent === 'object' ? saved.reminderSent : {},
  transitionSent: saved.transitionSent && typeof saved.transitionSent === 'object' ? saved.transitionSent : {},
  // Minutes before each obligatory prayer begins (0/absent = off), validated 0–180.
  preReminders: sanitizeReminderMap(saved.preReminders, ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']),
  tickStyle: sanitizeTickStyle(saved.tickStyle),
  profile: sanitizeProfile(saved.profile),
  clock: sanitizeClockFormat(saved.clock),
  uiFont: sanitizeUiFont(saved.uiFont)
};
// v1.3.0: a Friday midday record stored under a legacy "jumuah" key also
// completes Dhuhr (records are copied, never removed).
for (const record of Object.values(state.history)) {
  if (record && record.fard && record.fard.jumuah && !record.fard.dhuhr) record.fard.dhuhr = true;
}
const savedLat = state.lat;
const savedLon = state.lon;
const hasSavedLocation = savedLat !== null && savedLat !== undefined && String(savedLat).trim() !== '' &&
  savedLon !== null && savedLon !== undefined && String(savedLon).trim() !== '' &&
  Number.isFinite(Number(savedLat)) && Number.isFinite(Number(savedLon)) &&
  Math.abs(Number(savedLat)) <= 90 && Math.abs(Number(savedLon)) <= 180;
if (hasSavedLocation) {
  state.lat = Number(savedLat);
  state.lon = Number(savedLon);
} else {
  state.lat = null;
  state.lon = null;
  state.place = '';
}

function hasLocation() {
  return Number.isFinite(state.lat) && Number.isFinite(state.lon) &&
    Math.abs(state.lat) <= 90 && Math.abs(state.lon) <= 180;
}

let selectedDate = startOfDay(new Date());
let currentTimes = null;
let liveTimes = null;
let nextPrayer = null;
let countdownState = null;
let lastCountdownCompletionMinute = -1;
let currentPage = 'home';
let homeScrollTop = 0;
let toastHandle = null;
let lastNotificationCheck = 0;
let tickHandle = null;
let renderHandle = null;
let sentNotifications = new Set();
let lastScheduleDate = dateKey(new Date());

const gearIcon = $('settingsToggle').innerHTML;
const homeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.6 12 3l9 7.6v9.1a1.3 1.3 0 0 1-1.3 1.3h-5.2v-6.1h-5v6.1H4.3A1.3 1.3 0 0 1 3 19.7z"/></svg>';

function loadState() {
  try { return JSON.parse(localStorage.getItem('prayer-times-data') || '{}'); }
  catch { return {}; }
}

function save() {
  try { localStorage.setItem('prayer-times-data', JSON.stringify(state)); }
  catch { showToast('Could not save local data. Check available disk space.'); }
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, amount) {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function addMinutes(date, amount) {
  return new Date(date.getTime() + amount * 60000);
}

function dayRecord(date = selectedDate, create = true) {
  const key = dateKey(date);
  if (!state.history[key] && create) state.history[key] = { fard: {}, voluntary: {} };
  return state.history[key] || { fard: {}, voluntary: {} };
}

function lang() { return state.language === 'bn' ? 'bn' : 'en'; }
function text(item) { return item[lang()] || item.en || item.key; }
function fmt(date) { return formatClock(date, { lang: lang(), clock: state.clock }); }
function prayerName(key) { const extra = { jumuah: { en: 'Jumu’ah', bn: 'জুমুআ' }, tahiyyatul_masjid: { en: 'Tahiyyat al-Masjid', bn: 'তাহিয়্যাতুল মসজিদ' }, istikhara: { en: 'Salat al-Istikhara', bn: 'সালাতুল ইস্তিখারা' }, tawbah: { en: 'Salat al-Tawbah', bn: 'নামাজুত তওবা' } }; return text(FARD.find(item => item.key === key) || VOLUNTARY.find(item => item.key === key) || extra[key] || { en: key, bn: key }); }
/* Friday's midday slot reads "Dhuhr/Jumu’ah" everywhere: either prayer completes it. */
function slotName(key, date) {
  return isFridayDhuhr(key, date) ? FRIDAY_DHUHR_LABEL[lang()] : prayerName(key);
}
function dayName(date) {
  return new Intl.DateTimeFormat(lang() === 'bn' ? 'bn-BD' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(date);
}
function pad(value) { return String(value).padStart(2, '0'); }
function countdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const value = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60].map(pad).join(':');
  return lang() === 'bn' ? localizeDigits(value) : value;
}
/* v1.3.4: header subtitle "Location: 23.8103, 90.4125" (Bangla: "অবস্থান: ২৩.৮১০৩, ৯০.৪১২৫") */
function locationSubtitle() {
  const coords = `${state.lat.toFixed(4)}, ${state.lon.toFixed(4)}`;
  return lang() === 'bn' ? `অবস্থান: ${localizeDigits(coords)}` : `Location: ${coords}`;
}
function localizeDigits(value) { return String(value).replace(/[0-9]/g, digit => '০১২৩৪৫৬৭৮৯'[Number(digit)]); }
function setTranslatedText(id, message) {
  $(id).textContent = message;
  translateRenderedText();
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = lang()==='bn' ? (BN_TEXT[message] || message.replace(/[0-9]/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)])) : message;
  toast.classList.add('show');
  clearTimeout(toastHandle);
  toastHandle = setTimeout(() => toast.classList.remove('show'), 2400);
}

function applyUiFont() {
  document.documentElement.style.setProperty('--ui-font', uiFontStack(state.uiFont));
}

function renderUiFontSelect() {
  const select = $('uiFontSelect');
  if (!select) return;
  select.innerHTML = UI_FONTS.map(font => `<option value="${font.id}">${escapeHtml(uiFontLabel(font.id, lang()))}</option>`).join('');
  select.value = state.uiFont;
}

function applyTheme() {
  applyUiFont();
  const theme = THEMES.find(item => item[0] === state.theme) || THEMES[0];
  const root = document.documentElement;
  root.style.setProperty('--bg', theme[2]);
  root.style.setProperty('--surface', theme[3]);
  root.style.setProperty('--surface2', theme[2]);
  root.style.setProperty('--accent', theme[4]);
  root.style.setProperty('--accent2', theme[3]);
  root.style.setProperty('--text', theme[1] === 'dark' ? '#f0f3ef' : '#202823');
  root.style.setProperty('--muted', theme[1] === 'dark' ? '#9daaa6' : '#6f7c74');
  root.style.setProperty('--line', theme[1] === 'dark' ? '#303d3c' : '#d9e0da');
  root.style.setProperty('--good', theme[1] === 'dark' ? '#5dbb83' : '#27854f');
  root.style.setProperty('--gold', theme[1] === 'dark' ? '#c8a86a' : '#a78240');
  document.body.dataset.mode = theme[1];
  document.documentElement.style.colorScheme = theme[1];
  $('themeSelect').value = state.theme;
}

function setLanguage() {
  document.documentElement.lang = lang();
  $('locationLabel').textContent = hasLocation() ? locationSubtitle() : (lang() === 'bn' ? 'অবস্থান নির্ধারণ করুন' : 'Location not set');
  $('timezoneLabel').textContent = `${Intl.DateTimeFormat().resolvedOptions().timeZone || (lang()==='bn'?'ডিভাইসের স্থানীয় সময়':'Device local time')} · ${new Intl.DateTimeFormat('en', { timeZoneName: 'longOffset' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value.replace('GMT', 'UTC') || ''}`;
  $('dateLabel').textContent = dayName(new Date());
  const hijriDate = new Intl.DateTimeFormat(lang()==='bn'?'bn-BD':'en-GB-u-ca-islamic-umalqura', {day:'numeric',month:'long',year:'numeric',calendar:'islamic-umalqura'}).format(islamicCalendarDateAt(new Date()));
  $('hijriDateLabel').textContent = hijriDate;
  $('selectedDay').textContent = dateKey(selectedDate) === dateKey(new Date()) ? (lang() === 'bn' ? 'আজ' : 'Today') : dayName(selectedDate);
  const mark = $('copyrightMark');
  if (mark) mark.textContent = copyrightText(lang());
}

const shiaMode = () => isShiaProfile(state.profile);
const SCHOOL_SHORT = { hanafi: 'Hanafi', shafii: 'Shafi‘i', maliki: 'Maliki', hanbali: 'Hanbali', jafari: 'Ja‘fari' };

function profileOptions(date) {
  // Umm al-Qura's Ramadan Isha (120 min) applies to nights that belong to Ramadan.
  return { ...state.profile, ramadan: hijriParts(addDays(date, 1))?.month === 9 };
}

const prayerTimesCache = new Map();
function getTimes(date) {
  if (!Number.isFinite(state.lat) || !Number.isFinite(state.lon)) return null;
  const cacheKey = [dateKey(date), state.lat, state.lon, -date.getTimezoneOffset(), JSON.stringify(state.profile), JSON.stringify(state.adjustments)].join('|');
  if (prayerTimesCache.has(cacheKey)) return prayerTimesCache.get(cacheKey);
  const times = calculatePrayerTimes(date, state.lat, state.lon, -date.getTimezoneOffset(), profileOptions(date));
  for (const key of Object.keys(state.adjustments)) {
    if (times[key] instanceof Date) times[key] = addMinutes(times[key], Number(state.adjustments[key]) || 0);
  }
  // Keep solar noon/Zawal derived from true solar noon, not the adjusted Dhuhr display time.
  times.zawalStart = addMinutes(times.solarNoon, -6);
  times.zawalEnd = addMinutes(times.solarNoon, 6);
  times.dhuhr = addMinutes(times.zawalEnd, Number(state.adjustments.dhuhr) || 0);
  if (shiaMode()) {
    // Ja'fari: Isha ends at midnight, halfway between sunset and the next Fajr.
    const nextDay = addDays(date, 1);
    const next = calculatePrayerTimes(nextDay, state.lat, state.lon, -nextDay.getTimezoneOffset(), profileOptions(nextDay));
    const nextFajr = addMinutes(next.fajr, Number(state.adjustments.fajr) || 0);
    times.midnight = jafariMidnight(times.sunset, nextFajr);
  }
  prayerTimesCache.set(cacheKey, times);
  while (prayerTimesCache.size > 40) prayerTimesCache.delete(prayerTimesCache.keys().next().value);
  return times;
}

function hijriParts(date) {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      year: 'numeric', month: 'numeric', day: 'numeric'
    }).formatToParts(date);
    return {
      day: Number(parts.find(part => part.type === 'day')?.value),
      month: Number(parts.find(part => part.type === 'month')?.value),
      year: Number(parts.find(part => part.type === 'year')?.value)
    };
  } catch { return null; }
}

function islamicCalendarDateAt(moment = new Date()) {
  const times = getTimes(startOfDay(moment));
  // Umm al-Qura Intl labels civil dates from midnight. The Hijri date changes
  // at sunset, so after Maghrib use the following civil date as the night date.
  return times?.maghrib && moment >= times.maghrib ? addDays(moment, 1) : moment;
}

function currentHijriDate(moment = new Date()) {
  return hijriParts(islamicCalendarDateAt(moment));
}


function daytimeHijriDateForNight(ishaTime) {
  // The night after sunset belongs to the following daytime Hijri date.
  return hijriParts(addDays(ishaTime, 1));
}

function isRamadanNight(ishaTime) {
  return daytimeHijriDateForNight(ishaTime)?.month === 9;
}

function getVoluntaryEvents(date, times = getTimes(date), nextTimes = getTimes(addDays(date, 1))) {
  if (!times || !nextTimes) return [];
  const nightEnd = nextTimes.fajr;
  const nightDuration = nightEnd.getTime() - times.maghrib.getTime();
  const events = [
    {
      key: 'duha', kind: 'voluntary', start: addMinutes(times.sunrise, 20), end: times.zawalStart,
      desc: VOLUNTARY.find(item => item.key === 'duha').desc
    },
    {
      key: 'awwabin', kind: 'voluntary', start: times.maghrib, end: times.isha,
      desc: VOLUNTARY.find(item => item.key === 'awwabin').desc
    },
    {
      key: 'qiyam', kind: 'voluntary', start: times.isha, end: nightEnd,
      desc: VOLUNTARY.find(item => item.key === 'qiyam').desc
    },
    {
      key: 'tahajjud', kind: 'voluntary', start: new Date(nightEnd.getTime() - nightDuration / 3), end: nightEnd,
      desc: VOLUNTARY.find(item => item.key === 'tahajjud').desc
    },
    { key: 'witr', kind: 'voluntary', start: times.isha, end: nightEnd, desc: VOLUNTARY.find(item => item.key === 'witr').desc }
  ];
  if (isRamadanNight(times.isha)) {
    events.push({ key: 'tarawih', kind: 'voluntary', start: times.isha, end: nightEnd, desc: VOLUNTARY.find(item => item.key === 'tarawih').desc });
  }
  const hijri = hijriParts(date);
  if (hijri && ((hijri.month === 10 && hijri.day === 1) || (hijri.month === 12 && hijri.day === 10))) {
    events.push({ key: 'eid_prayer', kind: 'voluntary', start: addMinutes(times.sunrise, 20), end: times.zawalStart, desc: VOLUNTARY.find(item => item.key === 'eid_prayer').desc });
  }
  // Ja'fari mode: Duha, Awwabin and congregational Tarawih are not part of
  // Ja'fari practice, so they are not scheduled; the night prayer, Witr and Eid stay.
  const excluded = shiaMode() ? SHIA_EXCLUDED_VOLUNTARY : [];
  return events.filter(event => event.end > event.start && !excluded.includes(event.key)).map(event => ({ ...event, date: startOfDay(date) }));
}

const SHIA_EXCLUDED_VOLUNTARY = ['duha', 'awwabin', 'tarawih'];

function getFardEvents(date, times = getTimes(date), nextTimes = getTimes(addDays(date, 1))) {
  if (!times || !nextTimes) return [];
  return [
    { key: 'fajr', kind: 'fard', date, start: times.fajr, end: times.sunrise },
    { key: 'dhuhr', kind: 'fard', date, start: times.dhuhr, end: times.asr },
    { key: 'asr', kind: 'fard', date, start: times.asr, end: times.maghrib },
    { key: 'maghrib', kind: 'fard', date, start: times.maghrib, end: times.isha },
    { key: 'isha', kind: 'fard', date, start: times.isha, end: times.midnight && times.midnight > times.isha ? times.midnight : nextTimes.fajr }
  ];
}

let activeEventsCacheKey = '';
let activeEventsCache = [];
function getActiveEvents(now = new Date()) {
  const cacheKey = [Math.floor(now.getTime() / 1000), -now.getTimezoneOffset(), state.lat, state.lon, state.profile.method, state.profile.school, state.profile.highLatitude, JSON.stringify(state.adjustments)].join('|');
  if (cacheKey === activeEventsCacheKey) return activeEventsCache;
  const today = startOfDay(now);
  const events = [];
  for (const offset of [-1, 0, 1, 2]) {
    const date = addDays(today, offset);
    const times = getTimes(date), nextTimes = getTimes(addDays(date, 1));
    if (!times || !nextTimes) continue;
    events.push(...getFardEvents(date, times, nextTimes), ...getVoluntaryEvents(date, times, nextTimes));
  }
  const chronological = events.sort((a, b) => a.start - b.start || (a.kind === 'fard' ? -1 : 1));
  activeEventsCache = chronological.filter(event => {
    if (now < event.start) return false;
    const boundary = lockInstant({ kind: event.kind, key: event.key, date: event.date }, chronological, null);
    return !!boundary && now.getTime() < boundary.at;
  });
  activeEventsCacheKey = cacheKey;
  return activeEventsCache;
}

function getAllFardForDate(date) {
  const times = getTimes(date);
  const nextTimes = getTimes(addDays(date, 1));
  return getFardEvents(date, times, nextTimes);
}

function getNextPrayer(now = new Date()) {
  const today = startOfDay(now);
  const todayTimes = getTimes(today);
  const tomorrow = addDays(today, 1);
  const tomorrowTimes = getTimes(tomorrow);
  if (!todayTimes || !tomorrowTimes) return null;
  const events = getFardEvents(today, todayTimes, tomorrowTimes).concat(getFardEvents(tomorrow, tomorrowTimes, getTimes(addDays(tomorrow, 1))));
  return events.find(event => event.start > now) || null;
}

function shiftDay(delta) {
  selectedDate = addDays(selectedDate, delta);
  render();
}

const ORIGINAL_TEXT = new WeakMap();
const LAST_TRANSLATED_TEXT = new WeakMap();
const BN_TEXT = {
  'NEXT PRAYER':'পরবর্তী নামাজ','NEXT EVENT':'এরপর যা আসছে','The countdown to the next event begins at the displayed local time.':'এরপরের সময়ের কাউন্টডাউন দেখানো স্থানীয় সময়ে শুরু হবে।','TODAY\'S PROGRESS':'আজকের অগ্রগতি','AVAILABLE RIGHT NOW':'এখন যা পড়া যায়','Prayer events':'এখনকার নামাজ','Mark a prayer after its time begins':'ওয়াক্ত শুরু হলে নামাজ পড়ে টিক দিন','THE FIVE OBLIGATORY PRAYERS':'পাঁচ ওয়াক্ত ফরজ নামাজ','Daily prayers':'দৈনিক নামাজ','ADDITIONAL WORSHIP':'অতিরিক্ত ইবাদত','Voluntary prayers':'নফল নামাজ','SEVEN-DAY REVIEW':'সাত দিনের পর্যালোচনা','Weekly Prayer History':'সাপ্তাহিক নামাজের ইতিহাস','Weekly Prayer Progress':'সাপ্তাহিক নামাজের অগ্রগতি','Friday to Thursday':'শুক্রবার থেকে বৃহস্পতিবার','Saturday to Friday':'শনিবার থেকে শুক্রবার','YOUR RECORD':'আপনার রেকর্ড','Prayer history':'নামাজের ইতিহাস','Stored on this device':'এই ডিভাইসে সংরক্ষিত','PREFERENCES':'পছন্দসমূহ','Settings':'সেটিংস','Your configuration is saved locally on this device.':'আপনার সেটিংস এই ডিভাইসেই সংরক্ষিত হয়।','YOUR LOCATION':'আপনার অবস্থান','Prayer location':'নামাজের অবস্থান','On-device':'ডিভাইসে সংরক্ষিত','Use a Google Maps share link or enter coordinates manually. No login or automatic location detection is used.':'Google Maps শেয়ার লিংক দিন অথবা স্থানাঙ্ক লিখুন। লগইন বা স্বয়ংক্রিয় অবস্থান শনাক্তকরণ ব্যবহৃত হয় না।','Google Maps sharing link':'Google Maps শেয়ার লিংক','Use link':'লিংক ব্যবহার করুন','Save location':'অবস্থান সংরক্ষণ','APPEARANCE':'চেহারা','Personalise Prayer Times':'অ্যাপের চেহারা','Colour theme':'রঙের থিম','Compact desktop mode':'কমপ্যাক্ট ডেস্কটপ মোড','Language':'ভাষা','Bangla prayer names and digits':'বাংলা নাম ও সংখ্যা','TIME ADJUSTMENTS':'সময়ের সমন্বয়','Fine-tune local timings':'স্থানীয় সময় সূক্ষ্মভাবে সমন্বয়','WINDOWS INTEGRATION':'উইন্ডোজ সংযোগ','Desktop behaviour':'ডেস্কটপ আচরণ','YOUR DATA':'আপনার তথ্য','Private by default':'ডিফল্টভাবে ব্যক্তিগত','Export backup':'ব্যাকআপ রপ্তানি','Reset local data':'স্থানীয় তথ্য মুছুন','Back to prayers':'নামাজের পাতায় ফিরুন','Completed':'সম্পন্ন','Obligatory prayer':'ফরজ নামাজ','Voluntary':'নফল','OBLIGATORY':'ফরজ','VOLUNTARY':'নফল','TIME LEFT':'বাকি সময়','No prayer event is currently in its time window.':'এই মুহূর্তে কোনো নামাজের নির্ধারিত সময় চলছে না।','Prayer times are unavailable.':'নামাজের সময় পাওয়া যায়নি।','No additional voluntary prayer period is scheduled for this date.':'এই তারিখে অতিরিক্ত নফল নামাজের সময় নির্ধারিত নেই।','Keep going':'চালিয়ে যান','Good Job!':'চমৎকার!','Great Job!':'অসাধারণ!','Sunrise':'সূর্যোদয়','Zawal exclusion':'জাওয়ালের নিষিদ্ধ সময়','Fard':'ফরজ','Previous day':'আগের দিন','Next day':'পরের দিন','Start Prayer Times when Windows starts':'উইন্ডোজ চালু হলে প্রেয়ার টাইমস চালু করুন','Enable Windows prayer notifications':'উইন্ডোজে নামাজের বিজ্ঞপ্তি চালু করুন','Play a short pentatonic sound when a prayer is marked complete':'নামাজ সম্পন্ন করলে ছোট পেন্টাটনিক সুর বাজান','Start Prayer Times when Windows starts':'উইন্ডোজ চালু হলে অ্যাপ চালু করুন','Calculation profile':'হিসাবের প্রোফাইল','Show details':'বিস্তারিত দেখুন','Calculation method':'হিসাবের পদ্ধতি','Asr method':'আসরের পদ্ধতি','Time zone':'সময় অঞ্চল','Device':'ডিভাইস','Zawal exclusion':'জাওয়ালের নিষিদ্ধ সময়','Your location':'আপনার অবস্থান','Latitude':'অক্ষাংশ','Longitude':'দ্রাঘিমাংশ','Place name':'স্থানের নাম','Save location':'অবস্থান সংরক্ষণ','Fine-tune local timings':'স্থানীয় সময় সমন্বয় করুন','Export backup':'ব্যাকআপ রপ্তানি','Reset local data':'স্থানীয় তথ্য মুছুন','Prayer reminders disabled':'নামাজের বিজ্ঞপ্তি বন্ধ','Prayer reminders enabled':'নামাজের বিজ্ঞপ্তি চালু','Location saved':'অবস্থান সংরক্ষিত','Saved location':'সংরক্ষিত অবস্থান','Current:':'বর্তমান:','Begins in':'শুরু হতে বাকি','Time remaining':'বাকি সময়','This prayer period has ended':'এই নামাজের সময় শেষ হয়েছে','All five obligatory prayers and every voluntary event for today are complete.':'আজকের পাঁচ ওয়াক্ত ফরজ ও সব নফল নামাজ সম্পন্ন হয়েছে।','Prayer Times':'নামাজের সময়','Fajr':'ফজর','Dhuhr':'যোহর','Asr':'আসর','Maghrib':'মাগরিব','Isha':'ইশা','Sunset':'সূর্যাস্ত','Obligatory':'ফরজ','Prayer times are calculated on this device':'নামাজের সময় এই ডিভাইসেই হিসাব করা হয়','Complete the five obligatory prayers to earn your daily achievement.':'দৈনিক লক্ষ্য পূরণে পাঁচ ওয়াক্ত ফরজ নামাজ আদায় করুন।','Time until the next prayer':'পরবর্তী নামাজের বাকি সময়','Calculated on this device · Prayer records stay on this device':'এই ডিভাইসে হিসাব করা হয় · নামাজের রেকর্ড এই ডিভাইসেই থাকে','Expanded Google Maps links with coordinates work offline. Shortened share links cannot be expanded offline; copy coordinates from Maps or enter them below.':'স্থানাঙ্কসহ Google Maps লিংক অফলাইনে পড়া যায়। সংক্ষিপ্ত লিংক অফলাইনে খোলা যায় না; Maps থেকে স্থানাঙ্ক কপি করে লিখুন।','Currently saved location':'বর্তমানে সংরক্ষিত অবস্থান','University of Islamic Sciences, Karachi · Fajr 18° / Isha 18°':'ইউনিভার্সিটি অব ইসলামিক সায়েন্সেস, করাচি · ফজর ১৮° / ইশা ১৮°','Hanafi · shadow factor 2':'হানাফি · ছায়ার অনুপাত ২','True solar noon · six-minute prohibited interval':'প্রকৃত সৌর মধ্যাহ্ন · ছয় মিনিটের নিষিদ্ধ সময়',"Prayer calculations follow the device's local time zone. Location coordinates do not change Windows time-zone settings.":'নামাজের সময় ডিভাইসের স্থানীয় সময় অঞ্চল অনুযায়ী হিসাব হয়। অবস্থানের স্থানাঙ্ক উইন্ডোজের সময় অঞ্চল পরিবর্তন করে না।','Personalise Prayer Times':'নামাজের সময় অ্যাপ সাজান','English':'ইংরেজি','Bangla':'বাংলা','Optional minute offsets are applied after the calculation. Use these only when you have a trusted local timetable to compare against.':'হিসাবের পরে ঐচ্ছিক মিনিট সমন্বয় প্রয়োগ হয়। নির্ভরযোগ্য স্থানীয় সময়সূচির সঙ্গে মিলিয়ে তবেই ব্যবহার করুন।','When enabled, Prayer Times starts quietly in the system tray. This setting is optional and stays off until you enable it.':'চালু করলে অ্যাপটি সিস্টেম ট্রেতে নীরবে চালু হবে। আপনি নিজে চালু না করা পর্যন্ত সেটিংটি বন্ধ থাকবে।','Windows notification permission is requested only when you enable reminders. Prayer calculations and tracking work without it.':'আপনি স্মরণিকা চালু করলেই শুধু উইন্ডোজের বিজ্ঞপ্তির অনুমতি চাওয়া হবে। অনুমতি ছাড়াও সময় হিসাব ও নামাজ ট্র্যাকিং চলবে.',"Prayer history, preferences, themes and location stay in this application's local profile. Nothing is uploaded or synchronised.":'নামাজের ইতিহাস, পছন্দ, থিম ও অবস্থান অ্যাপের স্থানীয় প্রোফাইলে থাকে। কোনো তথ্য আপলোড বা সিঙ্ক করা হয় না।','Umm al-Qura estimate; local moon-sighting may differ.':'উম্মুল কুরা পদ্ধতির আনুমানিক তারিখ; স্থানীয় চাঁদ দেখার কারণে পার্থক্য হতে পারে।','The dawn prayer, performed after true dawn begins and before sunrise.':'সুবহে সাদিক শুরু হওয়ার পর এবং সূর্যোদয়ের আগে আদায় করা হয়।','The midday prayer, after the sun has passed its zenith and the prohibited solar-noon interval has ended.':'সূর্য মধ্যাকাশ অতিক্রম ও নিষিদ্ধ সময় শেষ হওয়ার পর আদায় করা হয়।','The afternoon prayer. This application uses the Hanafi shadow-factor-two criterion.':'বিকেলের নামাজ। এই অ্যাপে হানাফি ছায়ার অনুপাত দুই অনুসরণ করা হয়।','The sunset prayer, beginning after the sun has set.':'সূর্যাস্তের পর মাগরিবের সময় শুরু হয়.',"The night prayer, beginning when the selected calculation method's twilight criterion is reached.":'নির্বাচিত হিসাব পদ্ধতির গোধূলির মান পূর্ণ হলে ইশার সময় শুরু হয়।','A morning voluntary prayer after sunrise, once the short prohibited interval after sunrise has passed, and before solar noon.':'সূর্যোদয়ের নিষিদ্ধ সময় পার হওয়ার পর থেকে সৌর মধ্যাহ্নের আগে আদায় করা সকালের নফল নামাজ.',"A voluntary prayer commonly performed after Maghrib and before Isha. Its classification and recommended rak'ahs vary among scholarly traditions.":'মাগরিবের পর ও ইশার আগে প্রচলিত নফল নামাজ। এর শ্রেণিবিন্যাস ও রাকাতসংখ্যা নিয়ে আলেমদের মতভেদ রয়েছে।','Voluntary night prayer after Isha and before Fajr.':'ইশার পর থেকে ফজরের আগে পর্যন্ত নফল রাতের নামাজ.','Night prayer performed after sleep; this application highlights the final third of the night as a practical time window.':'ঘুমিয়ে উঠে আদায় করা রাতের নামাজ; অ্যাপে রাতের শেষ এক-তৃতীয়াংশকে বিশেষ সময় হিসেবে দেখানো হয়.',"Night prayer associated with Ramadan, performed after Isha. It is shown only when the device's built-in Islamic date calculation indicates a Ramadan night.":'রমজানের রাতে ইশার পর আদায় করা রাতের নামাজ। ডিভাইসের হিজরি হিসাব রমজান দেখালেই এটি দেখানো হয়।','The special congregational prayer on Eid al-Fitr and Eid al-Adha, within its morning time window.':'ঈদুল ফিতর ও ঈদুল আজহার বিশেষ জামাত; শুধু সকালের নির্ধারিত সময়ে আদায় করা হয়।','The regular Sunnah prayers associated with the five obligatory prayers.':'পাঁচ ওয়াক্ত ফরজ নামাজের সঙ্গে সংশ্লিষ্ট নিয়মিত সুন্নাত নামাজ.','Friday congregational prayer in place of Dhuhr for those upon whom it is obligatory.':'যাদের ওপর ফরজ, তাদের জন্য শুক্রবার যোহরের পরিবর্তে জামাতে আদায় করা নামাজ.'
};
Object.assign(BN_TEXT, {
  'Prayer Times':'নামাজের সময়','Fajr':'ফজর','Dhuhr':'যোহর','Asr':'আসর','Maghrib':'মাগরিব','Isha':'ইশা','Sunset':'সূর্যাস্ত','Obligatory':'ফরজ',
  'Prayer times are calculated on this device':'নামাজের সময় এই ডিভাইসেই হিসাব করা হয়',
  'Complete the five obligatory prayers to earn your daily achievement.':'দৈনিক লক্ষ্য পূরণে পাঁচ ওয়াক্ত ফরজ নামাজ আদায় করুন।',
  'Time until the next prayer':'পরবর্তী নামাজের বাকি সময়','Calculated on this device · Prayer records stay on this device':'এই ডিভাইসে হিসাব করা হয় · নামাজের রেকর্ড এই ডিভাইসেই থাকে',
  'Expanded Google Maps links with coordinates work offline. Shortened share links cannot be expanded offline; copy coordinates from Maps or enter them below.':'স্থানাঙ্কসহ Google Maps লিংক অফলাইনে পড়া যায়। সংক্ষিপ্ত লিংক অফলাইনে খোলা যায় না; Maps থেকে স্থানাঙ্ক কপি করে লিখুন।',
  'Currently saved location':'বর্তমানে সংরক্ষিত অবস্থান',
  'University of Islamic Sciences, Karachi · Fajr 18° / Isha 18°':'ইউনিভার্সিটি অব ইসলামিক সায়েন্সেস, করাচি · ফজর ১৮° / ইশা ১৮°',
  'Hanafi · shadow factor 2':'হানাফি · ছায়ার অনুপাত ২','True solar noon · six-minute prohibited interval':'প্রকৃত সৌর মধ্যাহ্ন · ছয় মিনিটের নিষিদ্ধ সময়',
  "Prayer calculations follow the device's local time zone. Location coordinates do not change Windows time-zone settings.":'নামাজের সময় ডিভাইসের স্থানীয় সময় অঞ্চল অনুযায়ী হিসাব হয়। অবস্থানের স্থানাঙ্ক উইন্ডোজের সময় অঞ্চল পরিবর্তন করে না।',
  'Personalise Prayer Times':'নামাজের সময় অ্যাপ সাজান','English':'ইংরেজি','Bangla':'বাংলা',
  'Optional minute offsets are applied after the calculation. Use these only when you have a trusted local timetable to compare against.':'হিসাবের পরে ঐচ্ছিক মিনিট সমন্বয় প্রয়োগ হয়। নির্ভরযোগ্য স্থানীয় সময়সূচির সঙ্গে মিলিয়ে তবেই ব্যবহার করুন।',
  'When enabled, Prayer Times starts quietly in the system tray. This setting is optional and stays off until you enable it.':'চালু করলে অ্যাপটি সিস্টেম ট্রেতে নীরবে চালু হবে। আপনি নিজে চালু না করা পর্যন্ত সেটিংটি বন্ধ থাকবে।',
  'Windows notification permission is requested only when you enable reminders. Prayer calculations and tracking work without it.':'আপনি স্মরণিকা চালু করলেই শুধু উইন্ডোজের বিজ্ঞপ্তির অনুমতি চাওয়া হবে। অনুমতি ছাড়াও সময় হিসাব ও নামাজ ট্র্যাকিং চলবে।',
  "Prayer history, preferences, themes and location stay in this application's local profile. Nothing is uploaded or synchronised.":'নামাজের ইতিহাস, পছন্দ, থিম ও অবস্থান অ্যাপের স্থানীয় প্রোফাইলে থাকে। কোনো তথ্য আপলোড বা সিঙ্ক করা হয় না।',
  'Umm al-Qura estimate; local moon-sighting may differ.':'উম্মুল কুরা পদ্ধতির আনুমানিক তারিখ; স্থানীয় চাঁদ দেখার কারণে পার্থক্য হতে পারে।',
  'The dawn prayer, performed after true dawn begins and before sunrise.':'সুবহে সাদিক শুরু হওয়ার পর এবং সূর্যোদয়ের আগে আদায় করা হয়।',
  'The midday prayer, after the sun has passed its zenith and the prohibited solar-noon interval has ended.':'সূর্য মধ্যাকাশ অতিক্রম ও নিষিদ্ধ সময় শেষ হওয়ার পর আদায় করা হয়।',
  'The afternoon prayer. This application uses the Hanafi shadow-factor-two criterion.':'বিকেলের নামাজ। এই অ্যাপে হানাফি ছায়ার অনুপাত দুই অনুসরণ করা হয়।',
  'The sunset prayer, beginning after the sun has set.':'সূর্যাস্তের পর মাগরিবের সময় শুরু হয়।',
  "The night prayer, beginning when the selected calculation method's twilight criterion is reached.":'নির্বাচিত হিসাব পদ্ধতির গোধূলির মান পূর্ণ হলে ইশার সময় শুরু হয়।',
  'A morning voluntary prayer after sunrise, once the short prohibited interval after sunrise has passed, and before solar noon.':'সূর্যোদয়ের নিষিদ্ধ সময় পার হওয়ার পর থেকে সৌর মধ্যাহ্নের আগে আদায় করা সকালের নফল নামাজ।',
  "A voluntary prayer commonly performed after Maghrib and before Isha. Its classification and recommended rak'ahs vary among scholarly traditions.":'মাগরিবের পর ও ইশার আগে প্রচলিত নফল নামাজ। এর শ্রেণিবিন্যাস ও রাকাতসংখ্যা নিয়ে আলেমদের মতভেদ রয়েছে।',
  'Voluntary night prayer after Isha and before Fajr.':'ইশার পর থেকে ফজরের আগে পর্যন্ত নফল রাতের নামাজ।',
  'Night prayer performed after sleep; this application highlights the final third of the night as a practical time window.':'ঘুমিয়ে উঠে আদায় করা রাতের নামাজ; অ্যাপে রাতের শেষ এক-তৃতীয়াংশকে বিশেষ সময় হিসেবে দেখানো হয়।',
  "Night prayer associated with Ramadan, performed after Isha. It is shown only when the device's built-in Islamic date calculation indicates a Ramadan night.":'রমজানের রাতে ইশার পর আদায় করা রাতের নামাজ। ডিভাইসের হিজরি হিসাব রমজান দেখালেই এটি দেখানো হয়।',
  'The special congregational prayer on Eid al-Fitr and Eid al-Adha, within its morning time window.':'ঈদুল ফিতর ও ঈদুল আজহার বিশেষ জামাত; শুধু সকালের নির্ধারিত সময়ে আদায় করা হয়।',
  'The regular Sunnah prayers associated with the five obligatory prayers.':'পাঁচ ওয়াক্ত ফরজ নামাজের সঙ্গে সংশ্লিষ্ট নিয়মিত সুন্নাত নামাজ।',
  'Friday congregational prayer in place of Dhuhr for those upon whom it is obligatory.':'যাদের ওপর ফরজ, তাদের জন্য শুক্রবার যোহরের পরিবর্তে জামাতে আদায় করা নামাজ।'
});


Object.assign(BN_TEXT, {
  'PRAYER COUNTDOWN':'নামাজের কাউন্টডাউন','Sunrise':'সূর্যোদয়','Zawal exclusion':'জাওয়ালের নিষিদ্ধ সময়','Sunset':'সূর্যাস্ত',
  'Ishraq / Duha':'ইশরাক / দুহা','Awwabin':'আওয়াবিন','Qiyam al-Layl':'কিয়ামুল লাইল','Tahajjud':'তাহাজ্জুদ','Tarawih':'তারাবিহ','Eid prayer':'ঈদের নামাজ','Witr':'বিতর','Jumu’ah':'জুমুআ','Regular Sunnah prayers (Rawatib)':'নিয়মিত সুন্নাতে রাতিবাহ','Tahiyyat al-Masjid':'তাহিয়্যাতুল মসজিদ','Salat al-Istikhara':'সালাতুল ইস্তিখারা','Salat al-Tawbah':'নামাজুত তওবা',
  'Continue regular worship; no special prayer is assigned without reliable evidence.':'নিয়মিত ইবাদতই যথেষ্ট; নির্ভরযোগ্য দলিল ছাড়া বিশেষ নামাজ নির্ধারণ করা হয়নি।',
  'No additional voluntary prayer period is scheduled for this date.':'এই তারিখে অতিরিক্ত নফল নামাজের সময় নির্ধারিত নেই।','events':'ইভেন্ট','event':'ইভেন্ট',
  'Prayer marked complete':'নামাজ পড়া হলো, টিক পড়ল','This prayer event is not currently available.':'এই নামাজের সময় এখন উপলভ্য নয়।',
  'Could not save local data. Check available disk space.':'স্থানীয় তথ্য সংরক্ষণ করা যায়নি। ডিভাইসে পর্যাপ্ত জায়গা আছে কি না দেখুন।',
  'Paste a Google Maps share link first.':'প্রথমে Google Maps শেয়ার লিংক পেস্ট করুন।','Enter a valid Google Maps HTTPS link.':'সঠিক Google Maps HTTPS লিংক দিন অথবা সরাসরি স্থানাঙ্ক লিখুন।',
  'Short-link lookup is available in the installed desktop app. You can always enter coordinates manually.':'সংক্ষিপ্ত লিংক যাচাই শুধু ইনস্টল করা ডেস্কটপ অ্যাপে সম্ভব। চাইলে স্থানাঙ্ক সরাসরি লিখতে পারেন।',
  'Following the Google Maps redirect once. No account sign-in is used.':'Google Maps লিংকটি একবার যাচাই করা হচ্ছে। কোনো অ্যাকাউন্টে সাইন-ইন করা হবে না।',
  'Could not resolve this share link. Open it in Maps, copy the coordinates, or enter them manually.':'এই শেয়ার লিংক থেকে অবস্থান পাওয়া যায়নি। Maps-এ খুলে স্থানাঙ্ক কপি করুন অথবা হাতে লিখুন।',
  'The link did not contain valid coordinates.':'লিংকে বৈধ স্থানাঙ্ক পাওয়া যায়নি।','Location saved locally on this device.':'অবস্থান এই ডিভাইসে সংরক্ষিত হয়েছে।',
  'Enter valid coordinates: latitude −90 to 90, longitude −180 to 180.':'সঠিক স্থানাঙ্ক দিন: অক্ষাংশ −৯০ থেকে ৯০, দ্রাঘিমাংশ −১৮০ থেকে ১৮০।',
  'Location saved':'অবস্থান সংরক্ষিত','Prayer reminders disabled':'নামাজের স্মরণিকা বন্ধ','Prayer reminders enabled':'নামাজের স্মরণিকা চালু',
  'Windows startup disabled':'উইন্ডোজ চালুর সঙ্গে অ্যাপ চালু বন্ধ করা হয়েছে','Could not update Windows startup setting':'উইন্ডোজ স্টার্টআপ সেটিং পরিবর্তন করা যায়নি',
  'Windows notification permission was not granted':'উইন্ডোজ বিজ্ঞপ্তির অনুমতি দেওয়া হয়নি','Send test notification':'পরীক্ষামূলক বিজ্ঞপ্তি পাঠান','HOME PAGE':'হোম পেজ','Sections on the home page':'হোম পেজের বিভাগ','Show Prayer descriptions':'নামাজের বিবরণ দেখান','Hidden sections are not drawn and do no work. All are shown by default; your choice is remembered on this device.':'লুকানো বিভাগ আঁকা হয় না এবং কোনো কাজ করে না। ডিফল্টে সবই দেখানো হয়; আপনার পছন্দ এই ডিভাইসে মনে রাখা হয়।',"Today's prohibited intervals":'আজকের নিষিদ্ধ সময়','Shows a real Windows notification now, with the reason if Windows refuses it.':'এখনই একটি আসল উইন্ডোজ বিজ্ঞপ্তি দেখায়; উইন্ডোজ না দেখালে কারণসহ জানায়।','Will start with Windows':'উইন্ডোজ চালুর সঙ্গে অ্যাপ চালু হবে',
  'Adjustment must be between −30 and +30 minutes':'সমন্বয় −৩০ থেকে +৩০ মিনিটের মধ্যে হতে হবে','Local data reset':'স্থানীয় তথ্য মুছে ফেলা হয়েছে',
  'Delete all locally stored settings and prayer history? The application will return to its default location.':'স্থানীয়ভাবে সংরক্ষিত সব সেটিংস ও নামাজের ইতিহাস মুছবেন? অ্যাপটি ডিফল্ট অবস্থানে ফিরে যাবে।',
  'Prayer times are unavailable':'নামাজের সময় পাওয়া যায়নি','Begins':'শুরু','Ends':'শেষ','Time remaining':'বাকি সময়','Begins in':'শুরু হতে বাকি','This prayer period has ended':'এই নামাজের সময় শেষ হয়েছে',
  'Hanafi':'হানাফি','Karachi':'করাচি','Device local time':'ডিভাইসের স্থানীয় সময়','Device':'ডিভাইস'
});


Object.assign(BN_TEXT, {
  "TODAY'S PROGRESS":'আজকের অগ্রগতি','METHOD':'হিসাবের পদ্ধতি','6 min':'৬ মিনিট',
  'Obsidian':'অবসিডিয়ান','Midnight':'মিডনাইট','Forest':'ফরেস্ট','Burgundy':'বারগান্ডি','Graphite':'গ্রাফাইট','Porcelain':'পর্সেলিন','Ivory':'আইভরি','Mist Blue':'মিস্ট ব্লু','Sage':'সেজ','Rose':'রোজ','dark':'গাঢ়','light':'হালকা',
  'Islamic New Year':'ইসলামি নববর্ষ','Start of Muharram':'মুহাররমের শুরু','Day before Ashura (Tasu’a)':'আশুরার আগের দিন (তাসুআ)','9 Muharram':'৯ মুহাররম','Day of Ashura':'আশুরার দিন','10 Muharram':'১০ মুহাররম','Mawlid an-Nabi':'মাওলিদুন্নবী','Observance varies among Muslim communities':'মুসলিম সম্প্রদায়ভেদে পালন ভিন্ন','Isra and Mi’raj':'ইসরা ও মিরাজ','27 Rajab':'২৭ রজব','Mid-Sha’ban':'মধ্য শাবান','15 Sha’ban':'১৫ শাবান','Start of Ramadan':'রমজানের শুরু','The month of fasting':'সিয়ামের মাস','Battle of Badr':'বদরের যুদ্ধ','17 Ramadan':'১৭ রমজান','Laylat al-Qadr (commonly observed)':'লাইলাতুল কদর (প্রচলিত তারিখ)','The Night of Decree; the exact night is not fixed':'শবে কদর; নির্দিষ্ট রাত নিশ্চিত নয়','Eid al-Fitr':'ঈদুল ফিতর','1 Shawwal':'১ শাওয়াল','Six days of Shawwal':'শাওয়ালের ছয় রোজা','Optional fasting; dates may vary by local practice':'নফল রোজা; স্থানীয় আমলভেদে তারিখ ভিন্ন হতে পারে','Day of Arafah':'আরাফার দিন','9 Dhul Hijjah':'৯ জিলহজ','Eid al-Adha':'ঈদুল আজহা','10 Dhul Hijjah':'১০ জিলহজ','Last ten nights of Ramadan':'রমজানের শেষ দশ রাত','Seek Laylat al-Qadr in the odd-numbered nights':'বিজোড় রাতে লাইলাতুল কদর অনুসন্ধান করুন','First ten days of Dhul Hijjah':'জিলহজের প্রথম দশ দিন','Among the most significant days of the Islamic year':'ইসলামি বছরের সর্বাধিক মর্যাদাপূর্ণ দিনগুলোর অন্তর্ভুক্ত',
  'Day before Ashura (Tasu’a) · 9 Muharram':'আশুরার আগের দিন (তাসুআ) · ৯ মুহাররম',
  'Time left':'বাকি সময়','Prayer countdown':'নামাজের কাউন্টডাউন'
});

Object.assign(BN_TEXT, {
  'Obligatory prayers':'ফরজ নামাজ','Daily voluntary prayers':'দৈনিক নফল নামাজ','Situational voluntary prayers':'পরিস্থিতিভিত্তিক নফল নামাজ','Seasonal prayer events':'মৌসুমি নামাজ',
  
  'Dated events and historical context':'তারিখভিত্তিক ঘটনা ও ঐতিহাসিক প্রেক্ষাপট',
  'Prophetic guidance and daily life':'নববী নির্দেশনা ও দৈনন্দিন জীবন',
  
  'The first revelation':'প্রথম ওহি','Exact historical date match':'নির্দিষ্ট ঐতিহাসিক তারিখের মিল',
  'Historical match by week of the month':'মাসের একই সপ্তাহের ঐতিহাসিক মিল',
  'Historical match by month':'মাসভিত্তিক ঐতিহাসিক মিল',
  'Closest documented historical period':'নিকটতম নথিভুক্ত ঐতিহাসিক সময়',
  'Matches today’s Hijri date.':'আজকের হিজরি তারিখের সঙ্গে মিলে গেছে।',
  'No event is documented for today’s exact date; this is the nearest verified historical anniversary, not a claim that it happened today.':'আজকের নির্দিষ্ট তারিখে কোনো ঘটনা নথিভুক্ত নেই; এটি নিকটতম যাচাইযোগ্য ঐতিহাসিক বার্ষিকী, আজ ঘটেছে এমন দাবি নয়।',
  'Recite in the name of your Lord who created.':'পড়ুন আপনার রবের নামে, যিনি সৃষ্টি করেছেন।',
  'Continue with Surah al-‘Alaq 96:2–5.':'এরপর সূরা আল-আলাক ৯৬:২–৫ পড়তে পারেন।',
  '© 2026–2027':'© ২০২৬–২০২৭','Salman Reza Amit':'সালমান রেজা অমিত','© 2026–2027 Salman Reza Amit':'© ২০২৬–২০২৭ সালমান রেজা অমিত',
  'Calculated on this device · Prayer records stay on this device':'এই ডিভাইসে হিসাব করা হয় · নামাজের রেকর্ড এই ডিভাইসেই থাকে',
  'Keyboard shortcuts':'কিবোর্ড শর্টকাট','Toggle fullscreen':'পূর্ণপর্দা চালু বা বন্ধ করুন',
  'Exit fullscreen or close this panel':'পূর্ণপর্দা থেকে বের হন অথবা এই প্যানেল বন্ধ করুন',
  'Return to the top of the home page':'মূল পাতার একদম ওপরে যান','Scroll up one screen':'এক পর্দা ওপরে যান',
  'Scroll down one screen':'এক পর্দা নিচে যান','Go to the bottom of the page':'পাতার একদম নিচে যান',
  'Show these shortcuts':'এই শর্টকাটগুলো দেখান',
  'Exit fullscreen, go back, or close this panel':'পূর্ণপর্দা থেকে বের হন, পেছনে যান অথবা এই প্যানেল বন্ধ করুন',
  'Show or hide these shortcuts':'এই শর্টকাটগুলো দেখান বা লুকান',
  'Previous or next item in a focused card':'নির্বাচিত কার্ডে আগের বা পরের বিষয়',
  'Activate the focused button or tick circle':'নির্বাচিত বোতাম বা টিক-বৃত্ত চালু করুন',
  'Move between controls':'নিয়ন্ত্রণগুলোর মধ্যে সরে যান',
  'Close shortcuts':'শর্টকাট বন্ধ করুন','Sunnah':'সুন্নাত','Clock format':'ঘড়ির ধরন','Font':'ফন্ট','24-hour (17:05)':'২৪ ঘণ্টা (১৭:০৫)','12-hour (5:05 PM)':'১২ ঘণ্টা (বিকাল ৫:০৫)','Calculation method':'হিসাব পদ্ধতি','School (Asr method)':'মাযহাব (আসর পদ্ধতি)','High-latitude rule':'উচ্চ অক্ষাংশ নিয়ম','Calculation profile updated':'হিসাব প্রোফাইল হালনাগাদ হয়েছে','Date-specific':'বিশেষ দিনের নামাজ','Tick sound':'টিক শব্দ','Wooden':'কাঠের','Soft':'নরম','Crystal':'স্ফটিক','Nafl':'নফল','Other voluntary':'অন্যান্য নফল ইবাদত','Sunnah marked complete':'সুন্নাত সম্পন্ন হিসেবে চিহ্নিত','Nafl marked complete':'নফল সম্পন্ন হিসেবে চিহ্নিত','All Sunnah prayers complete':'সব সুন্নাত সম্পন্ন','All prayer-linked Nafl complete':'নামাজ-সংশ্লিষ্ট সব নফল সম্পন্ন',
  'Remind me before a prayer begins':'নামাজের সময় শুরুর আগে মনে করিয়ে দিন',
  'Enter any whole number of minutes from 0 to 180 for each obligatory prayer. 0 turns that reminder off.':'প্রতিটি ফরজ নামাজের জন্য ০ থেকে ১৮০-এর মধ্যে যেকোনো পূর্ণ সংখ্যায় মিনিট লিখুন। ০ দিলে সেই স্মরণিকা বন্ধ থাকবে।',
  'Enter whole minutes from 0 to 180':'০ থেকে ১৮০-এর মধ্যে পূর্ণ সংখ্যায় মিনিট লিখুন','Previous item':'আগেরটি','Next item':'পরেরটি',
  'Fullscreen mode is unavailable':'পূর্ণপর্দা মোড উপলভ্য নয়',
  'Play a short tick sound when a prayer is marked complete':'নামাজ সম্পন্ন চিহ্নিত করলে ছোট টিক শব্দ বাজান',
  'Prayer completion progress':'নামাজ সম্পন্নের অগ্রগতি',
  'Date-specific prayers':'তারিখভিত্তিক নামাজ',
  
  'Seasonal prayer descriptions':'মৌসুমি নামাজের বিবরণ',
  'Set your location with a Google Maps link or coordinates first.':'প্রথমে Google Maps লিংক বা স্থানাঙ্ক দিয়ে আপনার অবস্থান নির্ধারণ করুন।'
});

Object.assign(BN_TEXT, {
  'Remind me before a prayer period ends':'নামাজের সময় শেষ হওয়ার আগে স্মরণ করান',
  'Choose a separate lead time for each event. Select Off to disable an individual reminder.':'প্রতিটি নামাজের জন্য আলাদা সময় নির্ধারণ করুন। বন্ধ করলে সেই স্মরণিকা নিষ্ক্রিয় থাকবে।',
  'Off':'বন্ধ','min before':'মিনিট আগে',
  
  
  'A surah’s general chronology or its association with an event is not treated as proof of the exact day of revelation.':'কোনো সূরার সাধারণ অবতরণ-ক্রম বা ঘটনার সঙ্গে সম্পর্ককে নির্দিষ্ট দিনের প্রমাণ হিসেবে ধরা হয় না।'
});

Object.assign(BN_TEXT, {
  'PROGRESS CYCLE':'অগ্রগতির চক্র',
  "TODAY'S COMPLETED PRAYERS":'আজকের সম্পন্ন নামাজ',
  'Completed Today':'আজ সম্পন্ন',
  'completed event':'সম্পন্ন নামাজ',
  'completed events':'সম্পন্ন নামাজসমূহ',
  'No prayer event has all its applicable parts completed yet today.':'আজ এখনো কোনো নামাজের সব প্রযোজ্য অংশ সম্পন্ন হয়নি।',
  'Daily voluntary prayers':'দৈনিক নফল নামাজ',
  'Situational voluntary prayers':'পরিস্থিতিভিত্তিক নফল নামাজ',
  'SPECIAL-DAY PRAYER EVENTS':'বিশেষ দিনের নামাজ',
  'Special-day prayers':'বিশেষ দিনের নামাজ',
  'Only when applicable':'প্রযোজ্য দিনেই',
  'When the circumstance applies':'পরিস্থিতি অনুযায়ী',
  'No daily voluntary prayer period is scheduled for this date.':'এই তারিখে দৈনিক নফল নামাজের নির্দিষ্ট সময় নেই।',
  'No special-day prayer event applies to this date.':'এই তারিখে কোনো বিশেষ দিনের নামাজ প্রযোজ্য নয়।',
  'Regular Sunnah (Rawatib)':'নিয়মিত সুন্নাতে রাতিবাহ',
  'Attached to the five obligatory prayers':'পাঁচ ওয়াক্ত ফরজের সঙ্গে সংশ্লিষ্ট',
  'Best Time to Pray':'নামাজের উত্তম সময়',
  'BEST TIME TO PRAY':'নামাজের উত্তম সময়',
  'Begins in':'শুরু হতে বাকি',
  'Time remaining in the recommended period':'উত্তম সময়ের বাকি অংশ',
  'The recommended period has passed.':'উত্তম সময় শেষ হয়েছে।',
  'Approximate reminder window':'আনুমানিক স্মরণ-সময়',
  'Recording available':'রেকর্ড করা যাবে',
  'PRAYER COUNTDOWN':'নামাজের কাউন্টডাউন',
  'LOCAL TIME & ASTRONOMY':'স্থানীয় সময় ও জ্যোতির্বিজ্ঞান',
  'SUN POSITION':'সূর্যের অবস্থান',
  'MOON POSITION':'চাঁদের অবস্থান',
  'LUNAR PHASE':'চাঁদের দশা',
  "TODAY'S PRAYER EVENTS":'আজকের নামাজের সময়',
  'Prayer timings':'নামাজের সময়সূচি',
  'PROHIBITED PERIODS':'নিষিদ্ধ সময়',
  'Prayer restrictions':'নামাজের নিষেধাজ্ঞা',
  'Back to prayers':'নামাজের পাতায় ফিরুন',
  'PRAYER COMPLETION RECOVERY':'নামাজের টিক পুনরুদ্ধার',
  'Recover a forgotten tick':'ভুলে যাওয়া টিক পুনরুদ্ধার',
  'Press and hold for 3 seconds':'৩ সেকেন্ড চেপে ধরে রাখুন',
  'There is no locked, unrecorded Fard prayer to select.':'নির্বাচনের জন্য কোনো লক হওয়া, রেকর্ড না করা ফরজ নামাজ নেই।',
  'Recover only a prayer you actually performed.':'শুধু বাস্তবে আদায় করা নামাজের রেকর্ড পুনরুদ্ধার করুন।',
  'Backup restored':'ব্যাকআপ পুনরুদ্ধার করা হয়েছে',
  'Export JSON backup':'JSON ব্যাকআপ রপ্তানি',
  'Import backup':'ব্যাকআপ আমদানি',
  'Merge backup':'ব্যাকআপ একত্র করুন',
  'Replace local data':'স্থানীয় তথ্য প্রতিস্থাপন করুন',
  'Choose a JSON backup first.':'প্রথমে একটি JSON ব্যাকআপ নির্বাচন করুন।',
  'The selected file is not valid JSON.':'নির্বাচিত ফাইলটি বৈধ JSON নয়।',
  'Backup format version is missing or invalid.':'ব্যাকআপের সংস্করণ অনুপস্থিত বা অবৈধ।',
  'Backup data is missing or invalid.':'ব্যাকআপের তথ্য অনুপস্থিত বা অবৈধ।',
  'Prayer history is missing or invalid.':'নামাজের ইতিহাস অনুপস্থিত বা অবৈধ।',
  'I performed this prayer but forgot to record it.':'আমি এই নামাজ আদায় করেছি, কিন্তু রেকর্ড করতে ভুলে গেছি।'
});

function translateRenderedText() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const raw = node.nodeValue;
    const lastTranslated = LAST_TRANSLATED_TEXT.get(node);
    if (!ORIGINAL_TEXT.has(node) || (lastTranslated !== undefined && raw !== lastTranslated)) ORIGINAL_TEXT.set(node, raw);
    const original = ORIGINAL_TEXT.get(node);
    const trimmed = original.trim();
    if (!trimmed) continue;
    if (lang() !== 'bn') { node.nodeValue = original; LAST_TRANSLATED_TEXT.set(node, original); continue; }
    let translated = BN_TEXT[trimmed];
    if (!translated) {
      translated = trimmed
        .replace(/([0-9]+) of 5 obligatory prayers/g, '$1/৫টি ফরজ নামাজ')
        .replace(/([0-9]+) of ([0-9]+) voluntary events completed/g, '$1/$2টি নফল নামাজ পড়া হয়েছে')
        .replace(/All five obligatory prayers completed/g, 'পাঁচ ওয়াক্ত ফরজ নামাজ সম্পন্ন')
        .replace(/voluntary events completed/g, 'টি নফল নামাজ পড়া হয়েছে')
        .replace(/prayers/g, 'ওয়াক্ত নামাজ')
        .replace(/Prayer marked complete/g, 'নামাজ পড়া হলো, টিক পড়ল')
        .replace(/Begins at/g, 'শুরু')
        .replace(/Ends at/g, 'শেষ')
        .replace(/begins at/g, 'শুরু')
        .replace(/Saved location/g, 'সংরক্ষিত অবস্থান')
        .replace(/Hanafi/g, 'হানাফি').replace(/Shafi‘i/g, 'শাফেয়ি').replace(/Maliki/g, 'মালেকি').replace(/Hanbali/g, 'হাম্বলি').replace(/Ja‘fari/g, 'জাফরি')
        .replace(/Obsidian/g, 'অবসিডিয়ান').replace(/Midnight/g, 'মিডনাইট').replace(/Forest/g, 'ফরেস্ট').replace(/Burgundy/g, 'বারগান্ডি').replace(/Graphite/g, 'গ্রাফাইট').replace(/Porcelain/g, 'পর্সেলিন').replace(/Ivory/g, 'আইভরি').replace(/Mist Blue/g, 'মিস্ট ব্লু').replace(/Sage/g, 'সেজ').replace(/Rose/g, 'রোজ')
        .replace(/\(dark\)/g, '(গাঢ়)').replace(/\(light\)/g, '(হালকা)')
        .replace(/Current:/g, 'বর্তমান:')
        .replace(/Coordinates found:/g, 'স্থানাঙ্ক পাওয়া গেছে:')
        .replace(/Select Save location to store them on this device\./g, 'এই ডিভাইসে সংরক্ষণ করতে অবস্থান সংরক্ষণ করুন।')
        .replace(/Begins/g, 'শুরু')
        .replace(/No obligatory prayer window is active/g, 'এখন কোনো ফরজ নামাজের ওয়াক্ত চলছে না')
        .replace(/Begins at/g, 'শুরু')
        .replace(/Ends/g, 'শেষ')
        .replace(/prayer countdown/g, 'নামাজের কাউন্টডাউন')
        .replace(/ prayers/g, ' ওয়াক্ত নামাজ')
        .replace(/([0-9]) events/g, '$1টি সময়')
        .replace(/Sahih al-Bukhari/g, 'সহিহ বুখারি').replace(/Sahih Muslim/g, 'সহিহ মুসলিম').replace(/Jami‘ at-Tirmidhi/g, 'জামে তিরমিজি').replace(/Sunan Abi Dawud/g, 'সুনানে আবু দাউদ').replace(/Qur’an/g, 'কুরআন')
        .replace(/Surah al-Baqarah/g, 'সূরা বাকারা').replace(/ \(excerpt\)/g, ' (অংশ)').replace(/ \(opening\)/g, ' (শুরুর অংশ)')
        .replace(/The month \(Rajab or Sha‘ban 2 AH\) is disputed\./g, 'মাসটি (রজব বা শাবান, ২ হিজরি) নিয়ে মতভেদ আছে।').replace(/([0-9]+) and ([0-9]+)/g, '$1 ও $2')
        .replace(/[0-9]/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)]);
    }
    node.nodeValue = original.replace(trimmed, translated);
    LAST_TRANSLATED_TEXT.set(node, node.nodeValue);
  }
  for (const element of document.querySelectorAll('[title], [placeholder]')) {
    for (const attr of ['title','placeholder']) {
      if (!element.hasAttribute(attr)) continue;
      const store = `original${attr[0].toUpperCase()}${attr.slice(1)}`;
      if (!element.dataset[store]) element.dataset[store] = element.getAttribute(attr) || '';
      const original = element.dataset[store];
      element.setAttribute(attr, lang() === 'bn' ? (BN_TEXT[original] || original.replace(/[0-9]/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)])) : original);
    }
  }
  for (const element of document.querySelectorAll('[aria-label]')) {
    if (!element.dataset.originalAriaLabel) element.dataset.originalAriaLabel = element.getAttribute('aria-label') || '';
    const label = element.dataset.originalAriaLabel;
    if (lang() === 'bn') {
      const adjustment = /^(Fajr|Sunrise|Dhuhr|Asr|Maghrib|Isha) adjustment in minutes$/.exec(label);
      element.setAttribute('aria-label', adjustment ? `${BN_TEXT[adjustment[1]] || adjustment[1]} মিনিটে সমন্বয়` : (BN_TEXT[label] || label.replace(/[0-9]/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)])));
    }
    else element.setAttribute('aria-label', label);
  }
}

function render() {
  setLanguage();
  sealLocks();
  currentTimes = getTimes(selectedDate);
  liveTimes = getTimes(startOfDay(new Date()));
  const today = startOfDay(new Date());
  renderProgress();
  renderLiveEvents();
  renderFard(currentTimes);
  renderVoluntary(selectedDate, currentTimes);
  renderCompletedToday();
  applySectionVisibility();
  renderWeeklyReview();
  renderNextPrayer();
  renderSettingsSummary();
  translateRenderedText();
  updateTrayTooltip();
  armBoundary();
}

/* Forbidden-time card (v1.3.3). Shown ONLY while a prohibited interval is in progress: there is no
   advance notice and an interval is never a "Next event" target (see src/forbidden-times.js). */
function forbiddenCardHtml(item) {
  const bn = lang() === 'bn';
  const school = state.profile.school;
  const label = PROHIBITED_LABELS[item.key][bn ? 'bn' : 'en'];
  const nb = value => String(value).replace(/ /g, '\u00a0');
  const until = nb(fmt(new Date(item.end)));
  const range = `${nb(fmt(new Date(item.start)))} – ${until}`;
  const kind = school === 'jafari' ? (bn ? 'মাকরুহ সময়' : 'DISLIKED TIME') : (bn ? 'নিষিদ্ধ সময়' : 'FORBIDDEN TIME');
  let main, detail = '';
  if (school === 'jafari') {
    main = bn ? `${until} পর্যন্ত নফল নামাজ শুরু করা মাকরুহ` : `Starting voluntary prayers is disliked until ${until}`;
    detail = bn ? 'ফরজ নামাজের বিধান মাযহাবভেদে ভিন্ন হতে পারে।' : 'Rules for obligatory prayers differ by school.';
  } else if (school !== 'hanafi') {
    main = bn ? `${until} পর্যন্ত নফল নামাজ পড়া নিষেধ` : `Voluntary prayers are not allowed until ${until}`;
    detail = bn ? 'এই সময়ে নফল নামাজের বিধান অনুসরণ করুন।' : 'Follow the school-specific ruling for voluntary prayers during this interval.';
  } else {
    main = bn ? `${until} পর্যন্ত নামাজ পড়া নিষেধ` : `Praying is not allowed until ${until}`;
    if (item.key === 'sunset') detail = bn ? 'শুধু আজকের অনাদায়ী আসর এখন আদায় করা যায়।' : "Only today's Asr, if not yet prayed, may be offered now.";
  }
  const lead = `${bn ? kind : kind} · ${bn ? label : label.toUpperCase()}`;
  return `<div class="forbidden-card" role="status" data-prohibited="${item.key}"><div class="forbidden-main"><div class="forbidden-type">${escapeHtml(lead)}</div><strong class="forbidden-line">${escapeHtml(main)}</strong><small class="forbidden-range">${escapeHtml(range)}</small>${detail ? `<small class="forbidden-detail">${escapeHtml(detail)}</small>` : ''}</div><div class="forbidden-left-box"><span>${bn ? 'শেষ হতে বাকি' : 'ENDS IN'}</span><b class="forbidden-left" data-live-countdown="true" data-until="${item.end}">${countdown(item.end - Date.now())}</b></div></div>`;
}

/** Prohibited intervals in progress at `now` (from the neighbouring days too, so midnight-spanning edges stay right). */
function activeProhibited(now) {
  const today = startOfDay(now);
  return activeIntervals([-1, 0, 1].flatMap(offset => prohibitedIntervals(getTimes(addDays(today, offset)))), now);
}

function liveHeadingText(active) {
  const bn = lang() === 'bn';
  if (!active.length) return bn ? 'এখনকার নামাজ' : 'Prayer events';
  return state.profile.school === 'jafari' ? (bn ? 'মাকরুহ সময়' : 'Disliked time') : (bn ? 'নিষিদ্ধ সময়' : 'Forbidden time');
}

function eventHasActionableComponents(event, now = new Date()) {
  const record = dayRecord(event.date, false);
  if (event.kind === 'voluntary') return !record.voluntary?.[event.key];
  if (!record.fard?.[event.key]) return true;
  if (shiaMode()) return false;
  return prayerParts(event.key).some(part => part.layer !== 'fard' && part.slot.position === 'after' && !record[part.layer]?.[part.slot.key] && subPrayerAvailability(part.layer, part.slot.key, event.key, event.date, now).available);
}

function renderLiveEvents() {
  const box = $('liveEvents');
  box.innerHTML = '';
  const now = new Date();
  const events = getActiveEvents(now).filter(event => eventHasActionableComponents(event, now));
  const forbidden = activeProhibited(now);
  const heading = $('liveHeading');
  if (heading) heading.textContent = liveHeadingText(forbidden);
  box.classList.toggle('is-forbidden', forbidden.length > 0);
  box.dataset.count = String(Math.max(1, events.length + forbidden.length));
  const intervalRows = forbidden.map(forbiddenCardHtml).join('');
  if (!events.length) {
    // The calm empty state only appears when nothing else is shown; the next event lives in the hero card below, so it is not repeated here.
    const bnEmpty = lang() === 'bn';
    box.innerHTML = intervalRows || `<div class="live-empty"><span class="empty-mark">✦</span><div><strong>${bnEmpty ? 'এখন কোনো নামাজের সময় চলছে না।' : 'No prayer event is currently in its time window.'}</strong><small>${bnEmpty ? 'এরপরেরটা নিচের কার্ডে দেখা যাচ্ছে।' : 'The next event is shown just below.'}</small></div></div>`;
    translateRenderedText();
    return;
  }
  for (const event of events) {
    const record = dayRecord(event.date, false);
    const done = !!record[event.kind]?.[event.key];
    const lockText = done ? lockTipFor(event.kind, event.key, event.date) : '';
    const item = document.createElement('article');
    item.className = `live-event ${event.kind === 'voluntary' ? 'voluntary' : 'obligatory'}${done ? ' is-done' : ''}`;
    const kindLabel = event.kind === 'fard' ? 'OBLIGATORY' : 'VOLUNTARY';
    const displayName = slotName(event.key, event.date);
    const eventGuidance = event.key === 'dhuhr' && event.date.getDay() === 5 ? PRAYER_GUIDANCE.jumuah : PRAYER_GUIDANCE[event.key];
    item.innerHTML = `
      <div class="live-event-main">
        <div class="live-event-type">${kindLabel}</div>
        <button class="live-name" type="button" data-live-description="${event.key}" aria-expanded="false">${escapeHtml(displayName)}</button>
        <small>${escapeHtml(fmt(event.start))} – ${escapeHtml(fmt(event.end))}</small>
        <small class="live-rakah">${escapeHtml(eventGuidance && !shiaMode() ? (lang()==='bn'?eventGuidance.bn:eventGuidance.rakahs) : '')}</small>
      ${event.kind === 'fard' ? partsHtml(event.key, event.date, true, { includeFard: false }) : ''}
      <div class="live-prayer-detail" data-live-detail="${event.key}" hidden>${referenceCardHtml(event.key, displayName, event.date)}</div></div>
      <div class="live-event-actions">
        <button class="event-countdown" type="button" data-event-countdown="true" data-kind="${event.kind}" data-key="${event.key}" data-date="${dateKey(event.date)}" data-start="${event.start.getTime()}" data-end="${event.end.getTime()}"><span>${Date.now() < event.end.getTime() ? 'TIME LEFT' : 'RECORD AVAILABLE'}</span><strong data-live-countdown="true" data-until="${Math.max(event.end.getTime(), Date.now())}">${Date.now() < event.end.getTime() ? countdown(event.end.getTime() - Date.now()) : '—'}</strong></button>
        <button class="round-check layer-${layerOf(event.kind, event.key)}${lockText ? ' is-locked' : ''}" type="button" data-live-kind="${event.kind}" data-live-key="${event.key}" data-live-date="${dateKey(event.date)}" aria-label="${lang()==='bn' ? `${escapeHtml(prayerName(event.key))} সম্পন্ন হিসেবে চিহ্নিত করুন` : `Mark ${escapeHtml(prayerName(event.key))} complete`}" aria-pressed="${done}"${lockText ? ` aria-disabled="true" title="${escapeHtml(lockText)}"` : ''}>${done ? '✓' : ''}${lockText ? lockMarkHtml(lockText, true) : ''}</button>
      </div>`;
    box.append(item);
  }
  if (intervalRows) box.insertAdjacentHTML('afterbegin', intervalRows);
  box.querySelectorAll('[data-live-kind]').forEach(button => button.addEventListener('click', () => {
    togglePrayer(button.dataset.liveKind, button.dataset.liveKey, button.dataset.liveDate);
  }));
  box.querySelectorAll('[data-live-description]').forEach(button => button.addEventListener('click', () => {
    const detail = button.parentElement.querySelector(`[data-live-detail="${button.dataset.liveDescription}"]`);
    if (!detail) return;
    detail.hidden = !detail.hidden;
    button.setAttribute('aria-expanded', String(!detail.hidden));
  }));
  box.querySelectorAll('[data-event-countdown]').forEach(button => button.addEventListener('click', () => openEventCountdown(button.dataset)));
  translateRenderedText();
}

function rakahInfoForProfile(key, guidance, date = selectedDate) {
  const profileSchool = state.profile.school;
  const isJumuah = key === 'dhuhr' && date.getDay() === 5;
  const infoKey = isJumuah ? 'jumuah' : key;
  if (profileSchool === 'hanafi') return lang() === 'bn' ? guidance.bn : guidance.rakahs;
  if (shiaMode()) {
    const jafari = {
      witr: ['1 rak‘ah; the closing rak‘ah of the night prayer.', '১ রাকাত; রাতের নামাজের শেষ রাকাত।'],
      tahajjud: ['11 rak‘ahs total: 8 night-prayer rak‘ahs, 2 Shaf‘ and 1 Witr.', 'মোট ১১ রাকাত: ৮ রাকাত রাতের নফল, ২ রাকাত শাফ‘ এবং ১ রাকাত বিতর।'],
      qiyam: ['The full Ja‘fari night prayer is 11 rak‘ahs: 8 + 2 Shaf‘ + 1 Witr.', 'জাফরি রাতের পূর্ণ নামাজ ১১ রাকাত: ৮ + ২ শাফ‘ + ১ বিতর।'],
      rawatib: ['34 daily Nafilah rak‘ahs: 8 before Zuhr, 8 before Asr, 4 after Maghrib, 1 standing-equivalent after Isha, 11 at night and 2 before Fajr.', 'দৈনিক ৩৪ রাকাত নফল: যোহরের আগে ৮, আসরের আগে ৮, মাগরিবের পরে ৪, ইশার পরে বসে ২ (দাঁড়িয়ে ১-এর সমান), রাতে ১১ এবং ফজরের আগে ২।'],
      eid_prayer: ['2 rak‘ahs. The Ja‘fari form has additional takbirs and qunut; details follow your Marja‘.', '২ রাকাত। জাফরি পদ্ধতিতে অতিরিক্ত তাকবির ও কুনুত রয়েছে; আপনার মারজার নির্দেশনা অনুসরণ করুন।'],
      istikhara: ['2 rak‘ahs when performed as Salat al-Istikhara; other Ja‘fari istikhara methods also exist.', 'সালাতুল ইস্তিখারা হিসেবে আদায় করলে ২ রাকাত; জাফরি পদ্ধতিতে অন্য ইস্তিখারার ধরনও রয়েছে।'],
      tawbah: ['2 rak‘ahs for the commonly described repentance prayer; follow your Marja‘ for its form.', 'প্রচলিত তওবার নামাজে ২ রাকাত; পদ্ধতির জন্য আপনার মারজার নির্দেশনা অনুসরণ করুন।'],
      tahiyyatul_masjid: ['2 rak‘ahs, where this prayer is observed in your Ja‘fari practice.', 'আপনার জাফরি আমলে এ নামাজ থাকলে ২ রাকাত।']
    };
    if (infoKey === 'jumuah') return lang() === 'bn' ? 'শর্ত পূরণ হলে জামাতে ২ রাকাত জুমা; অন্যথায় ৪ রাকাত যোহর।' : '2 Jumu‘ah rak‘ahs in congregation when its conditions are met; otherwise 4 Dhuhr rak‘ahs.';
    if (FARD_RAKAHS[infoKey]) return lang() === 'bn' ? `${localizeDigits(FARD_RAKAHS[infoKey])} রাকাত ফরজ` : `${FARD_RAKAHS[infoKey]} obligatory rak‘ahs`;
    if (jafari[infoKey]) return jafari[infoKey][lang() === 'bn' ? 1 : 0];
    return lang() === 'bn' ? 'রাকাতসংখ্যা ও পদ্ধতি জাফরি ফিকহ এবং আপনার মারজার নির্দেশনা অনুযায়ী অনুসরণ করুন।' : 'Follow the rak‘ah count and form established by your Ja‘fari Marja‘.';
  }
  if (infoKey === 'jumuah') return lang() === 'bn' ? 'ইমামের সঙ্গে ২ রাকাত ফরজ; শর্ত পূরণ না হলে যোহর ৪ রাকাত।' : '2 Fard rak‘ahs with the imam when Jumu‘ah conditions are met; otherwise Dhuhr is 4.';
  if (FARD_RAKAHS[infoKey]) return lang() === 'bn'
    ? `${localizeDigits(FARD_RAKAHS[infoKey])} রাকাত ফরজ; সংশ্লিষ্ট সুন্নাত ও নফলের বিন্যাস নির্বাচিত মাজহাব অনুযায়ী।`
    : `${FARD_RAKAHS[infoKey]} Fard rak‘ahs; associated Sunnah and Nafl arrangements follow the selected school.`;
  const sunni = {
    eid_prayer: ['2 rak‘ahs; the additional-takbir arrangement differs by school.', '২ রাকাত; অতিরিক্ত তাকবিরের বিন্যাস মাজহাবভেদে ভিন্ন।'],
    tarawih: ['8 or 20 rak‘ahs are widely practised; the total and details vary by school and community.', '৮ বা ২০ রাকাত প্রচলিত; মোট রাকাত ও পদ্ধতি মাজহাব ও এলাকাভেদে ভিন্ন।'],
    witr: ['An odd-numbered prayer; 1 or 3 rak‘ahs and the form vary by school.', 'বেজোড় রাকাত; ১ বা ৩ রাকাতসহ পদ্ধতি মাজহাবভেদে ভিন্ন।'],
    rawatib: ['10 or 12 regular Sunnah rak‘ahs are commonly reported; the count and emphasis differ by school.', '১০ বা ১২ রাকাত নিয়মিত সুন্নাত প্রচলিত; সংখ্যা ও গুরুত্ব মাজহাবভেদে ভিন্ন।'],
    duha: ['2 or more rak‘ahs; reports and scholarly recommendations commonly mention a range up to 12.', '২ বা ততোধিক রাকাত; বর্ণনা ও আলেমদের সুপারিশে ১২ পর্যন্ত উল্লেখ আছে।'],
    qiyam: ['Prayed in sets of 2 rak‘ahs; no single fixed maximum is established.', 'প্রতি ২ রাকাত করে আদায় করা হয়; নির্দিষ্ট সর্বোচ্চ সংখ্যা নেই।'],
    tahajjud: ['Prayed in sets of 2 rak‘ahs; the total varies with ability and practice.', 'প্রতি ২ রাকাত করে আদায় করা হয়; সামর্থ্য ও আমল অনুযায়ী মোট সংখ্যা ভিন্ন।'],
    awwabin: ['Prayed in sets of 2; the recommended total differs among scholarly traditions.', 'প্রতি ২ রাকাত করে; সুপারিশকৃত মোট সংখ্যা আলেমদের মতভেদে ভিন্ন।'],
    istikhara: ['2 rak‘ahs when performed as Salat al-Istikhara.', 'সালাতুল ইস্তিখারা হিসেবে আদায় করলে ২ রাকাত।'],
    tawbah: ['2 rak‘ahs for the commonly described repentance prayer.', 'প্রচলিত তওবার নামাজে ২ রাকাত।'],
    tahiyyatul_masjid: ['2 rak‘ahs.', '২ রাকাত।']
  };
  if (sunni[infoKey]) return sunni[infoKey][lang() === 'bn' ? 1 : 0];
  return lang() === 'bn' ? `${guidance.bn} নির্বাচিত মাজহাবের স্থানীয় আমল অনুসরণ করুন।` : `${guidance.rakahs}. Follow the selected school’s established practice where details differ.`;
}

function rakahSourceForProfile(key) {
  if (!shiaMode() || !['rawatib','qiyam','tahajjud','witr','eid_prayer','jumuah'].includes(key)) return '';
  const source = key === 'eid_prayer' ? 'Sistani, Islamic Laws — Eid prayers; confirm details with your own Marja‘.' : key === 'jumuah' ? 'Sistani, Islamic Laws — Friday prayer; confirm conditions with your own Marja‘.' : 'Sistani, Islamic Laws — recommended daily prayers; confirm details with your own Marja‘.';
  return lang() === 'bn' ? `জাফরি ফিকহের সূত্র: ${source}` : `Ja‘fari fiqh reference: ${source}`;
}

function referenceCardHtml(key, titleText, date = selectedDate) {
  const bn = lang() === 'bn';
  const guidanceKey = key === 'dhuhr' && date.getDay() === 5 ? 'jumuah' : key;
  const guidance = PRAYER_GUIDANCE[guidanceKey] || PRAYER_GUIDANCE[key];
  if (!guidance) return '';
  const school = shiaMode() ? 'jafari' : state.profile.school;
  const evidence = evidenceFor(guidanceKey, school, lang());
  const evidenceItems = evidence?.items || [];
  const description = bn ? guidance.guideBn : guidance.guide;
  const source = bn ? guidance.sourceBn : guidance.source;
  const rakahs = rakahInfoForProfile(key, guidance, date);
  const rakahSource = rakahSourceForProfile(guidanceKey);
  const evidenceHtml = evidenceItems.length ? `<div class="ref-evidence"><h5>${bn ? 'কুরআন ও হাদিসের দলিল' : 'Qur’an and Hadith evidence'}</h5><ul>${evidenceItems.map(item => {
    const isSahihCollection = /Bukhari|Muslim/i.test(item.ref || '');
    const auth = item.kind === 'hadith' ? (isSahihCollection ? (bn ? 'সহিহ সংকলন' : 'Sahih collection') : (bn ? 'এই সংস্করণে পৃথক গ্রেড দেওয়া নেই' : 'No separate grading is included in this local reference')) : '';
    return `<li><span class="ref-kind">${item.kind === 'quran' ? (bn ? 'কুরআন' : 'Qur’an') : (bn ? 'হাদিস' : 'Hadith')}</span> ${escapeHtml(item.text)} <small class="ref-source">${escapeHtml(item.ref)}</small>${auth ? `<small class="ref-auth">${escapeHtml(auth)}</small>` : ''}</li>`;
  }).join('')}</ul>${evidence.note ? `<p class="ref-note">${escapeHtml(evidence.note)}</p>` : ''}</div>` : `<p class="ref-source">${escapeHtml(source)}</p>`;
  return `<article class="ref-card" data-description-id="${escapeHtml(key)}"><h4>${escapeHtml(titleText)}</h4><p>${escapeHtml(description)}</p>${prayerNoteHtml(guidanceKey)}<p class="ref-rakahs"><strong>${bn ? 'রাকাত' : 'Rak‘ahs'}:</strong> ${escapeHtml(rakahs)}</p>${rakahSource ? `<small class="source-note">${escapeHtml(rakahSource)}</small>` : ''}${evidenceHtml}</article>`;
}

function completedPartsHtml(key, date) {
  const record = dayRecord(date, false);
  const parts = prayerParts(key).filter(part => !shiaMode() || part.layer === 'fard');
  return `<div class="completed-parts">${parts.map(part => {
    const done = part.layer === 'fard' ? !!record.fard?.[key] : !!record[part.layer]?.[part.slot.key];
    const label = part.layer === 'fard' ? fardPartLabel(key, date, lang()) : slotLabel(part.slot, lang());
    return `<span class="completed-part${done ? ' is-done' : ''}"><i aria-hidden="true">${done ? '✓' : '○'}</i>${escapeHtml(label)}</span>`;
  }).join('')}</div>`;
}

function renderCompletedToday() {
  const root = $('completedTodayList');
  if (!root) return;
  const date = progressDate(new Date());
  const record = dayRecord(date, false);
  const events = [...getFardEvents(date), ...getVoluntaryEvents(date)].sort((a, b) => a.start - b.start);
  const completed = events.filter(event => {
    if (event.kind === 'voluntary') return !!record.voluntary?.[event.key];
    if (!record.fard?.[event.key]) return false;
    return prayerParts(event.key).filter(part => !shiaMode() || part.layer === 'fard').every(part => part.layer === 'fard' ? !!record.fard?.[event.key] : !!record[part.layer]?.[part.slot.key]);
  });
  $('completedTodayCount').textContent = `${completed.length} ${completed.length === 1 ? 'completed event' : 'completed events'}`;
  root.innerHTML = '';
  if (!completed.length) {
    root.innerHTML = `<div class="completed-today-empty">${lang() === 'bn' ? 'আজ এখনো কোনো নামাজের সব প্রযোজ্য অংশ সম্পন্ন হয়নি।' : 'No prayer event has all its applicable parts completed yet today.'}</div>`;
    return;
  }
  for (const event of completed) {
    const title = slotName(event.key, date);
    const locked = lockState(event.kind, event.key, date).locked;
    const card = document.createElement('article');
    card.className = `completed-event-card ${event.kind === 'fard' ? 'completed-fard' : isSeasonal(event.key) ? 'completed-special' : 'completed-voluntary'}`;
    const details = referenceCardHtml(event.key, title, date);
    card.innerHTML = `<div class="completed-event-head"><button class="completed-event-title" type="button" aria-expanded="false" data-completed-title="${event.kind}:${event.key}"><strong>${escapeHtml(title)}</strong><small>${event.kind === 'fard' ? (lang() === 'bn' ? 'ফরজ নামাজ' : 'Obligatory prayer') : (lang() === 'bn' ? 'নফল নামাজ' : 'Voluntary prayer')} · ${escapeHtml(fmt(event.start))}</small></button><div class="completed-event-action">${locked ? lockMarkHtml(lockTipFor(event.kind, event.key, date)) : `<button class="completed-undo" type="button" data-completed-undo="${event.kind}:${event.key}" aria-label="Undo ${escapeHtml(title)}">Undo</button>`}</div></div>${event.kind === 'fard' ? completedPartsHtml(event.key, date) : ''}<div class="completed-event-detail" data-completed-detail="${event.kind}:${event.key}" hidden>${details}</div>`;
    root.append(card);
  }
  root.querySelectorAll('[data-completed-title]').forEach(button => button.addEventListener('click', () => {
    const detail = root.querySelector(`[data-completed-detail="${button.dataset.completedTitle}"]`);
    if (!detail) return;
    detail.hidden = !detail.hidden;
    button.setAttribute('aria-expanded', String(!detail.hidden));
  }));
  root.querySelectorAll('[data-completed-undo]').forEach(button => button.addEventListener('click', () => {
    const [kind, key] = button.dataset.completedUndo.split(':');
    togglePrayer(kind, key, dateKey(date));
  }));
}

function renderFard(times) {
  const grid = $('prayerGrid');
  grid.innerHTML = '';
  if (!times) return;
  const record = dayRecord(selectedDate, false);
  const today = dateKey(selectedDate) === dateKey(new Date());
  const active = today ? getActiveEvents().find(event => event.kind === 'fard' && dateKey(event.date) === dateKey(selectedDate))?.key : null;
  const dayEvents = today ? getFardEvents(startOfDay(selectedDate), times, getTimes(addDays(startOfDay(selectedDate), 1))) : [];
  for (const prayer of FARD) {
    const card = document.createElement('article');
    const done = !!record.fard?.[prayer.key];
    const event = dayEvents.find(item => item.key === prayer.key);
    const reference = referenceCardHtml(prayer.key, prayer.key === 'dhuhr' && selectedDate.getDay() === 5 ? 'Jumu‘ah' : text(prayer), selectedDate);
    card.className = `prayer-card category-fard${done ? ' done' : ''}${active === prayer.key ? ' active' : ''}`;
    card.innerHTML = `<div class="prayer-card-head"><button class="prayer-name-button" type="button" data-prayer-title="${prayer.key}" aria-expanded="false">${escapeHtml(isFridayDhuhr(prayer.key, selectedDate) ? slotName(prayer.key, selectedDate) : text(prayer))}</button><span class="prayer-index">${String(FARD.indexOf(prayer) + 1).padStart(2, '0')}</span></div><div class="prayer-time">${escapeHtml(fmt(times[prayer.key]))}</div><div class="prayer-status">${done ? (lang()==='bn'?'সম্পন্ন':'Completed') : (lang()==='bn'?'ফরজ নামাজ':'Obligatory prayer')}${done && lockTipFor('fard', prayer.key, selectedDate) ? lockMarkHtml(lockTipFor('fard', prayer.key, selectedDate)) : ''}</div><div class="prayer-eta-wrap">${event ? `<button class="prayer-eta" type="button" data-eta="${prayer.key}" data-event-countdown="true" data-kind="fard" data-key="${prayer.key}" data-date="${dateKey(selectedDate)}" data-start="${event.start.getTime()}" data-end="${event.end.getTime()}" aria-label="Open ${escapeHtml(prayerName(prayer.key))} countdown" hidden></button>` : ''}</div><div class="prayer-card-detail" data-prayer-detail="${prayer.key}" hidden>${reference}</div>`;
    grid.append(card);
  }
  grid.querySelectorAll('[data-prayer-title]').forEach(button => button.addEventListener('click', () => {
    const detail = grid.querySelector(`[data-prayer-detail="${button.dataset.prayerTitle}"]`);
    if (!detail) return;
    detail.hidden = !detail.hidden;
    button.setAttribute('aria-expanded', String(!detail.hidden));
  }));
  grid.querySelectorAll('[data-event-countdown]').forEach(button => button.addEventListener('click', () => openEventCountdown(button.dataset)));
  updateCardCountdowns();
}

function updateCardCountdowns(now = new Date()) {
  const today = startOfDay(now);
  const events = dateKey(selectedDate) === dateKey(today) ? [...getFardEvents(today), ...getVoluntaryEvents(today)] : [];
  const tomorrowTimes = getTimes(addDays(today, 1));
  const times = getTimes(today);
  const recordableEvents = getActiveEvents(now);
  document.querySelectorAll('[data-live-event-countdown]').forEach(el => {
    const event = events.find(item => item.kind === el.dataset.kind && item.key === el.dataset.key && dateKey(item.date) === el.dataset.date);
    const recordable = event && recordableEvents.some(item => item.kind === event.kind && item.key === event.key && dateKey(item.date) === dateKey(event.date));
    const result = event ? cardCountdown({ now, start:event.start, end:event.end, lang:lang() }) : { kind:'passed', text:'' };
    const display = result.text || (recordable ? (lang() === 'bn' ? 'রেকর্ড করা যাবে' : 'Recording available') : '');
    const value = el.querySelector('strong');
    if (value && el.dataset.etaText !== display) { el.dataset.etaText = display; value.textContent = display; }
    const eventDate = event?.date || today;
    const eventTimes = getTimes(eventDate), nextEventTimes = getTimes(addDays(eventDate, 1));
    const best = event ? bestTimeWindow(event, { maghrib:eventTimes?.maghrib, fajr:nextEventTimes?.fajr }) : null;
    const bestState = bestTimeState(best, now.getTime());
    el.classList.toggle('is-current', result.kind === 'current');
    el.classList.toggle('is-best-time', bestState.state === 'active');
    el.hidden = !display;
  });
  document.querySelectorAll('.prayer-eta[data-eta]').forEach(el => {
    const event = events.find(item => item.key === el.dataset.eta);
    const result = event ? cardCountdown({ now, start: event.start, end: event.end, lang: lang() }) : { kind: 'passed', text: '' };
    const recordable = event && recordableEvents.some(item => item.kind === 'fard' && item.key === event.key && dateKey(item.date) === dateKey(event.date));
    const display = result.text || (recordable ? (lang() === 'bn' ? 'রেকর্ড করা যাবে' : 'Recording available') : '');
    if (el.dataset.etaText !== display) { el.dataset.etaText = display; el.textContent = display; }
    const best = event ? bestTimeWindow(event, { maghrib: times?.maghrib, fajr: tomorrowTimes?.fajr }) : null;
    const bestState = bestTimeState(best, now.getTime());
    el.classList.toggle('is-current', result.kind === 'current');
    el.classList.toggle('is-best-time', bestState.state === 'active');
    el.hidden = !display;
  });
}

function renderVoluntary(date, times) {
  if (!times) return;
  const allEvents = getVoluntaryEvents(date, times, getTimes(addDays(date, 1)));
  const daily = allEvents.filter(event => !DATE_SPECIFIC_VOLUNTARY.includes(event.key));
  const now = new Date();
  const todaySelected = dateKey(date) === dateKey(now);
  const recordableSpecial = todaySelected ? getActiveEvents(now) : [];
  const special = allEvents.filter(event => DATE_SPECIFIC_VOLUNTARY.includes(event.key) && (!todaySelected || (now >= event.start && now < event.end) || recordableSpecial.some(item => item.kind === 'voluntary' && item.key === event.key && dateKey(item.date) === dateKey(event.date))));
  $('voluntaryCount').textContent = `${daily.length + 1} ${daily.length === 0 ? 'prayer cards' : 'prayer cards'}`;
  const record = dayRecord(date, false);
  const buildEventCard = (event, category) => {
    const done = !!record.voluntary?.[event.key];
    const definition = VOLUNTARY.find(item => item.key === event.key);
    const guidance = PRAYER_GUIDANCE[event.key];
    const reference = referenceCardHtml(event.key, prayerName(event.key), date).replace(/ id="description-/g, ' data-description-id="');
    const card = document.createElement('article');
    card.className = `voluntary-item ${category}${done ? ' done' : ''}`;
    card.innerHTML = `<div class="voluntary-card-head"><button class="voluntary-title" type="button" aria-expanded="false" data-voluntary-title="${event.key}"><strong>${escapeHtml(prayerName(event.key))}</strong><small>${escapeHtml(fmt(event.start))} – ${escapeHtml(fmt(event.end))}${done ? (lang() === 'bn' ? ' · সম্পন্ন' : ' · Completed') : ''}</small></button><button class="event-countdown voluntary-countdown" type="button" data-event-countdown="true" data-live-event-countdown data-kind="voluntary" data-key="${event.key}" data-date="${dateKey(event.date)}" data-start="${event.start.getTime()}" data-end="${event.end.getTime()}"><span>TIME</span><strong>${escapeHtml(cardCountdown({ now: new Date(), start: event.start, end: event.end, lang: lang() }).text || '—')}</strong></button></div><div class="voluntary-detail" data-voluntary-detail="${event.key}" hidden>${guidance ? reference : escapeHtml(definition?.desc || '')}</div>`;
    return card;
  };
  const dailyBox = $('dailyVoluntaryList');
  dailyBox.innerHTML = '';
  if (!daily.length) dailyBox.innerHTML = '<div class="voluntary-empty">No daily voluntary prayer period is scheduled for this date.</div>';
  else daily.forEach(event => dailyBox.append(buildEventCard(event, 'daily-voluntary-card')));
  const rawatib = PRAYER_GUIDANCE.rawatib;
  if (rawatib) {
    const rawatibCard = document.createElement('article');
    rawatibCard.className = 'voluntary-item daily-voluntary-card rawatib-reference-card';
    rawatibCard.innerHTML = `<button class="voluntary-title" type="button" aria-expanded="false" data-voluntary-title="rawatib"><strong>Regular Sunnah (Rawatib)</strong><small>Attached to the five obligatory prayers</small></button><div class="voluntary-detail" data-voluntary-detail="rawatib" hidden><p>${escapeHtml(lang() === 'bn' ? rawatib.guideBn : rawatib.guide)}</p><p class="rakah-line"><strong>${escapeHtml(rakahInfoForProfile('rawatib', rawatib, date))}</strong></p><small class="source-note">${escapeHtml(lang() === 'bn' ? rawatib.sourceBn : rawatib.source)}</small>${referenceCardHtml('rawatib', 'Regular Sunnah (Rawatib)', date)}</div>`;
    dailyBox.append(rawatibCard);
  }
  const specialBox = $('specialDayPrayerList');
  specialBox.innerHTML = '';
  if (!special.length) specialBox.innerHTML = '<div class="voluntary-empty">No special-day prayer event applies to this date.</div>';
  else special.forEach(event => specialBox.append(buildEventCard(event, 'special-day-prayer-card')));
  const situationalBox = $('situationalVoluntaryList');
  situationalBox.innerHTML = '';
  const situational = ['tahiyyatul_masjid', 'istikhara', 'tawbah'];
  for (const key of situational) {
    const guidance = PRAYER_GUIDANCE[key];
    if (!guidance) continue;
    const title = prayerName(key);
    const reference = referenceCardHtml(key, title, date).replace(/ id="description-/g, ' data-description-id="');
    const card = document.createElement('article');
    card.className = 'voluntary-item situational-prayer-card';
    card.innerHTML = `<button class="voluntary-title" type="button" aria-expanded="false" data-voluntary-title="${key}"><strong>${escapeHtml(title)}</strong><small>${lang() === 'bn' ? 'পরিস্থিতি অনুযায়ী' : 'When the circumstance applies'}</small></button><div class="voluntary-detail" data-voluntary-detail="${key}" hidden>${reference}</div>`;
    situationalBox.append(card);
  }
  document.querySelectorAll('[data-voluntary-title]').forEach(button => button.addEventListener('click', () => {
    const detail = document.querySelector(`[data-voluntary-detail="${button.dataset.voluntaryTitle}"]`);
    if (!detail) return;
    detail.hidden = !detail.hidden;
    button.setAttribute('aria-expanded', String(!detail.hidden));
  }));
  document.querySelectorAll('.voluntary-countdown[data-event-countdown]').forEach(button => button.addEventListener('click', () => openEventCountdown(button.dataset)));
}

const DATE_SPECIFIC_VOLUNTARY = ['eid_prayer', 'tarawih'];

/* Before Fajr, the active prayer day is still the previous civil date
   (Isha, Witr, Qiyam and Tahajjud belong to it), so Today's progress follows it. */
function progressDate(now = new Date()) {
  const today = startOfDay(now);
  const times = getTimes(today);
  return times?.fajr && now < times.fajr ? addDays(today, -1) : today;
}

/* Layered state for one prayer day, in prayer-time order on every ring:
   white Fard, green Sunnah, black Nafl, striped standalone voluntary and
   (on days that have them) saffron date-specific prayers. */
function dayLayers(day) {
  const record = dayRecord(day, false);
  const fardFlags = FARD.map(prayer => !!record.fard?.[prayer.key]);
  const fardDone = fardFlags.filter(Boolean).length;
  const events = getVoluntaryEvents(day);
  const { standalone, seasonal } = splitVoluntary(events);
  const voluntaryFlags = standalone.map(event => !!record.voluntary?.[event.key]);
  const seasonalFlags = seasonal.map(event => !!record.voluntary?.[event.key]);
  const doneFlags = events.map(event => !!record.voluntary?.[event.key]);
  const voluntaryDone = doneFlags.filter(Boolean).length;
  // The green/black rings follow the Hanafi rawatib; in Ja'fari mode they are not drawn or required.
  const empty = { flags: [], done: 0, total: 0, complete: false };
  const sunnah = shiaMode() ? empty : layerState(record, 'sunnah');
  const nafl = shiaMode() ? empty : layerState(record, 'nafl');
  const flags = { fard: fardFlags, sunnah: sunnah.flags, nafl: nafl.flags, voluntary: voluntaryFlags, seasonal: seasonalFlags };
  const count = list => ({ done: list.filter(Boolean).length, total: list.length });
  const summary = progressSummary({ fard: count(fardFlags), sunnah: count(sunnah.flags), nafl: count(nafl.flags), voluntary: count(voluntaryFlags), seasonal: count(seasonalFlags) });
  return { record, fardDone, events, standalone, seasonal, doneFlags, voluntaryDone, totalVoluntary: events.length, sunnah, nafl, flags, summary };
}

/** Which progress layer a tick belongs to (for colours and sounds). */
function layerOf(kind, key) {
  if (kind === 'fard') return 'fard';
  if (kind === 'voluntary') return isSeasonal(key) ? 'seasonal' : 'voluntary';
  return kind === 'sunnah' || kind === 'nafl' ? kind : 'voluntary';
}

// Last rendered figure state, so only a newly ticked segment sweeps and only
// a ring that has just closed glows in.
let lastFigure = { day: '', flags: null, reward: false };

/* Calculation profile selects (method, school, high-latitude rule), bilingual. */
function renderProfileSettings() {
  const bn = lang() === 'bn';
  const fill = (id, table, value) => {
    const select = $(id);
    if (!select) return;
    select.innerHTML = Object.entries(table).map(([key, item]) => `<option value="${key}">${escapeHtml(bn ? item.bn : item.en)}</option>`).join('');
    select.value = value;
  };
  fill('methodSelect', CALCULATION_METHODS, state.profile.method);
  fill('schoolSelect', SCHOOLS, state.profile.school);
  fill('highLatSelect', HIGH_LATITUDE_RULES, state.profile.highLatitude);
  const method = CALCULATION_METHODS[state.profile.method];
  const summary = $('profileSummary');
  if (summary) summary.textContent = `${state.profile.method === 'karachi' ? 'Karachi' : method.en.split(' (')[0]} · ${SCHOOL_SHORT[state.profile.school]}`;
  const note = $('profileNote');
  if (note) {
    note.textContent = shiaMode()
      ? (bn ? 'জাফরি মোড: মাগরিব পূর্ব আকাশের লালিমা মিলিয়ে যাওয়ার পর (কোণভিত্তিক), আসর এক গুণ ছায়ায়, এশার শেষ মধ্যরাতে (সূর্যাস্ত ও ফজরের মাঝামাঝি)। যোহর-আসর এবং মাগরিব-এশা একসাথে আদায় করা যায়। হানাফি সুন্নাত/বিতর নির্দেশনা এ মোডে লুকানো থাকে।'
        : 'Ja‘fari mode: Maghrib after the eastern redness disappears (angle-based), Asr at shadow factor 1, Isha ends at midnight (halfway between sunset and Fajr). Dhuhr with Asr and Maghrib with Isha may be combined. Hanafi Sunnah/Witr guidance is hidden in this mode.')
      : (bn ? 'ম্যানুয়াল মিনিট সমন্বয় নির্বাচিত পদ্ধতির ওপর প্রয়োগ হয়। পরিবর্তন সঙ্গে সঙ্গে হিসাব হয় এবং এই ডিভাইসে সংরক্ষিত থাকে; ইতিহাস অপরিবর্তিত থাকে।'
        : 'Manual minute adjustments apply on top of the selected method. Changes recompute immediately and are saved on this device; history is not affected.');
  }
}

/* Day-aware status line under Today's Progress (see src/day-status.js). */
function progressStatus(day, fardDone, now = new Date()) {
  const times = getTimes(day);
  return dayStatus({
    lang: lang(),
    shia: shiaMode(),
    weekday: day.getDay(),
    dayHijri: hijriParts(day),
    nightHijri: currentHijriDate(now),
    fardDone,
    maghribTime: times?.maghrib ? fmt(times.maghrib) : null,
    ishaTime: times?.isha ? fmt(times.isha) : null,
    afterMaghrib: !!(times?.maghrib && now >= times.maghrib),
    hasTimes: !!times
  });
}

/* Conversational line for the card (src/progress-lines.js), kept stable between
   events: the chosen line is remembered per situation, and recent lines are
   remembered (capped) so wording stays fresh for weeks. */
const LINE_MEMORY_KEY = 'prayer-times-line-memory';
const LINE_UNIQUENESS_MS = 90 * 24 * 60 * 60 * 1000;
/* Today's Progress line on reopen (v1.3.3). While the window stays visible the line changes only on events.
   Each time it is shown again after being hidden to the tray, ONE new line is chosen (never the one on screen).
   Tauri 2 signals this two ways, and both are handled: the Rust side emits `main-window-shown` / `main-window-hidden`
   (window.hide() on close-to-tray does not reliably raise visibilitychange in WebView2), and the page's own
   visibilitychange / focus events cover minimise and restore. A reopen raises several signals; one wins. */
let pendingLineRefresh = 0;
let lineRefreshCount = 0;
let hadPreviousProgressLine = false;
let windowWasHidden = false;
let lastReopenAt = 0;
function onWindowReopened(source) {
  if (source !== 'rust' && !windowWasHidden) return; // plain focus changes while visible never change the line
  const now = Date.now();
  windowWasHidden = false;
  if (now - lastReopenAt < 2000) return;
  lastReopenAt = now;
  pendingLineRefresh = ++lineRefreshCount;
  renderProgress();
  pendingLineRefresh = 0;
}

function readLineMemory() {
  try {
    const m = JSON.parse(localStorage.getItem(LINE_MEMORY_KEY) || '{}');
    const now = Date.now();
    const recentAt = m.recentAt && typeof m.recentAt === 'object' ? { ...m.recentAt } : {};
    const recentText = m.recentText && typeof m.recentText === 'object' ? { ...m.recentText } : {};
    // Legacy memory stored IDs without timestamps. Conservatively retain them for a fresh 90-day window.
    for (const id of Array.isArray(m.recent) ? m.recent : []) if (!Number.isFinite(Number(recentAt[id]))) recentAt[id] = now;
    const recent = Array.isArray(m.recent) ? m.recent.filter(id => {
      // Legacy IDs had no timestamp; treat them as newly seen so an upgrade
      // cannot immediately repeat a message that was just displayed.
      if (!Number.isFinite(recentAt[id])) recentAt[id] = now;
      return now - recentAt[id] < LINE_UNIQUENESS_MS;
    }).slice(-1000) : [];
    const keep = new Set(recent);
    for (const id of Object.keys(recentAt)) if (!keep.has(id) || now - recentAt[id] >= LINE_UNIQUENESS_MS) { delete recentAt[id]; delete recentText[id]; }
    return { recent, recentAt, recentText, current: m.current || null, sugg: m.sugg || {} };
  } catch { return { recent: [], recentAt: {}, recentText: {}, current: null, sugg: {} }; }
}
function writeLineMemory(memory) {
  try {
    const recent = memory.recent.slice(-1000);
    const keep = new Set(recent);
    const recentAt = Object.fromEntries(Object.entries(memory.recentAt || {}).filter(([id]) => keep.has(id)));
    const recentText = Object.fromEntries(Object.entries(memory.recentText || {}).filter(([id]) => keep.has(id)));
    localStorage.setItem(LINE_MEMORY_KEY, JSON.stringify({ ...memory, recent, recentAt, recentText }));
  } catch { /* storage full: keep working without memory */ }
}
const FALLBACK_PROGRESS_LINES = [
  ['fallback:01','A quiet effort still has value.','নীরব প্রচেষ্টারও মূল্য আছে।'],
  ['fallback:02','Consistency grows one choice at a time.','একটি একটি সিদ্ধান্তে ধারাবাহিকতা গড়ে ওঠে।'],
  ['fallback:03','Every sincere step has meaning.','প্রতিটি আন্তরিক পদক্ষেপের অর্থ আছে।'],
  ['fallback:04','Keep your rhythm gentle and steady.','ধীরে ও স্থিরভাবে নিজের ছন্দ ধরে রাখুন।'],
  ['fallback:05','Small acts can build lasting habits.','ছোট আমল দীর্ঘস্থায়ী অভ্যাস গড়ে তুলতে পারে।'],
  ['fallback:06','Give your effort time to grow.','আপনার প্রচেষ্টাকে বিকশিত হওয়ার সময় দিন।'],
  ['fallback:07','A calm return is still a return.','শান্তভাবে ফিরে আসাও ফিরে আসা।'],
  ['fallback:08','Steady practice matters more than a perfect day.','নিখুঁত দিনের চেয়ে নিয়মিত আমল বেশি গুরুত্বপূর্ণ।'],
  ['fallback:09','Leave room for the next good step.','পরবর্তী ভালো পদক্ষেপের জন্য জায়গা রাখুন।'],
  ['fallback:10','Quiet progress can be meaningful.','নীরব অগ্রগতিও অর্থবহ হতে পারে।'],
  ['fallback:11','A thoughtful pause can renew intention.','একটু ভেবে নেওয়া নিয়তকে নতুন করে জাগাতে পারে।'],
  ['fallback:12','Today offers another chance to begin well.','আজ ভালোভাবে শুরু করার আরেকটি সুযোগ।'],
  ['fallback:13','Let patience guide the next step.','পরবর্তী পদক্ষেপে ধৈর্যকে সঙ্গী করুন।'],
  ['fallback:14','Good habits are shaped through repetition.','পুনরাবৃত্তির মাধ্যমে ভালো অভ্যাস গড়ে ওঠে।'],
  ['fallback:15','A sincere intention gives effort direction.','আন্তরিক নিয়ত প্রচেষ্টাকে সঠিক দিক দেখায়।'],
  ['fallback:16','Make the next moment count.','পরবর্তী মুহূর্তটিকে মূল্যবান করে তুলুন।'],
  ['fallback:17','Gentle progress is still progress.','ধীর ও কোমল অগ্রগতিও অগ্রগতি।'],
  ['fallback:18','Renew your intention and continue calmly.','নিয়ত নবায়ন করে শান্তভাবে এগিয়ে চলুন।'],
  ['fallback:19','One thoughtful choice can shape the day.','একটি সচেতন সিদ্ধান্ত পুরো দিনকে গড়ে দিতে পারে।'],
  ['fallback:20','Keep returning to what matters.','যা গুরুত্বপূর্ণ, তার দিকেই বারবার ফিরে আসুন।']
];

function messageTokens(value, language) {
  const text = String(value || '').toLocaleLowerCase().normalize('NFKC').replace(/[\p{P}\p{S}\d০-৯]+/gu, ' ');
  const stop = language === 'bn'
    ? new Set(['এবং','কিন্তু','আজ','আপনার','এই','একটি','সময়','নামাজ','হলো','হয়','যে','যখন','তখন'])
    : new Set(['the','and','but','your','you','today','this','that','for','with','when','while','is','are','to','of','a','an']);
  return new Set(text.split(/\s+/).filter(word => word.length > 1 && !stop.has(word)));
}

function messagesAreSimilar(a, b, language) {
  const left = messageTokens(a, language), right = messageTokens(b, language);
  if (!left.size || !right.size) return false;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / (left.size + right.size - shared) >= .72;
}

function conversationalLine(day, now = new Date()) {
  const times = getTimes(day);
  if (!times) return null;
  const record = dayRecord(day, false);
  const fard = getAllFardForDate(day).map(e => {
    const partsAll = prayerParts(e.key).filter(part => !shiaMode() || part.layer === 'fard');
    const ticked = part => (part.layer === 'fard' ? !!record.fard?.[e.key] : !!record[part.layer]?.[part.slot.key]);
    const rak = part => (part.layer === 'fard' ? FARD_RAKAHS[e.key] : parseInt(part.slot.en, 10) || 0);
    const at = record.at?.[`fard:${e.key}`];
    return {
      key: e.key, start: e.start.getTime(), end: e.end.getTime(), done: !!record.fard?.[e.key],
      tickedAt: Array.isArray(at) && Number.isFinite(at[0]) ? e.start.getTime() + at[0] * 60000 : null,
      parts: partsAll.filter(ticked).map(rak).filter(Boolean),
      full: partsAll.length > 0 && partsAll.every(ticked)
    };
  });
  const today = dateKey(day);
  const habits = analyzeHabits(state.history, today);
  const memory = readLineMemory();
  if (pendingLineRefresh === 0 && memory.current?.text && memory.current.lang === lang() && memory.recent.includes(memory.current.id)) return memory.current.text;
  // a Sunnah/Nafl suggestion: rare, with a short heads-up shortly before it opens and again while it is open (see src/habits.js)
  const candidates = shiaMode() ? [] : getVoluntaryEvents(day)
    .filter(e => ['duha', 'awwabin'].includes(e.key) && now.getTime() >= e.start.getTime() - VOLUNTARY_HEADS_UP_MINUTES * 60000 && now < e.end)
    .map(e => ({ kind: 'voluntary', key: e.key, phase: now >= e.start ? 'open' : 'soon', name: { en: e.key === 'duha' ? 'Duha' : 'Awwabin', bn: e.key === 'duha' ? 'দুহা' : 'আওয়াবিন' } }));
  const picked = shiaMode() ? null : pickSuggestion({ candidates, history: state.history, todayKey: today, memory: memory.sugg, shia: false });
  const refreshBase = pendingLineRefresh;
  const lineContext = {
    lang: lang(), dateKey: today, now: now.getTime(), friday: day.getDay() === 5,
    fmt: ms => fmt(new Date(ms)), fard, habits, memory, suggestion: picked ? { name: picked.name, phase: picked.phase } : null
  };
  let result = progressLine({ ...lineContext, refresh: refreshBase });
  const recentText = Object.entries(memory.recentText || {}).filter(([id, item]) => id !== result?.id && item?.lang === lang()).map(([, item]) => item.text);
  if (result && recentText.some(text => messagesAreSimilar(text, result.text, lang()))) {
    for (let attempt = 1; attempt <= 16; attempt++) {
      const candidate = progressLine({ ...lineContext, refresh: refreshBase + attempt });
      if (candidate && !recentText.some(text => messagesAreSimilar(text, candidate.text, lang()))) { result = candidate; break; }
    }
  }
  if (!result || recentText.some(text => messagesAreSimilar(text, result.text, lang()))) {
    const fallback = FALLBACK_PROGRESS_LINES.find(([id, en, bn]) => !memory.recent.includes(id) && !recentText.some(text => messagesAreSimilar(text, lang() === 'bn' ? bn : en, lang())));
    if (fallback) result = { id:fallback[0], text:lang() === 'bn' ? fallback[2] : fallback[1], sig:`${today}:fallback:${fallback[0]}` };
  }
  pendingLineRefresh = 0;
  if (!result) return null;
  if (!memory.current || memory.current.sig !== result.sig || memory.current.id !== result.id) {
    memory.recent.push(result.id);
    memory.recentAt[result.id] = Date.now();
    memory.recentText[result.id] = { text: result.text, lang: lang(), at: Date.now() };
    memory.current = { sig: result.sig, id: result.id, text: result.text, lang: lang() };
  }
  if (picked && result.suggested && memory.sugg.day !== today) memory.sugg = { day: today, key: picked.key };
  writeLineMemory(memory);
  return result;
}

function renderProgress() {
  const day = progressDate(new Date());
  const { fardDone, standalone, seasonal, sunnah, nafl, flags, summary } = dayLayers(day);
  const key = dateKey(day);
  const previous = lastFigure.day === key ? lastFigure.flags : null;
  const changes = previous ? figureChanges(previous, flags) : { sweep: new Set(), closing: new Set() };
  const rewardFade = summary.reward && !!previous && !lastFigure.reward;
  const figure = $('progressFigure');
  figure.innerHTML = figureSvg(flags, { sweep: changes.sweep, closing: changes.closing, rewardFade });
  lastFigure = { day: key, flags, reward: summary.reward };
  const core = $('progressCore');
  core.textContent = `${fardDone}/5`;
  core.hidden = summary.reward;
  const visual = $('progressVisual');
  visual.classList.toggle('all-done', summary.good);
  visual.classList.toggle('great-done', summary.great);
  visual.classList.toggle('disc-done', summary.fardDisc);
  visual.classList.toggle('has-seasonal', summary.hasSeasonal);
  $('legendSeasonal').hidden = !summary.hasSeasonal;
  const status = progressStatus(day, fardDone);
  const line = status ? null : conversationalLine(day);
  const plainTitle = lang() === 'bn' ? 'আজ' : 'Today';
  $('progressTitle').textContent = summary.great ? 'Great Job!' : summary.good ? 'Good Job!' : status ? status.title : plainTitle;
  const statusEl = $('progressStatus');
  // Once Good/Great Job takes the title, a date headline moves into the line.
  statusEl.textContent = status ? (summary.good && status.key !== 'all-done' ? `${status.title} · ${status.detail}` : status.detail) : (line?.text || '');
  statusEl.dataset.tier = status ? String(status.tier) : 'line';
  statusEl.dataset.key = status ? status.key : (line?.state || 'none');
  statusEl.hidden = !statusEl.textContent;
  const bn = lang() === 'bn';
  const n = value => bn ? localizeDigits(value) : value;
  const L = summary.layers;
  const seasonalText = summary.hasSeasonal
    ? (bn ? ` · বিশেষ দিনের নামাজ ${n(L.seasonal.done)}/${n(L.seasonal.total)}` : ` · date-specific ${L.seasonal.done}/${L.seasonal.total}`)
    : '';
  const caption = summary.great
    ? (bn ? 'আজকের ফরজ, সুন্নাত, নফল ও সব নফল ইবাদত সম্পন্ন হয়েছে।' : 'All Fard, Sunnah, Nafl and every voluntary prayer for today are complete.')
    : bn
      ? `ফরজ ${n(fardDone)}/৫ · সুন্নাত ${n(sunnah.done)}/${n(sunnah.total)} · নফল ${n(nafl.done)}/${n(nafl.total)} · অন্যান্য নফল ${n(L.voluntary.done)}/${n(L.voluntary.total)}${seasonalText}`
      : `Fard ${fardDone}/5 · Sunnah ${sunnah.done}/${sunnah.total} · Nafl ${nafl.done}/${nafl.total} · other voluntary ${L.voluntary.done}/${L.voluntary.total}${seasonalText}`;
  const captionEl = $('progressCaption');
  captionEl.textContent = caption;
  const aria = bn
    ? `${caption}${summary.reward ? ' · আলহামদুলিল্লাহ' : ''}`
    : `${caption}${summary.reward ? ' · Alhamdulillah' : ''}`;
  visual.dataset.originalAriaLabel = aria;
  visual.setAttribute('aria-label', aria);
  void standalone; void seasonal;
  translateRenderedText();
}

/* A prayer's parts in performance order (e.g. Dhuhr: 4 Sunnah before, Fard,
   2 Sunnah after, 2 Nafl): large white Fard circle, smaller green Sunnah and
   black Nafl circles, joined by short connectors. Clickable only while that
   prayer's window is open, like the main tick; correctable by unticking. */
function subPrayerAvailability(layer, key, prayerKey, date, now = new Date()) {
  const active = getActiveEvents(now).find(item => item.kind === 'fard' && item.key === prayerKey && dateKey(item.date) === dateKey(date));
  if (!active) return { available:false, reason:lang() === 'bn' ? 'এই নামাজের সময় এখনো শুরু হয়নি বা রেকর্ডিং বন্ধ হয়েছে।' : 'This prayer event has not begun or its recording window has closed.' };
  if (now < active.start || now >= active.end) return { available:false, reason:lang() === 'bn' ? 'এই সুন্নাত/নফলের প্রকৃত সময় শেষ হয়েছে।' : 'The actual opportunity for this Sunnah/Nafl has ended.' };
  const slot = findSlot(layer, key);
  const fardDone = !!dayRecord(date, false).fard?.[prayerKey];
  if (slot?.position === 'before' && fardDone) return { available:false, reason:lang() === 'bn' ? 'ফরজ আদায়ের পর আগের সুন্নাতের সময় শেষ হয়েছে।' : 'The pre-Fard Sunnah opportunity ended when the Fard was completed.' };
  if (slot?.position === 'after' && !fardDone) return { available:false, reason:lang() === 'bn' ? 'আগে ফরজ নামাজ সম্পন্ন ও টিক দিন।' : 'Complete and tick the Fard prayer first.' };
  return { available:true, reason:'' };
}

function partsHtml(prayerKey, date, enabled, { includeFard = true } = {}) {
  const record = dayRecord(date, false);
  const now = new Date();
  const active = getActiveEvents(now).find(item => item.kind === 'fard' && item.key === prayerKey && dateKey(item.date) === dateKey(date));
  const bn = lang() === 'bn';
  const L = bn ? 'bn' : 'en';
  const parts = prayerParts(prayerKey).filter(part => (includeFard || part.layer !== 'fard') && (!shiaMode() || part.layer === 'fard'));
  const items = parts.map(part => {
    if (part.layer === 'fard') {
      const done = !!record.fard?.[prayerKey];
      const locked = lockState('fard', prayerKey, date).locked;
      const lk = locked ? lockTipFor('fard', prayerKey, date) : '';
      const disabled = !enabled || !active || locked;
      const label = fardPartLabel(prayerKey, date, L);
      const aria = bn ? `${slotName(prayerKey, date)} ফরজ সম্পন্ন হিসেবে চিহ্নিত করুন` : `Mark ${slotName(prayerKey, date)} Fard complete`;
      return `<button type="button" class="part-tick fard${done ? ' done' : ''}${locked ? ' is-locked' : ''}" data-sub-layer="fard" data-sub-key="${prayerKey}" data-sub-prayer="${prayerKey}" data-sub-date="${dateKey(date)}" aria-pressed="${done}"${disabled ? ' aria-disabled="true" disabled' : ''} aria-label="${escapeHtml(aria)}" title="${escapeHtml(lk || label)}"><i aria-hidden="true">${done ? '✓' : ''}</i><span>${escapeHtml(label)}</span>${lk ? lockMarkHtml(lk, true) : ''}</button>`;
    }
    const { layer, slot } = part;
    const done = !!record[layer]?.[slot.key];
    const availability = subPrayerAvailability(layer, slot.key, prayerKey, date, now);
    const locked = lockState(layer, slot.key, date).locked;
    const lk = locked ? lockTipFor(layer, slot.key, date) : '';
    const disabled = !enabled || !availability.available || locked;
    const label = slotShortLabel(slot, date, L);
    const full = slotLabel(slot, date, L);
    const kind = layer === 'sunnah' ? (bn ? 'সুন্নাত' : 'Sunnah') : (bn ? 'নফল' : 'Nafl');
    const title = lk || availability.reason || `${kind}: ${full}`;
    return `<button type="button" class="part-tick ${layer}${done ? ' done' : ''}${locked ? ' is-locked' : ''}" data-sub-layer="${layer}" data-sub-key="${slot.key}" data-sub-prayer="${prayerKey}" data-sub-date="${dateKey(date)}" aria-pressed="${done}"${disabled ? ' aria-disabled="true" disabled' : ''} aria-label="${escapeHtml(`${slotName(prayerKey, date)} · ${kind}: ${full}`)}" title="${escapeHtml(title)}"><i aria-hidden="true">${done ? '✓' : ''}</i><span>${escapeHtml(label)}</span>${lk ? lockMarkHtml(lk, true) : ''}</button>`;
  });
  if (!items.length) return '';
  return `<div class="prayer-parts${enabled ? '' : ' is-closed'}" role="group" aria-label="${bn ? 'সুন্নাত, ফরজ ও নফল' : 'Sunnah, Fard and Nafl'}">${items.join('<span class="part-link" aria-hidden="true"></span>')}</div>`;
}

/* Note on a Daily prayers card, by school (src/prayer-card-notes.js). The Sunnah/Nafl
   sub-ticks stay available on the "available right now" card of the open prayer,
   which is the only time they can be ticked anyway. */
function prayerNoteHtml(prayerKey) {
  const note = cardNote(prayerKey, lang(), shiaMode() ? 'jafari' : state.profile.school);
  if (!note) return '';
  return `<p class="prayer-note">${escapeHtml(note.text)} <span class="prayer-note-ref">${escapeHtml(note.ref)}</span></p>`;
}

/** Sound cues for a tick/untick on one layer of a prayer day. */
function playLayerSound(layer, ticked, before, after) {
  if (!state.sound) return;
  const step = Math.max(1, after.summary.layers[layer]?.done || 1);
  const cues = soundCues({
    layer,
    ticked,
    step,
    ringClosed: ticked && !!after.summary.complete[layer] && !before.summary.complete[layer],
    dayComplete: ticked && after.summary.reward && !before.summary.reward
  });
  playCues(cues, state.tickStyle, window);
}

function toggleSubPrayer(layer, key, prayerKey, dateText) {
  if (layer === 'fard') return togglePrayer('fard', prayerKey, dateText);
  const slot = findSlot(layer, key);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText || '');
  if (!slot || slot.prayer !== prayerKey || !match) return;
  const eventDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (dayRecord(eventDate, false)[layer]?.[key] && lockState(layer, key, eventDate).locked) return;
  const now = new Date();
  const availability = subPrayerAvailability(layer, key, prayerKey, eventDate, now);
  if (!availability.available) {
    showToast(availability.reason);
    render();
    if (currentPage === 'countdown') renderCountdownView();
    return;
  }
  if (lockState(layer, key, eventDate).locked) {
    showToast(lockTipFor(layer, key, eventDate));
    return;
  }
  const before = dayLayers(eventDate);
  const record = dayRecord(eventDate);
  const target = record[layer] || (record[layer] = {});
  if (target[key]) {
    delete target[key];
    if (record.at) delete record.at[`${layer}:${key}`];
    save();
    playLayerSound(layer, false, before, dayLayers(eventDate));
    render();
    if (currentPage === 'countdown') renderCountdownView();
    return;
  }
  target[key] = true;
  save();
  const after = dayLayers(eventDate);
  playLayerSound(layer, true, before, after);
  render();
  if (currentPage === 'countdown') renderCountdownView();
  const { summary, sunnah, nafl } = after;
  if (summary.great) showToast('Great Job!');
  else if (layer === 'sunnah') showToast(sunnah.complete ? 'All Sunnah prayers complete' : 'Sunnah marked complete');
  else showToast(nafl.complete ? 'All prayer-linked Nafl complete' : 'Nafl marked complete');
}

function completionCount(record) {
  return ['fard', 'voluntary', 'sunnah', 'nafl'].reduce((sum, layer) => sum + Object.keys(record[layer] || {}).length, 0);
}


function weeklyAnchor(now = new Date()) {
  return weekStart(now);
}

/* Weekly Prayer Progress: Saturday to Friday, full days, 5 Fard cells per day
   (35 per week) and a Nafl ring per day. Friday is highlighted and its
   midday cell reads Dhuhr/Jumu’ah. */
function renderWeeklyReview() {
  const root = $('weeklyReview');
  if (!root) return;
  const now = new Date();
  const anchor = weeklyAnchor(now);
  const bn = lang() === 'bn';
  const L = bn ? 'bn' : 'en';
  const num = value => bn ? localizeDigits(value) : String(value);
  const dates = sevenCycleDates(anchor);
  const fard = weeklyFardTally(dates, date => dayRecord(date, false));
  let naflTotal = 0, naflPossible = 0, sunnahTotal = 0, sunnahPossible = 0, linkedTotal = 0, linkedPossible = 0;
  const today = startOfDay(now);
  const days = fard.days.map(({ date, cells, count }, i) => {
    const record = dayRecord(date, false);
    const events = getVoluntaryEvents(date);
    const naflCount = events.filter(event => record.voluntary?.[event.key]).length;
    naflTotal += naflCount; naflPossible += events.length;
    const layers = dayLayers(date);
    const sunnah = layers.sunnah;
    const linked = layers.nafl;
    sunnahTotal += sunnah.done; sunnahPossible += sunnah.total;
    linkedTotal += linked.done; linkedPossible += linked.total;
    const isToday = dateKey(date) === dateKey(now);
    const future = date > today;
    const friday = date.getDay() === FRIDAY;
    // Per-cell Fard states (Friday's Dhuhr/Jumu’ah slot included) for the day's tooltip.
    const fardStates = cells.map(cell => `${slotName(cell.key, date)}: ${cell.done ? (bn ? 'সম্পন্ন' : 'done') : (bn ? 'বাকি' : 'not marked')}`).join(' · ');
    const fardLabel = bn ? `${num(count)}/৫ ফরজ` : `${count}/5 Fard`;
    const naflLabel = bn ? `সুন্নাত ${num(sunnah.done)}/${num(sunnah.total)}, নফল ${num(linked.done)}/${num(linked.total)}, নফল ইভেন্ট ${num(naflCount)}/${num(events.length)}` : `Sunnah ${sunnah.done}/${sunnah.total}, Nafl ${linked.done}/${linked.total}, voluntary ${naflCount}/${events.length}`;
    const dayLocked = dayIsLocked(dateKey(date), dateKey(progressDate(now)), state.lockWatermark);
    const dayTitle = `${dayName(date)}${friday ? ` · ${FRIDAY_DHUHR_LABEL[L]}` : ''}\n${fardStates}${dayLocked && count ? `\n${lockTip(null, L)}` : ''}`;
    return `<div class="week-day${dayLocked ? ' is-locked' : ''}${isToday ? ' today' : ''}${friday ? ' friday' : ''}${future ? ' future' : ''}${count === 5 ? ' day-complete' : ''}" title="${escapeHtml(dayTitle)}" role="group" aria-label="${escapeHtml(`${dayName(date)}: ${fardLabel}, ${naflLabel}`)}">`
      + `<strong>${WEEK_DAY_LABELS[L][i]}</strong><span class="week-date">${escapeHtml(new Intl.DateTimeFormat(bn ? 'bn-BD' : 'en-GB', { day: 'numeric' }).format(date))}</span>`
      + `<span class="week-figure" aria-hidden="true" title="${escapeHtml(naflLabel)}">${figureSvg(layers.flags, { mini: true })}</span>`
      + `<small>${future ? '—' : `${num(count)}/${num(5)} · ${num(naflCount)}/${num(events.length)}`}</small>`
      + `${friday ? `<em class="week-jumuah">${escapeHtml(FRIDAY_DHUHR_LABEL[L])}</em>` : ''}</div>`;
  });
  const fardPct = fard.possible ? Math.round(fard.done / fard.possible * 100) : 0;
  const naflPct = naflPossible ? Math.round(naflTotal / naflPossible * 100) : 0;
  const range = `${new Intl.DateTimeFormat(bn ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' }).format(dates[0])} – ${new Intl.DateTimeFormat(bn ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' }).format(dates[6])}`;
  const foot = bn
    ? `সপ্তাহ শনিবার থেকে শুক্রবার · প্রতিদিন ৫ ওয়াক্ত ফরজ (সপ্তাহে ৩৫) · শুক্রবারের যোহর/জুমা—যেকোনোটি আদায় করলেই সম্পন্ন`
    : `Week runs Saturday to Friday · 5 Fard every day (35 a week) · Friday’s Dhuhr/Jumu’ah slot is complete with either prayer`;
  root.innerHTML = `<div class="week-summary"><div><span>${bn ? 'সাপ্তাহিক ফরজ' : 'WEEKLY FARD'}</span><strong>${num(fard.done)}/${num(fard.possible)} <small>· ${num(fardPct)}%</small></strong></div><div><span>${bn ? 'সাপ্তাহিক সুন্নাত' : 'WEEKLY SUNNAH'}</span><strong>${num(sunnahTotal)}/${num(sunnahPossible)}</strong></div><div><span>${bn ? 'সাপ্তাহিক নফল' : 'WEEKLY NAFL'}</span><strong>${num(linkedTotal)}/${num(linkedPossible)}</strong></div><div><span>${bn ? 'নফল ইভেন্ট' : 'VOLUNTARY EVENTS'}</span><strong>${num(naflTotal)}/${num(naflPossible)} <small>· ${num(naflPct)}%</small></strong></div><div class="week-range"><span>${bn ? 'এই সপ্তাহ' : 'THIS WEEK'}</span><strong>${escapeHtml(range)}</strong></div></div><div class="week-constellation">${days.join('')}</div><p class="week-foot">${escapeHtml(foot)}</p>`;
}

/* Settings > Calculation profile keeps today's prohibited intervals (moved from the old home-page timetable). */
function renderSettingsIntervals() {
  const box = $('settingsIntervals');
  if (!box) return;
  const times = hasLocation() ? getTimes(startOfDay(new Date())) : null;
  if (!times) { box.textContent = '—'; return; }
  const bn = lang() === 'bn';
  const names = shiaMode() ? { sunrise: bn ? 'সূর্যোদয় (মাকরুহ)' : 'Sunrise (disliked)', zawal: bn ? 'জাওয়াল (মাকরুহ)' : 'Zawal (disliked)', sunset: bn ? 'সূর্যাস্তের আগে (মাকরুহ)' : 'Before sunset (disliked)' }
    : { sunrise: bn ? 'সূর্যোদয়' : 'Sunrise', zawal: bn ? 'জাওয়াল' : 'Zawal', sunset: bn ? 'সূর্যাস্তের আগে' : 'Before sunset' };
  const lines = prohibitedIntervals(times).map(item => `${names[item.key]}: ${fmt(item.start)} – ${fmt(item.end)}`);
  if (shiaMode() && times.midnight) lines.push(`${bn ? 'মধ্যরাত (ইশার শেষ)' : 'Midnight (end of Isha)'}: ${fmt(times.midnight)}`);
  box.textContent = lines.join('\n');
}

/* The hero counts down to the next EVENT of any kind: an obligatory or voluntary
   prayer, the start or end of a prohibited (Ja'fari: disliked) interval, or the
   Ja'fari midnight, from one ordered timeline (src/day-timeline.js). */
function dayTimelineFor(now) {
  const today = startOfDay(now);
  const days = [];
  for (const offset of [-1, 0, 1]) {
    const date = addDays(today, offset);
    const times = getTimes(date);
    const nextTimes = getTimes(addDays(date, 1));
    if (!times || !nextTimes) continue;
    days.push({
      fard: getFardEvents(date, times, nextTimes),
      voluntary: getVoluntaryEvents(date, times, nextTimes),
      prohibited: prohibitedIntervals(times),
      midnight: shiaMode() ? times.midnight : null
    });
  }
  return buildTimeline(days);
}

function getNextEvent(now = new Date()) {
  // Next event = the soonest PRAYER event (obligatory or voluntary). Prohibited intervals and midnight are never targets.
  const timeline = dayTimelineFor(now);
  const next = nextPrayerEventAfter(timeline, now);
  if (!next) return null;
  const following = nextPrayerEventAfter(timeline, next.at);
  const start = new Date(next.at);
  const date = next.date || startOfDay(start);
  const times = getTimes(date), nextTimes = getTimes(addDays(date, 1));
  const candidates = next.kind === 'fard' ? getFardEvents(date, times, nextTimes) : getVoluntaryEvents(date, times, nextTimes);
  const actual = candidates.find(event => event.kind === next.kind && event.key === next.key);
  return { ...next, start, end: actual?.end || new Date(following ? following.at : next.at + 60000), date };
}

function renderNextPrayer() {
  const next = getNextEvent(new Date());
  nextPrayer = next;
  const card = document.querySelector('.next-card');
  if (!next) {
    $('nextName').textContent = '—';
    $('nextCountdownOpen').textContent = '—';
    $('nextMeta').textContent = 'Prayer times are unavailable';
    card?.classList.remove('is-interval');
    return;
  }
  const label = eventLabel(next, { lang: lang(), shia: shiaMode(), prayerName: key => slotName(key, next.date) });
  next.title = label.name;
  card?.classList.remove('is-interval');
  $('nextEyebrow').textContent = 'NEXT EVENT';
  $('nextName').textContent = label.name;
  $('nextName').dataset.kind = next.kind;
  $('nextName').setAttribute('aria-expanded', 'false');
  $('nextDescription').hidden = true;
  $('nextDescription').innerHTML = referenceCardHtml(next.key, label.name, next.date || startOfDay(next.start));
  $('nextMeta').textContent = `${label.verb} ${fmt(next.start)} · ${state.place || 'Saved location'}`;
  const activeFard = getActiveEvents().find(event => event.kind === 'fard');
  const school = SCHOOL_SHORT[state.profile.school];
  $('currentMeta').textContent = activeFard ? `Current: ${prayerName(activeFard.key)} · ${school}` : `No obligatory prayer window is active · ${school}`;
  updateTopCountdown();
}

function updateTopCountdown() {
  if (!nextPrayer) return;
  const now = new Date();
  $('nextCountdownOpen').textContent = countdown(nextPrayer.start.getTime() - now.getTime());
  const date = nextPrayer.date || startOfDay(nextPrayer.start);
  const times = getTimes(date), nextTimes = getTimes(addDays(date, 1));
  const best = bestTimeWindow(nextPrayer, { maghrib:times?.maghrib, fajr:nextTimes?.fajr });
  $('nextCountdownOpen').classList.toggle('is-best-time', bestTimeState(best, now.getTime()).state === 'active');
}

function updateCountdownWidgets() {
  // The hero countdown is independent of the Home page render and must stay live every second.
  updateTopCountdown();
}

function renderTemporalView() {
  const date = startOfDay(new Date());
  const times = getTimes(date), nextTimes = getTimes(addDays(date, 1));
  if (!times || !nextTimes) return;
  const events = [...getFardEvents(date, times, nextTimes), ...getVoluntaryEvents(date, times, nextTimes)].sort((a, b) => a.start - b.start);
  $('temporalPrayerTimes').innerHTML = events.map(event => `<div class="temporal-row"><span>${escapeHtml(prayerName(event.key))}</span><strong>${escapeHtml(fmt(event.start))} – ${escapeHtml(fmt(event.end))}</strong></div>`).join('');
  const intervals = prohibitedIntervals(times);
  $('temporalProhibited').innerHTML = intervals.length ? intervals.map(item => `<div class="temporal-row"><span>${escapeHtml(PROHIBITED_LABELS[item.key][lang() === 'bn' ? 'bn' : 'en'])}</span><strong>${escapeHtml(fmt(item.start))} – ${escapeHtml(fmt(item.end))}</strong></div>`).join('') : `<div class="temporal-detail">${lang() === 'bn' ? 'আজ কোনো নিষিদ্ধ সময় গণনা করা যায়নি।' : 'No prohibited interval is available for this date.'}</div>`;
  $('temporalSunTimes').textContent = `${lang() === 'bn' ? 'সূর্যোদয়' : 'Sunrise'} ${fmt(times.sunrise)} · ${lang() === 'bn' ? 'সূর্যাস্ত' : 'Sunset'} ${fmt(times.sunset)} · ${lang() === 'bn' ? 'সৌর মধ্যাহ্ন' : 'Solar noon'} ${fmt(times.solarNoon)} · ${lang() === 'bn' ? 'জাওয়াল' : 'Zawal'} ${fmt(times.zawalStart)}–${fmt(times.zawalEnd)}`;
  const pass = moonPassCache || moonPass(now, state.lat, state.lon);
  $('temporalMoonTimes').textContent = `${lang() === 'bn' ? 'চন্দ্রোদয়' : 'Moonrise'} ${pass.rise ? fmt(pass.rise) : '—'} · ${lang() === 'bn' ? 'চন্দ্রাস্ত' : 'Moonset'} ${pass.set ? fmt(pass.set) : '—'}`;
  updateTemporalLive();
}

function updateTemporalLive() {
  if (currentPage !== 'temporal') return;
  const now = new Date();
  $('temporalTime').textContent = formatClock(now, { lang: lang(), clock: state.clock, seconds: true });
  $('temporalDate').textContent = dayName(now);
  const sun = sunPosition(now, state.lat, state.lon), moon = moonPosition(now, state.lat, state.lon), phase = moonPhase(now);
  $('temporalSunPosition').textContent = `${lang() === 'bn' ? 'উচ্চতা' : 'Altitude'} ${Math.round(sun.altitude)}° · ${lang() === 'bn' ? 'দিগংশ' : 'Azimuth'} ${Math.round(sun.azimuth)}°`;
  $('temporalMoonPosition').textContent = `${lang() === 'bn' ? 'উচ্চতা' : 'Altitude'} ${Math.round(moon.altitude)}° · ${lang() === 'bn' ? 'দিগংশ' : 'Azimuth'} ${Math.round(moon.azimuth)}°`;
  const phaseText = PHASE_NAMES[phaseName(phase)][lang() === 'bn' ? 1 : 0];
  $('temporalMoonPhase').textContent = phaseText;
  $('temporalMoonIllumination').textContent = `${Math.round(phase.illumination * 100)}% ${lang() === 'bn' ? 'আলোকিত' : 'illuminated'}`;
  const next = getNextEvent(now);
  $('temporalNext').textContent = next ? `${lang() === 'bn' ? 'পরবর্তী নামাজের ঘটনা' : 'Next prayer event'}: ${prayerName(next.key)} · ${fmt(next.start)}` : (lang() === 'bn' ? 'পরবর্তী নামাজ পাওয়া যায়নি' : 'No upcoming prayer found');
  $('temporalNextCountdown').textContent = next ? countdown(next.start.getTime() - now.getTime()) : '—';
}

function openTemporalView() {
  if (!hasLocation()) { openSettings(); return; }
  currentPage = 'temporal';
  $('homeView').hidden = true;
  $('countdownView').hidden = true;
  $('settingsView').hidden = true;
  $('temporalView').hidden = false;
  $('settingsToggle').hidden = true;
  renderTemporalView();
  window.scrollTo(0, 0);
}

function openNextCountdown() {
  if (!nextPrayer) return;
  const date = startOfDay(nextPrayer.date || nextPrayer.start);
  const times = getTimes(date), nextTimes = getTimes(addDays(date, 1));
  const kind = nextPrayer.kind || 'fard';
  const event = { kind, key: nextPrayer.key, date, start: nextPrayer.start, end: nextPrayer.end };
  countdownState = {
    key: nextPrayer.key, kind, date,
    title: prayerName(nextPrayer.key),
    start: nextPrayer.start,
    end: nextPrayer.end,
    best: bestTimeWindow(event, { maghrib: times?.maghrib, fajr: nextTimes?.fajr }),
    description: 'Countdown to the prayer event and its recommended time.'
  };
  openCountdownView();
}

function openEventCountdown(dataset) {
  const start = Number(dataset.start), end = Number(dataset.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
  const date = dataset.date ? new Date(`${dataset.date}T00:00:00`) : startOfDay(new Date(start));
  const times = getTimes(date), nextTimes = getTimes(addDays(date, 1));
  const event = { kind: dataset.kind || 'fard', key: dataset.key, date, start: new Date(start), end: new Date(end) };
  countdownState = {
    key: dataset.key, kind: event.kind, date,
    title: prayerName(dataset.key),
    start: event.start, end: event.end,
    best: bestTimeWindow(event, { maghrib: times?.maghrib, fajr: nextTimes?.fajr }),
    description: 'Expanded prayer-event countdown and Best Time to Pray.'
  };
  openCountdownView();
}

function openCountdownView() {
  if (!countdownState) return;
  homeScrollTop = window.scrollY || 0;
  currentPage = 'countdown';
  $('homeView').hidden = true;
  $('settingsView').hidden = true;
  $('temporalView').hidden = true;
  $('countdownView').hidden = false;
  $('settingsToggle').hidden = true;
  $('countdownTitle').textContent = countdownState.title;
  $('countdownEyebrow').textContent = 'PRAYER COUNTDOWN';
  $('countdownDescription').textContent = countdownState.description;
  renderCountdownView();
  window.scrollTo(0, 0);
}

function renderCountdownCompletion() {
  const root = $('countdownCompletion');
  if (!root || !countdownState) return;
  const { kind, key, date } = countdownState;
  $('countdownCompletionEyebrow').textContent = lang() === 'bn' ? 'সম্পন্ন করার তথ্য' : 'COMPLETION';
  $('countdownCompletionTitle').textContent = lang() === 'bn' ? 'এই নামাজটি রেকর্ড করুন' : 'Record this prayer';
  lastCountdownCompletionMinute = Math.floor(Date.now() / 60000);
  if (kind === 'fard') {
    root.innerHTML = partsHtml(key, date, true, { includeFard:true });
    root.querySelectorAll('[data-sub-layer]').forEach(button => button.addEventListener('click', () => toggleSubPrayer(button.dataset.subLayer, button.dataset.subKey, button.dataset.subPrayer, button.dataset.subDate)));
    return;
  }
  const record = dayRecord(date, false);
  const done = !!record.voluntary?.[key];
  const locked = lockState('voluntary', key, date).locked;
  const recordable = getActiveEvents(new Date()).some(event => event.kind === 'voluntary' && event.key === key && dateKey(event.date) === dateKey(date));
  const disabled = locked || !recordable;
  const label = lang() === 'bn' ? `${prayerName(key)} সম্পন্ন হিসেবে চিহ্নিত করুন` : `Mark ${prayerName(key)} complete`;
  const title = locked ? lockTipFor('voluntary', key, date) : !recordable ? (lang() === 'bn' ? 'এই নামাজের রেকর্ডিং সময় এখন উপলব্ধ নয়।' : 'This prayer event is not currently recordable.') : label;
  root.innerHTML = `<button type="button" class="part-tick fard${done ? ' done' : ''}${locked ? ' is-locked' : ''}" data-countdown-voluntary="true" aria-pressed="${done}"${disabled ? ' disabled aria-disabled="true"' : ''} aria-label="${escapeHtml(label)}" title="${escapeHtml(title)}"><i aria-hidden="true">${done ? '✓' : ''}</i><span>${escapeHtml(label)}</span></button>`;
  root.querySelector('[data-countdown-voluntary]')?.addEventListener('click', () => togglePrayer('voluntary', key, dateKey(date)));
}

function renderCountdownView() {
  if (!countdownState || currentPage !== 'countdown') return;
  renderCountdownCompletion();
  updateCountdownLive();
}

function updateCountdownLive() {
  if (!countdownState || currentPage !== 'countdown') return;
  const now = Date.now();
  const bn = lang() === 'bn';
  let labelText;
  let remaining;
  if (now < countdownState.start.getTime()) {
    labelText = bn ? 'শুরু হতে বাকি' : 'Begins in';
    remaining = countdownState.start.getTime() - now;
  } else if (now < countdownState.end.getTime()) {
    labelText = bn ? 'সময় বাকি' : 'Time remaining';
    remaining = countdownState.end.getTime() - now;
  } else {
    labelText = bn ? 'এই নামাজের সময় শেষ হয়েছে' : 'This prayer period has ended';
    remaining = null;
  }
  $('countdownLarge').textContent = remaining == null ? '—' : countdown(remaining);
  $('countdownDescription').textContent = labelText;
  $('countdownStart').textContent = bn ? `শুরু ${fmt(countdownState.start)} · শেষ ${fmt(countdownState.end)} · ${dayName(countdownState.start)}` : `Begins ${fmt(countdownState.start)} · Ends ${fmt(countdownState.end)} · ${dayName(countdownState.start)}`;
  const best = countdownState.best;
  const bestState = bestTimeState(best, now);
  const bestPanel = $('bestTimeFocus');
  if (bestPanel) bestPanel.hidden = bestState.state === 'passed';
  bestPanel?.classList.toggle('is-active', bestState.state === 'active');
  $('bestTimeEyebrow').textContent = bn ? 'নামাজের উত্তম সময়' : 'BEST TIME TO PRAY';
  $('bestTimeTitle').textContent = bn ? 'নামাজের উত্তম সময়' : 'Best Time to Pray';
  $('bestTimeLarge').textContent = bestState.state === 'upcoming' || bestState.state === 'active' ? countdown(bestState.remaining) : '';
  const note = best ? null : bestTimeNote(countdownState.key, lang());
  $('bestTimeDescription').textContent = bestState.state === 'upcoming' ? (bn ? 'শুরু হতে বাকি' : 'Begins in') : bestState.state === 'active' ? (bn ? 'উত্তম সময় শেষ হতে বাকি' : 'Time remaining in the recommended period') : note ? (bn ? 'আরও সংকীর্ণ উত্তম সময় নির্ধারিত নয়' : 'No narrower preferred window is designated') : (bn ? 'উত্তম সময় শেষ হয়েছে।' : 'The recommended period has passed.');
  $('bestTimeRange').textContent = best ? `${fmt(new Date(best.start))} – ${fmt(new Date(best.end))}${best.approximate ? (bn ? ' · আনুমানিক স্মরণ-সময়' : ' · Approximate reminder window') : ''}` : note ? (bn ? 'যোহরের পূর্ণ বৈধ সময়ের মধ্যে আদায় করুন।' : 'Pray within the full valid Dhuhr period.') : (bn ? 'আরও সংকীর্ণ উত্তম সময় পাওয়া যায়নি।' : 'No narrower preferred period is available.');
  $('bestTimeSource').textContent = best ? `${bn ? best.reasonBn || best.reason : best.reason}${best.source ? ` · ${bn ? 'সূত্র' : 'Source'}: ${best.source}` : ''}` : note ? `${note.reason} · ${bn ? 'সূত্র' : 'Source'}: ${note.source}` : '';
  const minute = Math.floor(now / 60000);
  if (minute !== lastCountdownCompletionMinute) renderCountdownCompletion();
  translateRenderedText();
}


function openSettings() {
  homeScrollTop = window.scrollY || 0;
  currentPage = 'settings';
  $('homeView').hidden = true;
  $('countdownView').hidden = true;
  $('temporalView').hidden = true;
  $('settingsView').hidden = false;
  $('settingsToggle').hidden = false;
  $('settingsToggle').innerHTML = homeIcon;
  $('settingsToggle').setAttribute('aria-label', 'Home');
  $('settingsToggle').title = 'Home';
  syncSettingsControls();
  translateRenderedText();
  window.scrollTo(0, 0);
}

function openHome() {
  if (!hasLocation()) {
    showToast('Set your location with a Google Maps link or coordinates first.');
    openSettings();
    return;
  }
  const previous = currentPage;
  currentPage = 'home';
  $('settingsView').hidden = true;
  $('countdownView').hidden = true;
  $('temporalView').hidden = true;
  $('homeView').hidden = false;
  $('settingsToggle').hidden = false;
  $('settingsToggle').innerHTML = gearIcon;
  $('settingsToggle').setAttribute('aria-label', 'Settings');
  $('settingsToggle').title = 'Settings';
  countdownState = null;
  render();
  if (previous !== 'home') window.setTimeout(() => window.scrollTo(0, homeScrollTop), 0);
}

function recoveryEvents(now = new Date()) {
  const dateKeys = new Set(Object.keys(state.history || {}));
  for (let offset = -30; offset <= 1; offset++) dateKeys.add(dateKey(addDays(startOfDay(now), offset)));
  const events = [];
  for (const key of [...dateKeys].sort()) {
    const date = new Date(`${key}T00:00:00`);
    if (!Number.isFinite(date.getTime()) || date > startOfDay(now)) continue;
    const times = getTimes(date), nextTimes = getTimes(addDays(date, 1));
    if (times && nextTimes) events.push(...getFardEvents(date, times, nextTimes), ...getVoluntaryEvents(date, times, nextTimes));
  }
  return events.sort((a, b) => a.start - b.start);
}

function refreshRecoveryControls() {
  const select = $('recoveryPrayerSelect'), button = $('recoveryHoldButton'), status = $('recoveryStatus');
  if (!select || !button || !status) return;
  const details = $('recoveryDetails');
  if (details && !details.open) { select.innerHTML = ''; select.disabled = true; button.disabled = true; status.textContent = lang() === 'bn' ? 'যোগ্যতা যাচাই করতে এই অংশটি খুলুন।' : 'Open this section to check recovery eligibility.'; return; }
  const now = new Date();
  const events = recoveryEvents(now);
  const eligible = recoveryEligible(events, state.history, now.getTime());
  const candidates = recoverablePrayerEvents(events, state.history, now.getTime());
  const previous = select.value;
  select.innerHTML = candidates.map(event => `<option value="${dateKey(event.date)}|${event.kind}|${event.key}">${escapeHtml(prayerName(event.key))}${event.kind === 'voluntary' ? (lang() === 'bn' ? ' · নফল' : ' · Voluntary') : ''} · ${escapeHtml(dayName(event.date))}</option>`).join('');
  if (candidates.some(event => `${dateKey(event.date)}|${event.kind}|${event.key}` === previous)) select.value = previous;
  select.disabled = !eligible || !candidates.length;
  button.disabled = !eligible || !candidates.length;
  status.textContent = !eligible
    ? (lang() === 'bn' ? 'আগের পরপর দুটি ফরজ নামাজ সম্পন্ন হিসেবে রেকর্ড থাকলে এই সুবিধা চালু হবে।' : 'Unavailable until the two immediately preceding Fard prayers are recorded complete.')
    : !candidates.length
      ? (lang() === 'bn' ? 'রেকর্ড করার মতো কোনো লক হওয়া ফরজ নামাজ নেই।' : 'There is no locked, unrecorded Fard prayer to select.')
      : (lang() === 'bn' ? 'শুধু বাস্তবে আদায় করা নামাজের টিক পুনরুদ্ধার করুন।' : 'Recover only a prayer you actually performed.');
}

function performPrayerRecovery() {
  const select = $('recoveryPrayerSelect');
  if (!select?.value) return;
  const [dateText, kind, key] = select.value.split('|');
  const date = new Date(`${dateText}T00:00:00`);
  const now = new Date();
  const events = recoveryEvents(now);
  if (!recoveryEligible(events, state.history, now.getTime())) { refreshRecoveryControls(); return; }
  const candidates = recoverablePrayerEvents(events, state.history, now.getTime());
  const event = candidates.find(item => dateKey(item.date) === dateText && item.kind === kind && item.key === key);
  if (!event || !confirm(`I performed this prayer but forgot to record it. Record ${prayerName(key)} on ${dateText}?`)) return;
  const record = dayRecord(date, true);
  if (record[kind]?.[key]) return;
  (record[kind] || (record[kind] = {}))[key] = true;
  const recovered = record.recovered || (record.recovered = {});
  (recovered[kind] || (recovered[kind] = {}))[key] = true;
  (record.at || (record.at = {}))[`${kind}:${key}`] = [Math.max(0, Math.round((now.getTime() - event.start.getTime()) / 60000)), now.getHours() * 60 + now.getMinutes()];
  save();
  render();
  refreshRecoveryControls();
  showToast(lang() === 'bn' ? 'নামাজের রেকর্ড পুনরুদ্ধার করা হয়েছে' : 'Prayer completion record recovered');
}

function mergeBackupIntoCurrent(incoming) {
  const known = new Set(Object.keys(DEFAULTS));
  const unsupported = Object.keys(incoming).filter(key => !known.has(key));
  const compatible = Object.fromEntries(Object.entries(incoming).filter(([key]) => known.has(key)));
  const merged = mergeBackupState(state, compatible);
  return { data: merged.data, conflicts: merged.conflicts, unsupported };
}

function normalizeImportedState(data) {
  return {
    ...DEFAULTS, ...data,
    adjustments: { ...DEFAULTS.adjustments, ...(data.adjustments || {}) },
    history: migrateHistory(data.history),
    sections: sanitizeSections(data.sections),
    cards: sanitizeCards(data.cards),
    reminders: data.reminders && typeof data.reminders === 'object' ? data.reminders : {},
    reminderSent: data.reminderSent && typeof data.reminderSent === 'object' ? data.reminderSent : {},
    transitionSent: data.transitionSent && typeof data.transitionSent === 'object' ? data.transitionSent : {},
    profile: sanitizeProfile(data.profile),
    tickStyle: sanitizeTickStyle(data.tickStyle),
    clock: sanitizeClockFormat(data.clock),
    uiFont: sanitizeUiFont(data.uiFont)
  };
}

async function importBackupFile() {
  const file = $('importBackupFile').files?.[0];
  if (!file) { showToast('Choose a JSON backup first.'); return; }
  let payload;
  try { payload = JSON.parse(await file.text()); }
  catch { showToast('The selected file is not valid JSON.'); return; }
  const validation = validateBackup(payload);
  if (!validation.ok) { showToast(validation.reason); return; }
  const mode = $('backupMode').value;
  let incoming = validation.data;
  let conflicts = [], unsupported = [];
  if (mode === 'merge') {
    const result = mergeBackupIntoCurrent(incoming);
    incoming = result.data; conflicts = result.conflicts; unsupported = result.unsupported;
  } else {
    const known = new Set(Object.keys(DEFAULTS));
    unsupported = Object.keys(incoming).filter(key => !known.has(key));
    incoming = Object.fromEntries(Object.entries(incoming).filter(([key]) => known.has(key)));
  }
  const conflictText = conflicts.length ? `
Conflicts (current values retained): ${conflicts.slice(0, 8).join(', ')}${conflicts.length > 8 ? ` and ${conflicts.length - 8} more` : ''}.` : '';
  const unsupportedText = unsupported.length ? `
Items unavailable in this app version: ${unsupported.join(', ')}. They will not be imported.` : '';
  const action = mode === 'replace' ? 'Replace local data' : 'Import non-conflicting parts and keep current values for conflicts';
  if (!confirm(`${action}?
Backup app version: ${validation.appVersion}.${conflictText}${unsupportedText}
A local safety backup will be created first.`)) return;
  const before = JSON.stringify(state);
  try {
    localStorage.setItem('prayer-times-safety-backup', JSON.stringify({ createdAt: new Date().toISOString(), data: state }));
    const next = normalizeImportedState(incoming);
    Object.assign(state, next);
    localStorage.setItem('prayer-times-data', JSON.stringify(state));
    applyTheme(); applyUiFont(); syncSettingsControls(); render(); refreshRecoveryControls();
    showToast(mode === 'replace' ? 'Backup restored' : `Backup merged${conflicts.length ? ` · ${conflicts.length} conflicts retained locally` : ''}`);
  } catch (error) {
    try { Object.assign(state, JSON.parse(before)); localStorage.setItem('prayer-times-data', before); } catch { /* original local data remains in the safety backup */ }
    showToast(`Import failed; existing data was preserved. ${String(error?.message || error)}`);
  }
}

function renderEventReminderSettings() {
  const root = $('eventReminderSettings');
  if (!root) return;
  const labels = Object.fromEntries([...FARD, ...REMINDER_VOLUNTARY].map(item => [item.key, lang() === 'bn' ? (item.bn || item.en) : item.en]));
  const options = [0, 5, 10, 15, 20, 30, 40, 50, 60];
  const hijriNow = currentHijriDate(new Date());
  root.innerHTML = [...FARD, ...REMINDER_VOLUNTARY].filter(item => reminderRowVisible(item.key, hijriNow)).map(item => {
    const value = Number(state.reminders[item.key] || 0);
    return `<div class="event-reminder-row"><label for="reminder-${item.key}">${escapeHtml(labels[item.key])}</label><select id="reminder-${item.key}" data-reminder-key="${item.key}" aria-label="${escapeHtml(labels[item.key])} reminder"><option value="0">${lang() === 'bn' ? 'বন্ধ' : 'Off'}</option>${options.slice(1).map(min => `<option value="${min}" ${value === min ? 'selected' : ''}>${min} ${lang() === 'bn' ? 'মিনিট আগে' : 'min before'}</option>`).join('')}</select></div>`;
  }).join('');
  root.querySelectorAll('[data-reminder-key]').forEach(select => select.addEventListener('change', event => {
    state.reminders[event.target.dataset.reminderKey] = Number(event.target.value) || 0;
    save();
  }));
}

/* Minutes before each obligatory prayer begins: any whole number 0–180 (0 = off). */
function renderPreReminderSettings() {
  const root = $('preReminderSettings');
  if (!root) return;
  const bn = lang() === 'bn';
  root.innerHTML = FARD.map(item => {
    const label = bn ? (item.bn || item.en) : item.en;
    const value = Number(state.preReminders[item.key] || 0);
    return `<div class="event-reminder-row"><label for="pre-reminder-${item.key}">${escapeHtml(label)}</label><span class="pre-reminder-field"><input id="pre-reminder-${item.key}" class="pre-reminder-input" type="number" inputmode="numeric" min="0" max="${PRE_REMINDER_MAX}" step="1" value="${value}" data-pre-reminder-key="${item.key}" aria-label="${escapeHtml(bn ? `${label}-এর কত মিনিট আগে স্মরণ করাবে` : `Minutes before ${label} begins`)}"><small>${bn ? 'মিনিট আগে' : 'min before'}</small></span></div>`;
  }).join('');
  root.querySelectorAll('[data-pre-reminder-key]').forEach(input => input.addEventListener('change', event => {
    const key = event.target.dataset.preReminderKey;
    const minutes = parseReminderMinutes(event.target.value);
    if (minutes === null) {
      event.target.value = Number(state.preReminders[key] || 0);
      showToast('Enter whole minutes from 0 to 180');
      return;
    }
    if (minutes) state.preReminders[key] = minutes; else delete state.preReminders[key];
    event.target.value = minutes;
    save();
  }));
}

function syncSettingsControls() {
  $('themeSelect').value = state.theme;
  $('languageSelect').value = state.language;
  $('soundToggle').checked = state.sound;
  $('tickStyleSelect').value = state.tickStyle;
  $('clockFormatSelect').value = state.clock;
  renderUiFontSelect();
  renderProfileSettings();
  $('compactToggle').checked = state.compact;
  $('notificationsToggle').checked = state.notifications;
  document.querySelectorAll('[data-card]').forEach(box => { box.checked = state.cards[box.dataset.card] !== false; });
  renderEventReminderSettings();
  renderPreReminderSettings();
  refreshRecoveryControls();
  $('latitude').value = hasLocation() ? state.lat : '';
  $('longitude').value = hasLocation() ? state.lon : '';
  $('startupToggle').checked = !!state.startup;
  $('savedLocationText').textContent = hasLocation() ? 'Saved location' : 'Location not configured';
  $('savedCoordinates').textContent = hasLocation() ? `${state.lat.toFixed(6)}, ${state.lon.toFixed(6)}` : '—';
  for (const [key, value] of Object.entries(state.adjustments)) {
    const input = $(`adjust-${key}`);
    if (input) input.value = value;
  }
}

function renderSettingsSummary() {
  renderSettingsIntervals();
  if ($('savedLocationText')) {
    $('savedLocationText').textContent = hasLocation() ? 'Saved location' : 'Location not configured';
    $('savedCoordinates').textContent = hasLocation() ? `${state.lat.toFixed(6)}, ${state.lon.toFixed(6)}` : '—';
  }
}

function useMapLink() {
  const text = $('mapsLink').value.trim();
  if (!text) {
    setTranslatedText('mapLinkNote', 'Paste a Google Maps share link first.');
    return;
  }
  if (!isGoogleMapsUrl(text)) {
    setTranslatedText('mapLinkNote', 'Enter a valid Google Maps HTTPS link.');
    return;
  }
  const coords = parseCoordinates(text);
  if (!coords) {
    setTranslatedText('mapLinkNote', 'This Maps link does not contain readable coordinates. Shortened links cannot be expanded offline; copy the latitude and longitude from Maps and enter them below.');
    return;
  }
  $('latitude').value = coords.lat;
  $('longitude').value = coords.lon;
  setTranslatedText('mapLinkNote', `Coordinates found: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}. Select Save location to store them on this device.`);
}

function saveLocation() {
  const latText = $('latitude').value.trim();
  const lonText = $('longitude').value.trim();
  const lat = Number(latText);
  const lon = Number(lonText);
  if (!latText || !lonText || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    setTranslatedText('locationStatus', 'Enter valid coordinates: latitude −90 to 90, longitude −180 to 180.');
    return;
  }
  state.lat = lat;
  state.lon = lon;
  state.place = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  save();
  setTranslatedText('locationStatus', 'Location saved locally on this device.');
  translateRenderedText();
  showToast('Location saved');
  openHome();
}

/* ---- Locking of marked events (src/tick-lock.js) ------------------------- */
function lockContext(date) {
  const events = [];
  for (let offset = 0; offset <= 3; offset++) {
    const day = addDays(startOfDay(date), offset);
    const times = getTimes(day), nextTimes = getTimes(addDays(day, 1));
    if (!times || !nextTimes) continue;
    events.push(...getFardEvents(day, times, nextTimes), ...getVoluntaryEvents(day, times, nextTimes));
  }
  const nextFajr = getTimes(addDays(startOfDay(date), 1))?.fajr || null;
  return { events: events.sort((a, b) => a.start - b.start), nextFajr };
}

function lockItem(layer, key, date) {
  const slot = layer === 'sunnah' || layer === 'nafl' ? findSlot(layer, key) : null;
  return { kind: layer, key, prayer: slot ? slot.prayer : undefined, date: startOfDay(date) };
}

/** Is this ticked item locked now, and which event's start locked it. */
function lockState(layer, key, date, now = new Date()) {
  const dayStr = dateKey(date);
  const ctx = lockContext(startOfDay(date));
  const lock = lockInstant(lockItem(layer, key, date), ctx.events, ctx.nextFajr);
  const sealed = !!dayRecord(date, false).locked?.[lockKey(layer, key)];
  const locked = sealed || dayIsLocked(dayStr, dateKey(addDays(progressDate(now), -1)), state.lockWatermark) || (!!lock && now.getTime() >= lock.at);
  return { locked, by: lock ? lock.by : null, byDate: lock?.date || null };
}

/** "Locked after Dhuhr began" in the current language, or '' when not locked. */
function lockTipFor(layer, key, date, now = new Date()) {
  const { locked, by, byDate: boundaryDate } = lockState(layer, key, date, now);
  if (!locked) return '';
  const byDate = boundaryDate ? startOfDay(new Date(boundaryDate)) : (by === 'fajr' ? addDays(startOfDay(date), 1) : startOfDay(date));
  return lockTip(by ? slotName(by, byDate) : null, lang());
}

/** Small lock icon with a tooltip. Inside a button it is decoration only (the button itself is focusable and carries the text). */
function lockMarkHtml(tip, inButton = false) {
  return inButton
    ? `<span class="lock-mark" aria-hidden="true" data-lock-tip="${escapeHtml(tip)}"></span>`
    : `<span class="lock-mark" role="img" tabindex="0" aria-label="${escapeHtml(tip)}" data-lock-tip="${escapeHtml(tip)}"></span>`;
}

/** Remember locks as they happen (so a clock set back never re-opens them) and advance the date watermark. */
function sealLocks(now = new Date()) {
  let changed = false;
  const activeDay = progressDate(now);
  const watermark = nextWatermark(state.lockWatermark, dateKey(addDays(activeDay, -1)), addDaysKey);
  if (watermark !== state.lockWatermark) { state.lockWatermark = watermark; changed = true; }
  // Keep the previous two civil dates in scope: Isha's two-Fard recording
  // window can remain open until Dhuhr on the following day.
  for (const offset of [-2, -1, 0]) {
    const day = addDays(startOfDay(now), offset);
    const record = state.history[dateKey(day)];
    if (!record) continue;
    const ctx = lockContext(day);
    changed = sealRecord(record, (layer, key) => ({ item: lockItem(layer, key, day), events: ctx.events, nextFajr: ctx.nextFajr }), now) || changed;
  }
  if (changed) save();
}

function togglePrayer(kind, key, dateText) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText || '');
  if (!match) return;
  const eventDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // A locked tick can no longer be unmarked: no toast, no error sound (the tooltip explains it).
  if (dayRecord(eventDate, false)[kind]?.[key] && lockState(kind, key, eventDate).locked) return;
  const event = getActiveEvents(new Date()).find(item => item.kind === kind && item.key === key && dateKey(item.date) === dateText);
  if (!event) {
    showToast('This prayer event is not currently available.');
    renderLiveEvents();
    return;
  }
  const layer = layerOf(kind, key);
  const before = dayLayers(eventDate);
  const record = dayRecord(eventDate);
  const target = record[kind] || (record[kind] = {});
  if (target[key]) {
    delete target[key];
    if (record.at) delete record.at[`${kind}:${key}`];
    if (kind === 'fard' && !shiaMode()) {
      for (const part of prayerParts(key)) if (part.layer !== 'fard' && part.slot.position === 'after' && record[part.layer]?.[part.slot.key]) {
        delete record[part.layer][part.slot.key];
        if (record.at) delete record.at[`${part.layer}:${part.slot.key}`];
      }
    }
    save();
    playLayerSound(layer, false, before, dayLayers(eventDate));
    render();
    if (currentPage === 'countdown') renderCountdownView();
    return;
  }
  target[key] = true;
  // v1.3.2: when it was ticked (minutes after the window opened, minute of day) for the offline habit learning
  (record.at || (record.at = {}))[`${kind}:${key}`] = [Math.max(0, Math.round((Date.now() - event.start.getTime()) / 60000)), new Date().getHours() * 60 + new Date().getMinutes()];
  save();
  // One tick per new completion in the layer's own voice; its pitch steps
  // through the pentatonic scale with that layer's count. Closing a ring adds
  // a small flourish; completing every layer plays the completion chime.
  const after = dayLayers(eventDate);
  playLayerSound(layer, true, before, after);
  render();
  if (currentPage === 'countdown') renderCountdownView();
  // Good Job = all five Fard; Great Job = every layer present that day.
  const { summary } = after;
  if (summary.great) showToast('Great Job!');
  else if (summary.good) showToast('Good Job!');
  else showToast('Prayer marked complete');
}


function updateClock() {
  $('liveClock').textContent = formatClock(new Date(), { lang: lang(), clock: state.clock, seconds: true });
  $('dateLabel').textContent = dayName(new Date());
  const hijriDate = new Intl.DateTimeFormat(lang()==='bn'?'bn-BD':'en-GB-u-ca-islamic-umalqura', {day:'numeric',month:'long',year:'numeric',calendar:'islamic-umalqura'}).format(islamicCalendarDateAt(new Date()));
  $('hijriDateLabel').textContent = hijriDate;
  updateSky();
  if (currentPage === 'temporal') updateTemporalLive();
  if (currentPage === 'countdown') updateCountdownLive();
}

/* Sky panel under the header/clock: the sun crosses a dashed arc from sunrise to sunset, the moon from
   moonrise to moonset in its current phase (faint while the sun is up); sky colour, stars and clouds follow the
   sun's altitude. Offline maths (src/sky.js) from the saved latitude/longitude; redrawn only when the minute
   changes or the panel is resized. Twinkle and drift are CSS (transform/opacity only). */
let lastSkyKey = '';
const SVG_NS = 'http://www.w3.org/2000/svg';
const PHASE_NAMES = {
  new: ['New moon', 'অমাবস্যা'], full: ['Full moon', 'পূর্ণিমা'],
  'first-quarter': ['First quarter', 'প্রথম অর্ধচন্দ্র'], 'last-quarter': ['Last quarter', 'শেষ অর্ধচন্দ্র'],
  'waxing-crescent': ['Waxing crescent', 'বর্ধমান সরু চাঁদ'], 'waxing-gibbous': ['Waxing gibbous', 'বর্ধমান, প্রায় পূর্ণ'],
  'waning-gibbous': ['Waning gibbous', 'ক্ষীয়মাণ, প্রায় পূর্ণ'], 'waning-crescent': ['Waning crescent', 'ক্ষীয়মাণ সরু চাঁদ']
};
const svgElement = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};
function nightArcPoint(f, width, horizonY, depth, margin) {
  const x = margin + (width - 2 * margin) * (1 - f);
  return { x, y: horizonY + depth * Math.sin(Math.PI * f) };
}
function nightArcPath(width, horizonY, depth, margin, steps = 64) {
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const p = nightArcPoint(i / steps, width, horizonY, depth, margin);
    d += `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return d;
}

function altitudePassPoint(f, altitude, width, horizonY, apexY, nightDepth, margin) {
  const x = margin + (width - 2 * margin) * Math.max(0, Math.min(1, f));
  const y = altitude >= 0
    ? horizonY - Math.min(1, altitude / 90) * (horizonY - apexY)
    : horizonY + Math.min(1, -altitude / 18) * nightDepth;
  return { x, y };
}

function altitudePassPath(start, end, positionAt, width, horizonY, apexY, nightDepth, margin, steps = 72) {
  if (!start || !end || end <= start) return '';
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const at = new Date(start.getTime() + (end.getTime() - start.getTime()) * f);
    const position = positionAt(at);
    const point = altitudePassPoint(f, position.altitude, width, horizonY, apexY, nightDepth, margin);
    d += `${i ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }
  return d;
}
function updateSky(force = false) {
  const panel = $('skyPanel');
  if (!panel) return;
  if (!hasLocation()) { panel.hidden = true; return; }
  panel.hidden = false;
  const now = new Date();
  const W = panel.clientWidth, Hh = panel.clientHeight;
  if (!W || !Hh) return;
  const key = `${Math.floor(now.getTime() / 1000)}|${lang()}|${state.clock}|${state.lat}|${state.lon}|${state.adjustments.sunrise}|${W}x${Hh}`;
  if (!force && key === lastSkyKey) return;
  lastSkyKey = key;
  const bn = lang() === 'bn';
  const u = Math.max(.72, Hh / 150);
  const margin = Math.max(28, W * .045);
  const horizonY = Hh * .65;
  const apexY = Hh * .25;
  const nightDepth = Hh * .10;
  const times = getTimes(startOfDay(now));
  const sun = sunPosition(now, state.lat, state.lon);
  const phase = moonPhase(now);
  const moon = moonPosition(now, state.lat, state.lon);
  const passCacheKey = `${Math.floor(now.getTime() / 60000)}|${state.lat}|${state.lon}`;
  const moonIsUp = moon.altitude > -0.833;
  if (passCacheKey !== moonPassCacheKey || (moonPassCache && moonIsUp !== moonPassCache.up)) {
    moonPassCache = moonPass(now, state.lat, state.lon);
    priorMoonPassCache = moonPass(new Date(now.getTime() - 24 * 3600000), state.lat, state.lon);
    moonPassCacheKey = passCacheKey;
  }
  const pass = { ...(moonPassCache || {}), up: moonIsUp };
  const priorMoonPass = priorMoonPassCache || {}; 
  const okTimes = !!times && Number.isFinite(times.sunrise?.getTime()) && Number.isFinite(times.sunset?.getTime()) && times.sunset > times.sunrise;
  const svg = $('skySvg');
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
  $('skyClipRect').setAttribute('width', W); $('skyClipRect').setAttribute('height', Hh);
  const stars = $('skyStars');
  const starSize = `${W}x${Hh}`;
  if (stars && stars.dataset.size !== starSize) {
    stars.textContent = '';
    stars.dataset.size = starSize;
    for (let i = 0; i < 34; i++) {
      const x = ((i * 73 + 19) % 997) / 997 * W;
      const y = (0.08 + ((i * 37 + 11) % 57) / 100) * Hh;
      const radius = 0.35 + (i % 4) * 0.16;
      const star = svgElement('circle', { class: 'sky-star', cx: x.toFixed(2), cy: y.toFixed(2), r: radius.toFixed(2) });
      star.style.animationDelay = `${(i % 9) * -0.37}s`;
      stars.append(star);
    }
  }
  $('skyHorizon').setAttribute('d', `M${margin * .55} ${horizonY.toFixed(1)}H${(W - margin * .55).toFixed(1)}`);
  // Fine radial instrument grid: two concentric arcs and evenly spaced radial bearings.
  const rx = (W - margin * 1.8) / 2;
  $('skyGridOuter').setAttribute('d', `M${margin} ${horizonY}A${rx} ${Hh * .66} 0 0 1 ${W - margin} ${horizonY}`);
  $('skyGridInner').setAttribute('d', `M${margin + rx * .18} ${horizonY}A${rx * .82} ${Hh * .53} 0 0 1 ${W - margin - rx * .18} ${horizonY}`);
  let radial = '';
  for (let i = 0; i <= 12; i++) {
    const f = i / 12, p = timeArcPoint(f, W, horizonY, apexY, margin);
    radial += `M${p.x.toFixed(1)} ${horizonY.toFixed(1)}V${(p.y - 3 * u).toFixed(1)} `;
  }
  $('skyGridRadials').setAttribute('d', radial);
  $('skyObservatoryGlow').setAttribute('cx', (W / 2).toFixed(1));
  $('skyObservatoryGlow').setAttribute('cy', (horizonY - Hh * .12).toFixed(1));
  $('skyObservatoryGlow').setAttribute('r', (Math.min(W * .28, Hh * 1.1)).toFixed(1));

  const sunUp = okTimes && now >= times.sunrise && now < times.sunset;
  const yesterdayTimes = getTimes(addDays(startOfDay(now), -1));
  const tomorrowTimes = getTimes(addDays(startOfDay(now), 1));
  const sunNightStart = okTimes ? (now < times.sunrise ? yesterdayTimes?.sunset : times.sunset) : null;
  const sunNightEnd = okTimes ? (now < times.sunrise ? times.sunrise : tomorrowTimes?.sunrise) : null;
  const pathKey = [dateKey(now), state.lat, state.lon, W, Hh, times?.sunrise?.getTime(), times?.sunset?.getTime(), pass.up, pass.rise?.getTime(), pass.set?.getTime(), priorMoonPass.set?.getTime()].join('|');
  if (pathKey !== lastSkyPathKey) {
    $('skyArcDay').setAttribute('d', okTimes ? altitudePassPath(times.sunrise, times.sunset, at => sunPosition(at, state.lat, state.lon), W, horizonY, apexY, nightDepth, margin) : '');
    $('skyArcNight').setAttribute('d', sunNightStart && sunNightEnd ? altitudePassPath(sunNightStart, sunNightEnd, at => sunPosition(at, state.lat, state.lon), W, horizonY, apexY, nightDepth, margin) : '');
    if (pass.up && pass.rise && pass.set) {
      $('skyMoonArc').setAttribute('d', altitudePassPath(pass.rise, pass.set, at => moonPosition(at, state.lat, state.lon), W, horizonY - 4 * u, Math.max(4, apexY - 8 * u), nightDepth * .78, margin));
      $('skyMoonNightArc').setAttribute('d', '');
    } else if (priorMoonPass.set && pass.rise && pass.rise > priorMoonPass.set) {
      $('skyMoonNightArc').setAttribute('d', altitudePassPath(priorMoonPass.set, pass.rise, at => moonPosition(at, state.lat, state.lon), W, horizonY + 4 * u, horizonY + 4 * u, nightDepth * .78, margin));
      $('skyMoonArc').setAttribute('d', '');
    }
    lastSkyPathKey = pathKey;
  }
  let sunPoint;
  if (okTimes && sunUp) {
    sunPoint = altitudePassPoint(passFraction(times.sunrise, times.sunset, now) ?? .5, sun.altitude, W, horizonY, apexY, nightDepth, margin);
  } else if (sunNightStart && sunNightEnd && sunNightEnd > sunNightStart) {
    const f = Math.max(0, Math.min(1, (now - sunNightStart) / (sunNightEnd - sunNightStart)));
    sunPoint = altitudePassPoint(f, sun.altitude, W, horizonY, apexY, nightDepth, margin);
  }
  sunPoint ||= { x: W / 2, y: horizonY + nightDepth * .6 };
  const sunScale = Math.max(.82, Math.min(1.25, u));
  $('skySun').style.transform = `translate(${sunPoint.x.toFixed(1)}px, ${sunPoint.y.toFixed(1)}px) scale(${sunScale.toFixed(3)})`;
  $('skySun').style.opacity = sunUp ? '1' : '.45';
  panel.style.setProperty('--sky-i', sunIntensity(sun.altitude, 90 - Math.abs(state.lat - sun.declination)).toFixed(3));

  let moonPoint;
  const moonF = pass.up ? passFraction(pass.rise, pass.set, now) : null;
  if (pass.up && pass.rise && pass.set && moonF !== null) {
    moonPoint = altitudePassPoint(moonF, moon.altitude, W, horizonY - 4 * u, Math.max(4, apexY - 8 * u), nightDepth * .78, margin);
  } else if (priorMoonPass.set && pass.rise && pass.rise > priorMoonPass.set) {
    const f = Math.max(0, Math.min(1, (now - priorMoonPass.set) / (pass.rise - priorMoonPass.set)));
    moonPoint = altitudePassPoint(f, moon.altitude, W, horizonY + 4 * u, horizonY + 4 * u, nightDepth * .78, margin);
  }
  moonPoint ||= { x: W / 2, y: horizonY + nightDepth * .45 };
  $('skyMoon').style.transform = `translate(${moonPoint.x.toFixed(1)}px, ${moonPoint.y.toFixed(1)}px) scale(${sunScale.toFixed(3)})`;
  $('skyMoon').style.opacity = pass.up ? '1' : '.56';
  $('skyMoon').classList.toggle('is-below', !pass.up);
  const litD = moonLitPath(phase.illumination, phase.waxing, 0, 0, 5.2, state.lat < 0);
  $('skyMoonLit').setAttribute('d', litD); $('skyMoonClipPath').setAttribute('d', litD);

  skyColors(sun.altitude, okTimes ? now < times.dhuhr : now.getHours() < 12).forEach((hex, i) => panel.style.setProperty(`--sk-l${i}`, hex));
  panel.dataset.mode = sunUp ? 'day' : 'night';
  if (stars) stars.style.opacity = String(Math.max(0, Math.min(1, (-sun.altitude + 1) / 18))); 

  // Exact prohibited intervals from the same rule engine used everywhere else in the app.
  const zonesEl = $('skyZones');
  zonesEl.textContent = '';
  const intervals = okTimes ? prohibitedIntervals(times) : [];
  for (const zone of zoneSpans(intervals, times.sunrise, times.sunset)) {
    const g = svgElement('g', { class: `sky-zone z-${zone.key}` });
    const x0 = margin + (W - 2 * margin) * zone.f0;
    const x1 = margin + (W - 2 * margin) * zone.f1;
    const bandY = Hh * .79;
    const band = svgElement('rect', { class: 'sky-zone-track', x: x0.toFixed(2), y: bandY.toFixed(2), width: Math.max(2, x1 - x0).toFixed(2), height: Math.max(3, Hh * .035).toFixed(2), rx: 2 });
    const sourceInterval = intervals.find(item => item.key === zone.key);
    const active = !!sourceInterval && now >= sourceInterval.start && now < sourceInterval.end;
    if (active) g.classList.add('is-active');
    g.append(band); zonesEl.append(g);
  }
  const footer = $('skyObservatoryFooter');
  footer.innerHTML = intervals.map(item => {
    const label = PROHIBITED_LABELS[item.key][bn ? 'bn' : 'en'];
    const active = now >= item.start && now < item.end;
    return `<span class="sky-zone-chip${active ? ' is-active' : ''}"><i></i><b>${escapeHtml(label)}</b><small>${escapeHtml(fmt(item.start))}–${escapeHtml(fmt(item.end))}</small></span>`;
  }).join('');
  const percent = Math.round(phase.illumination * 100);
  const phaseText = PHASE_NAMES[phaseName(phase)][bn ? 1 : 0];
  $('skyHeading').textContent = bn ? 'চাঁদ ও সূর্যের অবস্থান' : 'CELESTIAL OBSERVATORY';
  $('skyPosition').textContent = bn
    ? `সূর্য ${localizeDigits(Math.round(sun.altitude))}°/${localizeDigits(Math.round(sun.azimuth))}° · চাঁদ ${localizeDigits(Math.round(moon.altitude))}°/${localizeDigits(Math.round(moon.azimuth))}° · ${localizeDigits(percent)}% ${phaseText}`
    : `SUN ${Math.round(sun.altitude)}° / ${Math.round(sun.azimuth)}° · MOON ${Math.round(moon.altitude)}° / ${Math.round(moon.azimuth)}° · ${percent}% ${phaseText.toUpperCase()}`;
  const moonRiseText = pass.rise ? fmt(pass.rise) : '—';
  const moonSetText = pass.set ? fmt(pass.set) : '—';
  $('skyTimes').textContent = okTimes
    ? (bn ? `সূর্যোদয় ${fmt(times.sunrise)} · সৌর মধ্যাহ্ন ${fmt(times.solarNoon)} · সূর্যাস্ত ${fmt(times.sunset)} · চন্দ্রোদয় ${moonRiseText} · চন্দ্রাস্ত ${moonSetText}` : `SUNRISE ${fmt(times.sunrise)} · SOLAR NOON ${fmt(times.solarNoon)} · SUNSET ${fmt(times.sunset)} · MOONRISE ${moonRiseText} · MOONSET ${moonSetText}`)
    : (bn ? `চন্দ্রোদয় ${moonRiseText} · চন্দ্রাস্ত ${moonSetText}` : `MOONRISE ${moonRiseText} · MOONSET ${moonSetText}`);
  const parts = [
    bn ? `সূর্যের উচ্চতা ${localizeDigits(Math.round(sun.altitude))}°, দিগংশ ${localizeDigits(Math.round(sun.azimuth))}°` : `Sun altitude ${Math.round(sun.altitude)}°, azimuth ${Math.round(sun.azimuth)}°`,
    bn ? `চাঁদের উচ্চতা ${localizeDigits(Math.round(moon.altitude))}°, দিগংশ ${localizeDigits(Math.round(moon.azimuth))}°; ${localizeDigits(percent)}% আলোকিত, ${phaseText}` : `Moon altitude ${Math.round(moon.altitude)}°, azimuth ${Math.round(moon.azimuth)}°; ${percent}% lit, ${phaseText}`
  ];
  if (okTimes) parts.push(`${bn ? 'সূর্যোদয়' : 'Sunrise'} ${fmt(times.sunrise)}`, `${bn ? 'সূর্যাস্ত' : 'Sunset'} ${fmt(times.sunset)}`);
  if (pass.rise && pass.set) parts.push(`${bn ? 'চাঁদ ওঠে' : 'Moonrise'} ${fmt(pass.rise)}`, `${bn ? 'চাঁদ ডোবে' : 'Moonset'} ${fmt(pass.set)}`);
  panel.setAttribute('aria-label', parts.join(' · '));
  panel.title = parts.join(' · ');
}

function fardDisplayName(event) {
  return slotName(event.key, event.date);
}

/* Tray tooltip: next obligatory prayer and time left. Updated from render()
   and the 15-second tick (which keeps running while hidden to the tray); the
   tray API is only called when the text actually changes (about once a minute). */
let trayIcon = null;
let trayLookup = null;
let lastTrayTooltip = '';
function getTray() {
  if (trayIcon) return Promise.resolve(trayIcon);
  if (!window.__TAURI_INTERNALS__) return Promise.resolve(null);
  if (!trayLookup) {
    trayLookup = TrayIcon.getById('main')
      .then(icon => { trayIcon = icon; return icon; })
      .catch(() => null)
      .finally(() => { trayLookup = null; });
  }
  return trayLookup;
}

function updateTrayTooltip(now = new Date()) {
  const next = hasLocation() ? getNextPrayer(now) : null;
  const text = trayTooltipText(next ? { name: fardDisplayName(next), ms: next.start.getTime() - now.getTime(), lang: lang() } : { lang: lang() });
  if (text === lastTrayTooltip) return;
  lastTrayTooltip = text;
  getTray()
    .then(icon => icon?.setTooltip(text))
    .catch(() => { lastTrayTooltip = ''; });
}

/* Windows toasts (v1.3.3). Root cause of "no notifications on Windows 10": the notification plugin tags toasts with
   the app identifier and ignores the result, and Windows 10 silently drops a toast whose AppUserModelID is not
   registered by a Start Menu shortcut (portable EXE, installer run with /NS, shortcut removed). The native command
   `notify_native` (src-tauri/src/main.rs) toasts with the app's identity when that shortcut exists, otherwise with the
   always-registered PowerShell identity, and returns the real error. The plugin remains the fallback when the command
   does not exist (older shell, browser preview). Resolves to { ok, how, error }. */
function playNotificationSound() {
  if (state.sound) playCues([{ type: 'notify' }], state.tickStyle, window); // v1.3.4: louder, stronger version of the tick
}

async function deliverNotification(title, body) {
  try {
    const how = await invoke('notify_native', { title, body });
    playNotificationSound();
    return { ok: true, how: typeof how === 'string' ? how : '' };
  } catch (error) {
    const message = String((error && error.message) || error || '');
    if (!/not found|unknown command|not allowed/i.test(message)) return { ok: false, error: message };
  }
  try {
    // sendNotification() from the plugin returns nothing (not a Promise); tolerate both forms.
    const result = sendNotification({ title, body });
    if (result && typeof result.then === 'function') await result;
    playNotificationSound();
    return { ok: true, how: 'plugin' };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error || '') };
  }
}

function sendReminder(id, title, body) {
  const forget = () => { delete state.reminderSent[id]; save(); };
  deliverNotification(title, body).then(result => { if (!result.ok) forget(); }, forget);
}

async function sendTestNotification() {
  const status = $('notificationStatus');
  const bn = lang() === 'bn';
  const say = message => { status.textContent = message; };
  say(bn ? 'পাঠানো হচ্ছে…' : 'Sending…');
  try {
    if (!(await isPermissionGranted())) await requestPermission();
  } catch { /* desktop always grants; ignore */ }
  const result = await deliverNotification(bn ? 'প্রার্থনার সময়' : 'Prayer Times', bn ? 'এটি একটি পরীক্ষামূলক বিজ্ঞপ্তি।' : 'This is a test notification. Prayer reminders will look like this.');
  let details = [];
  try { const lines = await invoke('notification_diagnostics'); if (Array.isArray(lines)) details = lines; } catch { /* browser preview */ }
  if (result.ok) say(`${bn ? 'পাঠানো হয়েছে। দেখতে না পেলে উইন্ডোজ সেটিংসে Notifications ও Focus assist (Do not disturb) পরীক্ষা করুন।' : 'Sent. If you do not see it, check Windows Settings > System > Notifications and Focus assist (Do not disturb).'}${details.length ? `\n${details.join('\n')}` : ''}`);
  else say(`${bn ? 'পাঠানো যায়নি: ' : 'Could not send: '}${result.error || ''}${details.length ? `\n${details.join('\n')}` : ''}`);
}

function checkNotifications() {
  if (!state.notifications || !liveTimes || !hasLocation()) return;
  const now = Date.now();
  for (const [id, sentAt] of Object.entries(state.transitionSent || {})) if (now - Number(sentAt) > 7 * 86400000) delete state.transitionSent[id];
  const today = startOfDay(new Date());
  const dates = [addDays(today, -1), today, addDays(today, 1), addDays(today, 2)];
  const events = [];
  for (const date of dates) {
    const times = getTimes(date), nextTimes = getTimes(addDays(date, 1));
    if (!times || !nextTimes) continue;
    events.push(...getFardEvents(date, times, nextTimes), ...getVoluntaryEvents(date, times, nextTimes));
  }
  const starting = [], ending = [], transitionIds = [];
  const grace = 2 * 60 * 1000;
  for (const event of events) {
    const name = prayerName(event.key);
    for (const [type, at, bucket] of [['start', event.start.getTime(), starting], ['end', event.end.getTime(), ending]]) {
      const id = `transition:${dateKey(event.date)}:${event.key}:${type}`;
      if (now >= at && now - at <= grace && !state.transitionSent[id]) {
        bucket.push(name);
        transitionIds.push(id);
      }
    }
  }
  if (transitionIds.length) {
    for (const id of transitionIds) state.transitionSent[id] = now;
    save();
    const next = getNextEvent(new Date(now));
    const nextText = next ? `${prayerName(next.key)} in ${countdown(next.start.getTime() - now)}` : '';
    const body = [
      starting.length ? `Starting: ${[...new Set(starting)].join(', ')}` : '',
      ending.length ? `Ending: ${[...new Set(ending)].join(', ')}` : '',
      nextText ? `Next prayer: ${nextText}` : ''
    ].filter(Boolean).join(' · ');
    deliverNotification(lang() === 'bn' ? 'নামাজের সময়সূচির পরিবর্তন' : 'Prayer event update', body).then(result => {
      if (!result.ok) { for (const id of transitionIds) delete state.transitionSent[id]; save(); }
    });
  }
  for (const event of events.filter(item => item.kind === 'fard')) {
    const lead = Number(state.preReminders[event.key] || 0);
    if (!lead) continue;
    const id = `${dateKey(event.date)}:${event.key}:before`;
    const fireAt = preReminderFireAt(event.start, lead);
    if (isReminderDue(now, fireAt, event.start.getTime()) && !state.reminderSent[id]) {
      state.reminderSent[id] = now;
      const title = lang() === 'bn' ? `${prayerName(event.key)} শুরু হতে যাচ্ছে` : `${prayerName(event.key)} is approaching`;
      const body = lang() === 'bn' ? `আর ${localizeDigits(lead)} মিনিট পর সময় শুরু হবে।` : `Begins in ${lead} minutes.`;
      sendReminder(id, title, body);
      save();
    }
  }
  for (const event of events) {
    const leadMinutes = Number(state.reminders[event.key] || 0);
    if (!leadMinutes) continue;
    const record = dayRecord(event.date, false);
    if (record[event.kind]?.[event.key]) continue;
    const id = `${dateKey(event.date)}:${event.key}`;
    const fireAt = event.end.getTime() - leadMinutes * 60000;
    if (fireAt < event.start.getTime()) continue;
    if (isReminderDue(now, fireAt, event.end.getTime()) && !state.reminderSent[id]) {
      state.reminderSent[id] = Date.now();
      const title = lang() === 'bn' ? `${prayerName(event.key)}-এর সময় শেষ হচ্ছে` : `${prayerName(event.key)} period is ending`;
      const body = lang() === 'bn'
        ? `আর ${localizeDigits(leadMinutes)} মিনিট বাকি। ${prayerName(event.key)} সম্পন্ন করুন।`
        : `${leadMinutes} minutes remain before the ${prayerName(event.key)} period ends.`;
      sendReminder(id, title, body);
      save();
    }
  }
}

function boundaryEvents(now) {
  const today = startOfDay(now);
  const events = [];
  for (const offset of [-1, 0, 1]) {
    const date = addDays(today, offset);
    const times = getTimes(date);
    const nextTimes = getTimes(addDays(date, 1));
    if (!times || !nextTimes) continue;
    events.push(...getFardEvents(date, times, nextTimes), ...getVoluntaryEvents(date, times, nextTimes), ...prohibitedIntervals(times));
    if (times.midnight) events.push({ start: times.midnight, end: times.midnight });
    // heads-up moments for the progress line (the 20-45 minute window before each prayer, every 5 minutes; 10 minutes before Duha/Awwabin)
    for (const f of getFardEvents(date, times, nextTimes)) for (let lead = 20; lead <= 45; lead += 5) { const at = addMinutes(f.start, -lead); events.push({ start: at, end: at }); }
    for (const v of getVoluntaryEvents(date, times, nextTimes)) if (v.key === 'duha' || v.key === 'awwabin') { const at = addMinutes(v.start, -VOLUNTARY_HEADS_UP_MINUTES); events.push({ start: at, end: at }); }
  }
  return events;
}

function armBoundary() {
  clearTimeout(boundaryTimer);
  const now = new Date();
  lastRenderedDay = dateKey(now);
  boundaryAt = hasLocation() ? nextBoundary(boundaryEvents(now), now) : null;
  boundaryTimer = setTimeout(refreshIfStale, boundaryDelay(boundaryAt, now.getTime()));
}

/** Rebuild the view when a boundary, a day change, a sleep/wake or a clock jump made it stale. */
function refreshIfStale() {
  const now = Date.now();
  if (needsRefresh({ now, boundaryAt, lastTickAt, todayKey: dateKey(new Date(now)), lastDateKey: lastRenderedDay })) {
    const todayKey = dateKey(new Date(now));
    if (todayKey !== lastScheduleDate) {
      const wasFollowingToday = dateKey(selectedDate) === lastScheduleDate;
      lastScheduleDate = todayKey;
      if (wasFollowingToday) selectedDate = startOfDay(new Date(now));
    }
    lastTickAt = now;
    render();
    checkNotifications();
  } else {
    lastTickAt = now;
    clearTimeout(boundaryTimer);
    boundaryTimer = setTimeout(refreshIfStale, boundaryDelay(boundaryAt, now));
  }
}

function startVisibleTick() {
  if (tickHandle || document.hidden) return;
  updateClock();
  updateCountdownWidgets();
  lastTickAt = Date.now();
  tickHandle = setInterval(() => {
    refreshIfStale();
    updateClock();
    updateCountdownWidgets();
    if (currentPage === 'home') updateCardCountdowns(); // writes only when the minute text changes
  }, 1000);
}

function stopVisibleTick() {
  if (!tickHandle) return;
  clearInterval(tickHandle);
  tickHandle = null;
  lastTickAt = null;
}

function init() {
  applyTheme();
  document.body.classList.toggle('compact-mode', !!state.compact);
  $('themeSelect').innerHTML = THEMES.map(theme => `<option value="${escapeHtml(theme[0])}">${escapeHtml(theme[0])} (${theme[1]})</option>`).join('');
  renderAdjustmentControls();
  syncSettingsControls();

  $('themeSelect').addEventListener('change', event => {
    state.theme = event.target.value;
    save();
    applyTheme();
    $('themePreview').innerHTML = '';
  });
  $('languageSelect').addEventListener('change', event => { state.language = event.target.value; save(); render(); updateClock(); syncSettingsControls(); });
  $('soundToggle').addEventListener('change', event => { state.sound = event.target.checked; save(); });
  $('uiFontSelect').addEventListener('change', event => { state.uiFont = sanitizeUiFont(event.target.value); save(); applyUiFont(); });
  $('clockFormatSelect').addEventListener('change', event => { state.clock = sanitizeClockFormat(event.target.value); save(); render(); updateClock(); });
  const changeProfile = patch => {
    state.profile = sanitizeProfile({ ...state.profile, ...patch });
    save();
    // Recompute immediately; history is keyed by date and is not touched.
    liveTimes = null;
    render();
    renderProfileSettings();
    showToast('Calculation profile updated');
  };
  $('methodSelect').addEventListener('change', event => changeProfile({ method: event.target.value }));
  $('schoolSelect').addEventListener('change', event => changeProfile({ school: event.target.value, method: presetForSchool(event.target.value, state.profile.method) }));
  $('highLatSelect').addEventListener('change', event => changeProfile({ highLatitude: event.target.value }));
  $('tickStyleSelect').addEventListener('change', event => {
    state.tickStyle = sanitizeTickStyle(event.target.value);
    save();
    // Preview the chosen style once (if sound is on).
    if (state.sound) playCues([{ type: 'tick', layer: 'sunnah', step: 1 }], state.tickStyle, window);
  });
  $('compactToggle').addEventListener('change', event => {
    state.compact = event.target.checked;
    document.body.classList.toggle('compact-mode', state.compact);
    save();
  });
  $('notificationsToggle').addEventListener('change', event => requestPrayerNotifications(event.target.checked));
  document.querySelectorAll('[data-card]').forEach(box => box.addEventListener('change', event => {
    state.cards[box.dataset.card] = event.target.checked;
    save();
    applySectionVisibility();
    translateRenderedText();
  }));
  $('testNotification').addEventListener('click', () => { sendTestNotification(); });
  $('startupToggle').addEventListener('change', async event => {
    try {
      if (event.target.checked) await enableAutostart();
      else await disableAutostart();
      state.startup = event.target.checked;
      save();
      showToast(state.startup ? 'Will start with Windows' : 'Windows startup disabled');
    } catch {
      event.target.checked = false;
      showToast('Could not update Windows startup setting');
    }
  });
  $('settingsToggle').addEventListener('click', () => {
    if (currentPage === 'settings') openHome();
    else if (currentPage === 'home') openSettings();
  });
  $('nextName').addEventListener('click', () => {
    const detail = $('nextDescription');
    detail.hidden = !detail.hidden;
    $('nextName').setAttribute('aria-expanded', String(!detail.hidden));
  });
  $('nextCountdownOpen').addEventListener('click', openNextCountdown);
  $('countdownBack').addEventListener('click', openHome);
  $('liveClockOpen').addEventListener('click', openTemporalView);
  $('temporalBack').addEventListener('click', openHome);
  $('parseMapLink').addEventListener('click', useMapLink);
  $('saveLocation').addEventListener('click', saveLocation);
  $('prevDay').addEventListener('click', () => { selectedDate = addDays(selectedDate, -1); render(); });
  $('nextDay').addEventListener('click', () => { selectedDate = addDays(selectedDate, 1); render(); });
  $('exportData').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ version: 1, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), data: state }, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a');
    const url = URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = 'prayer-times-backup.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('importBackup').addEventListener('click', importBackupFile);
  $('recoveryDetails').addEventListener('toggle', refreshRecoveryControls);
  let recoveryHoldTimer = null;
  const recoveryButton = $('recoveryHoldButton');
  const cancelRecoveryHold = () => { if (recoveryHoldTimer) clearTimeout(recoveryHoldTimer); recoveryHoldTimer = null; recoveryButton.classList.remove('is-holding'); };
  recoveryButton.addEventListener('pointerdown', event => {
    if (recoveryButton.disabled) return;
    event.preventDefault();
    cancelRecoveryHold();
    recoveryButton.classList.add('is-holding');
    recoveryHoldTimer = setTimeout(() => { cancelRecoveryHold(); performPrayerRecovery(); }, 3000);
  });
  ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(name => recoveryButton.addEventListener(name, cancelRecoveryHold));
  $('resetData').addEventListener('click', async () => {
    if (!confirm('Delete all locally stored settings, location and prayer history? You will need to enter a Google Maps link or coordinates again.')) return;
    try { await disableAutostart(); } catch { /* reset remains local even if Windows registration cannot be changed */ }
    localStorage.removeItem('prayer-times-data');
    Object.assign(state, DEFAULTS, { history: {}, reminders: {}, preReminders: {}, reminderSent: {}, adjustments: { ...DEFAULTS.adjustments }, profile: { ...DEFAULT_PROFILE } });
    save();
    syncSettingsControls();
    applyTheme();
    openSettings();
    showToast('Local data reset');
  });

  hadPreviousProgressLine = !!readLineMemory().current?.text;
  $('timezoneLabel').textContent = `${Intl.DateTimeFormat().resolvedOptions().timeZone || (lang()==='bn'?'ডিভাইসের স্থানীয় সময়':'Device local time')} · ${new Intl.DateTimeFormat('en', { timeZoneName: 'longOffset' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value.replace('GMT', 'UTC') || ''}`;
  render();
  if (!hasLocation()) openSettings();
  startVisibleTick();
  // Small, deliberate keyboard set: navigation plus fullscreen and help.
  let desktopWindow = null;
  try { desktopWindow = getCurrentWindow(); } catch { desktopWindow = null; /* plain browser preview */ }
  const keyboardHelp = $('keyboardHelp');
  const toggleKeyboardHelp = () => { if (keyboardHelp.open) keyboardHelp.close(); else keyboardHelp.showModal(); };
  $('closeKeyboardHelp').addEventListener('click', () => keyboardHelp.close());
  keyboardHelp.addEventListener('click', event => { if (event.target === keyboardHelp) keyboardHelp.close(); });
  // Native <dialog> closes itself on Escape; keep our handler from also exiting fullscreen.
  let helpClosedByEscapeAt = 0;
  keyboardHelp.addEventListener('cancel', () => { helpClosedByEscapeAt = Date.now(); });
  const isFullscreen = async () => {
    if (desktopWindow) return desktopWindow.isFullscreen();
    return !!document.fullscreenElement;
  };
  const setFullscreen = async value => {
    if (desktopWindow) {
      // v1.3.4: Rust leaves the maximised state first (fixes the stuck/offset mouse after F11); the plugin call is the fallback
      try { await invoke('set_window_fullscreen', { fullscreen: value }); }
      catch { await desktopWindow.setFullscreen(value); }
      document.documentElement.classList.toggle('is-fullscreen', value);
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); // re-measure and re-hit-test the page
      return;
    }
    if (value) return document.documentElement.requestFullscreen?.();
    return document.fullscreenElement ? document.exitFullscreen?.() : undefined;
  };
  // Sunnah (blue) / Nafl (gold) sub-ticks in the prayer list and live events.
  document.addEventListener('click', event => {
    const tick = event.target instanceof Element ? event.target.closest('[data-sub-layer]') : null;
    if (!tick || tick.disabled) return;
    toggleSubPrayer(tick.dataset.subLayer, tick.dataset.subKey, tick.dataset.subPrayer, tick.dataset.subDate);
  });
  document.addEventListener('keydown', async event => {
    const target = event.target;
    const action = shortcutFor(event, { helpOpen: keyboardHelp.open });
    if (!action) return;
    if (action === 'fullscreen') {
      event.preventDefault();
      try { await setFullscreen(!(await isFullscreen())); } catch { showToast('Fullscreen mode is unavailable'); }
      return;
    }
    if (action === 'escape') {
      if (keyboardHelp.open) { keyboardHelp.close(); return; }
      if (Date.now() - helpClosedByEscapeAt < 250) return;
      try {
        if (await isFullscreen()) { await setFullscreen(false); return; }
      } catch { /* ignore outside fullscreen */ }
      // Existing Back behaviour: leave the countdown screen; Settings returns home.
      const typing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (currentPage === 'countdown') openHome();
      else if (currentPage === 'settings' && !typing && hasLocation()) openHome();
      return;
    }
    event.preventDefault();
    if (action === 'help') {
      toggleKeyboardHelp();
    } else if (action === 'home') {
      // Home goes to the home page (from Settings or a countdown) and to its top.
      if (currentPage !== 'home' && hasLocation()) {
        openHome();
        window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
      } else window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (action === 'pageUp') {
      window.scrollBy({ top: -pageScrollDistance(window.innerHeight), behavior: 'smooth' });
    } else if (action === 'pageDown') {
      window.scrollBy({ top: pageScrollDistance(window.innerHeight), behavior: 'smooth' });
    } else if (action === 'end') {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }
  });
  document.addEventListener('visibilitychange', () => { document.documentElement.classList.toggle('page-hidden', document.hidden); });
  window.addEventListener('resize', () => requestAnimationFrame(() => updateSky(true)));
  window.addEventListener('focus', () => onWindowReopened('focus'));
  try { // Rust-side signals from src-tauri/src/main.rs (tray click, tray menu, second launch, close-to-tray)
    listen('main-window-hidden', () => { windowWasHidden = true; }).catch(() => {});
    listen('main-window-shown', () => onWindowReopened('rust')).catch(() => {});
    if (hadPreviousProgressLine) onWindowReopened('rust'); // A full app restart also selects a fresh eligible line.
  } catch { /* browser preview: no Tauri event bridge */ }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      windowWasHidden = true;
      stopVisibleTick();
    } else {
      onWindowReopened('visibility'); // a new Today's Progress line once per reopen (before render() re-reads the lock)
      render(); // Refresh after a tray restore or Windows wake.
      startVisibleTick();
      checkNotifications();
    }
  });
  checkNotifications();
  renderHandle = setInterval(() => {
    const todayKey = dateKey(new Date());
    if (todayKey !== lastScheduleDate) {
      const wasFollowingToday = dateKey(selectedDate) === lastScheduleDate;
      lastScheduleDate = todayKey;
      if (wasFollowingToday) selectedDate = startOfDay(new Date());
      render();
    } else {
      if (currentPage === 'home') {
        renderLiveEvents();
        renderProgress();
        updateCardCountdowns();
      }
    }
    checkNotifications();
    updateTrayTooltip();
  }, 15000);
  isAutostartEnabled().then(enabled => { state.startup = enabled; $('startupToggle').checked = enabled; }).catch(() => {});
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

init();
