/* Visibility preferences for the four prayer-card categories. */
export const SECTION_KEYS = [];
export function sanitizeSections() { return {}; }
export const CARD_KEYS = Object.freeze({ prayerCards: ['obligatory', 'daily', 'situational', 'seasonal'] });
export const ALL_CARD_KEYS = Object.freeze(CARD_KEYS.prayerCards);
export function sanitizeCards(saved) {
  const input = saved && typeof saved === 'object' ? saved : {};
  return Object.fromEntries(ALL_CARD_KEYS.map(key => [key, typeof input[key] === 'boolean' ? input[key] : true]));
}
export function tabVisible() { return true; }
