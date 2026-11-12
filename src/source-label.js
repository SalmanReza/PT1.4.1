/* Small bilingual source-label formatter shared by prayer references. */
const SOURCES = {
  B: ['Bukhari', 'বুখারি'], M: ['Muslim', 'মুসলিম'], BM: ['Bukhari & Muslim', 'বুখারি ও মুসলিম'],
  T: ['Tirmidhi', 'তিরমিজি'], N: ['Nasa’i', 'নাসায়ি'], ADT: ['Abu Dawud & Tirmidhi', 'আবু দাউদ ও তিরমিজি'],
  TN: ['Tirmidhi & Nasa’i', 'তিরমিজি ও নাসায়ি'], ADN: ['Abu Dawud & Nasa’i', 'আবু দাউদ ও নাসায়ি']
};
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const bnNum = text => String(text).replace(/[0-9]/g, d => BN_DIGITS[d]);

export function sourceLabel(code, lang = 'en') {
  if (!code) return '';
  const quran = /^Q(\d+:\d+(?:-\d+)?)$/.exec(code);
  if (quran) return lang === 'bn' ? `কুরআন ${bnNum(quran[1])}` : `Qur’an ${quran[1]}`;
  const pair = SOURCES[code];
  return pair ? pair[lang === 'bn' ? 1 : 0] : '';
}

