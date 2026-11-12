/* Universal two-Fard-period recording lock.
 * A recorded Fard remains reversible through its own period and the following
 * Fard period; it locks at the start of the second following Fard period.
 * A voluntary event uses the same chronological Fard boundary: it locks when
 * the second Fard event after its own start begins. Attached Sunnah/Nafl parts
 * follow their associated Fard. This is a recording window only; it does not
 * extend the religiously valid time for performing a prayer.
 */
const ms = value => (value instanceof Date ? value.getTime() : Number(value));
export const lockKey = (kind, key) => `${kind}:${key}`;
export const NIGHT_KEYS = Object.freeze(['isha', 'qiyam', 'witr', 'tahajjud']);

/** Return the start of the second following Fard period. */
export function lockInstant(item, events = [], nextFajr = null) {
  const base = item.kind === 'sunnah' || item.kind === 'nafl'
    ? { kind: 'fard', key: item.prayer }
    : item;
  const own = events.find(event => event.kind === base.kind && event.key === base.key && (!base.date || (event.date && new Date(ms(event.date)).toDateString() === new Date(ms(base.date)).toDateString())));
  if (!own) return nextFajr == null ? null : { at: ms(nextFajr), by: 'fajr' };
  const ownStart = ms(own.start);
  const followingFard = events
    .filter(event => event.kind === 'fard' && ms(event.start) > ownStart)
    .sort((a, b) => ms(a.start) - ms(b.start));
  const boundary = followingFard[1];
  if (boundary) return { at: ms(boundary.start), by: boundary.key, date: boundary.date || null };
  return nextFajr == null ? null : { at: ms(nextFajr), by: 'fajr' };
}

export function isLockedAt(item, events, nextFajr, now, sealed = false) {
  if (sealed) return true;
  const lock = lockInstant(item, events, nextFajr);
  return !!lock && ms(now) >= lock.at;
}

export function dayIsLocked(dayKey, currentPrayerDayKey, watermark = null) {
  return dayKey < currentPrayerDayKey || (!!watermark && dayKey <= watermark);
}

export function nextWatermark(previous, currentPrayerDayKey, addDaysKey, lagDays = 1) {
  const target = addDaysKey(currentPrayerDayKey, -lagDays);
  if (!previous) return target;
  if (target <= previous) return previous;
  const step = addDaysKey(previous, 1);
  return step < target ? step : target;
}

export function sealRecord(record, itemsFor, now) {
  if (!record) return false;
  let changed = false;
  const flags = record.locked || {};
  for (const layer of ['fard', 'voluntary', 'sunnah', 'nafl']) {
    for (const key of Object.keys(record[layer] || {})) {
      if (!record[layer][key] || flags[lockKey(layer, key)]) continue;
      const { item, events, nextFajr } = itemsFor(layer, key);
      if (isLockedAt(item, events, nextFajr, now)) { flags[lockKey(layer, key)] = 1; changed = true; }
    }
  }
  if (changed) record.locked = flags;
  return changed;
}

export function lockTip(name, lang = 'en') {
  if (lang === 'bn') return name ? `${name} শুরু হওয়ার পর লক হয়েছে` : 'দ্বিতীয় পরবর্তী ফরজ ওয়াক্ত শুরু হওয়ায় লক হয়েছে';
  return name ? `Locked after ${name} began` : 'Locked after the second following Fard period began';
}
