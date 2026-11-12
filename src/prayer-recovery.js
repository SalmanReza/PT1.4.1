import { lockInstant } from './tick-lock.js';

const dayKey = value => {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const isComplete = (records, event) => !!records?.[dayKey(event.date)]?.fard?.[event.key];

/** Recovery is offered only after the two immediately preceding Fard events are complete. */
export function recoveryEligible(events, records, now = Date.now()) {
  const prior = (events || []).filter(event => event.kind === 'fard' && event.start.getTime() < now)
    .sort((a, b) => a.start - b.start).slice(-2);
  return prior.length === 2 && prior.every(event => isComplete(records, event));
}

/** Locked, unrecorded Fard events that may be selected for one-at-a-time recovery. */
export function recoverablePrayerEvents(events, records, now = Date.now()) {
  const ordered = [...(events || [])].sort((a, b) => a.start - b.start);
  return ordered.filter(event => {
    if (!['fard', 'voluntary'].includes(event.kind) || event.start.getTime() >= now || !!records?.[dayKey(event.date)]?.[event.kind]?.[event.key]) return false;
    const boundary = lockInstant({ kind: event.kind, key: event.key, date: event.date }, ordered, null);
    return !!boundary && now >= boundary.at;
  });
}

/** Merge JSON-compatible plain objects. Conflicts retain the current value. */
export function mergeBackupState(current, incoming) {
  const conflicts = [];
  const merge = (a, b, path) => {
    const plainA = a && typeof a === 'object' && !Array.isArray(a);
    const plainB = b && typeof b === 'object' && !Array.isArray(b);
    if (plainA && plainB) {
      const result = { ...a };
      for (const [key, value] of Object.entries(b)) {
        const child = path ? `${path}.${key}` : key;
        if (!(key in a)) result[key] = value;
        else result[key] = merge(a[key], value, child);
      }
      return result;
    }
    if (JSON.stringify(a) === JSON.stringify(b)) return a;
    conflicts.push(path || '(root)');
    return a;
  };
  return { data: merge(current || {}, incoming || {}, ''), conflicts };
}

export function validateBackup(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, reason: 'Backup must be a JSON object.' };
  if (!Number.isInteger(payload.version) || payload.version < 1) return { ok: false, reason: 'Backup format version is missing or invalid.' };
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) return { ok: false, reason: 'Backup data is missing or invalid.' };
  if (!payload.data.history || typeof payload.data.history !== 'object' || Array.isArray(payload.data.history)) return { ok: false, reason: 'Prayer history is missing or invalid.' };
  return { ok: true, data: payload.data, appVersion: String(payload.appVersion || 'unknown') };
}
