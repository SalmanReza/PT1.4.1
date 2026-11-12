/* Best-time guidance windows for the expanded prayer countdown.
 * A highlighted sub-window is a user-interface aid, not a new legal prayer
 * boundary. Where the Sunnah establishes a principle but no fixed minute
 * duration, the displayed prompt window is explicitly identified as approximate.
 */
const asMs = value => value instanceof Date ? value.getTime() : Number(value);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function bestTimeWindow(event, context = {}) {
  if (!event || !Number.isFinite(asMs(event.start)) || !Number.isFinite(asMs(event.end)) || asMs(event.end) <= asMs(event.start)) return null;
  const start = asMs(event.start), end = asMs(event.end), duration = end - start;
  const key = event.key;
  if (key === 'dhuhr') return null;
  const whole = (reason, source, approximate = false, reasonBn = '') => ({ start, end, reason, reasonBn, source, approximate });
  const prompt = (fraction, reason, source, reasonBn) => ({ start, end: Math.min(end, start + duration * fraction), reason, reasonBn, source, approximate: true });

  if (key === 'isha' || key === 'qiyam' || key === 'witr' || key === 'tahajjud') {
    const maghrib = asMs(context.maghrib), fajr = asMs(context.fajr);
    if (Number.isFinite(maghrib) && Number.isFinite(fajr) && fajr > maghrib) {
      const night = fajr - maghrib;
      const oneThird = maghrib + night / 3;
      const finalThird = maghrib + night * (2 / 3);
      if (key === 'isha') {
        const s = start, e = clamp(oneThird, start, end);
        if (e > s) return { start: s, end: e, reason: 'Sahih al-Bukhari describes Isha between the disappearance of twilight and the end of the first third of the night; another narration records the prayer delayed until midnight. The app highlights the first-third opportunity, not a requirement to delay.', reasonBn: 'সহিহ বুখারিতে ইশার সময় গোধূলি শেষ হওয়া থেকে রাতের প্রথম এক-তৃতীয়াংশ পর্যন্ত বর্ণিত হয়েছে; অন্য বর্ণনায় মধ্যরাত পর্যন্ত বিলম্বের কথা আছে। অ্যাপ প্রথম এক-তৃতীয়াংশের সুযোগটি দেখায়, বিলম্ব বাধ্যতামূলক করে না।', source: 'Sahih al-Bukhari 569, 572', approximate: false };
      }
      if (key === 'qiyam' || key === 'tahajjud' || key === 'witr') {
        const s = clamp(finalThird, start, end);
        if (end > s) return { start: s, end, reason: key === 'witr' ? 'The final third is especially virtuous for Witr when you are confident you will wake; otherwise pray Witr before sleeping.' : 'The final third of the night is especially virtuous for night prayer.', reasonBn: key === 'witr' ? 'জেগে উঠতে পারবেন বলে নিশ্চিত হলে রাতের শেষ এক-তৃতীয়াংশে বিতর উত্তম; না হলে ঘুমানোর আগে বিতর আদায় করুন।' : 'রাতের শেষ এক-তৃতীয়াংশে রাতের নামাজ আদায় করা বিশেষ ফজিলতপূর্ণ।', source: 'Sahih al-Bukhari 1145; Sahih Muslim 755a, 758', approximate: false };
      }
    }
  }
  if (key === 'maghrib') return prompt(.18, 'Pray promptly after sunset. The short highlighted window is an app reminder, not a fixed religious duration.', 'Sunan Abi Dawud 417 (Sahih al-Albani); Sahih Muslim 646a', 'সূর্যাস্তের পর দ্রুত মাগরিব আদায় করুন। ছোট সোনালি সময়টি অ্যাপের স্মরণ করানো, নির্দিষ্ট শরয়ি সময়সীমা নয়।');
  if (key === 'fajr') return prompt(.25, 'The Prophet’s Fajr practice is reported in the darkness of dawn. The highlighted portion is an approximate reminder, not a fixed limit.', 'Sahih al-Bukhari 565; Sahih Muslim 646a', 'ফজরের নামাজ অন্ধকার ভোরে আদায় করার বর্ণনা রয়েছে। সোনালি অংশটি আনুমানিক স্মরণ করানো, নির্দিষ্ট সীমা নয়।');
  if (key === 'asr') return prompt(.35, 'The Prophet’s Asr was described while the sun was still bright; the highlighted portion is an approximate reminder, not a fixed limit.', 'Sahih al-Bukhari 565; Sahih Muslim 646a', 'সূর্য উজ্জ্বল থাকতেই রাসুল ﷺ-এর আসর আদায়ের বর্ণনা রয়েছে। সোনালি অংশটি আনুমানিক স্মরণ করানো, নির্দিষ্ট সীমা নয়।');
  if (key === 'duha') return whole('Any time in the established Duha window is available; the Sunnah describes the prayer when the morning sun has risen and warmed.', 'Sahih Muslim 748a, 720', false, 'দুহার নির্ধারিত সময়ের মধ্যে যেকোনো সময় আদায় করা যায়; সকালের সূর্য কিছুটা উঁচু ও উষ্ণ হলে নামাজ আদায়ের বর্ণনা রয়েছে।');
  if (key === 'awwabin') return whole('No narrower universally agreed preferred segment is assigned; the app shows the actual scheduled opportunity.', 'Reports and scholarly application differ', true, 'সর্বসম্মতভাবে নির্ধারিত আরও সংকীর্ণ উত্তম সময় নেই; অ্যাপ প্রকৃত নির্ধারিত সুযোগটিই দেখায়।');
  if (key === 'eid_prayer') return whole('The prayer is performed after sunrise has risen sufficiently and before solar noon; follow the local congregation.', 'Sahih al-Bukhari 956; Sahih Muslim 889', false, 'সূর্য যথেষ্ট ওপরে ওঠার পর এবং সৌর মধ্যাহ্নের আগে ঈদের নামাজ আদায় করা হয়; স্থানীয় জামাতের সময় অনুসরণ করুন।');
  if (key === 'tarawih') return whole('The night prayer is performed after Isha during Ramadan; the app does not impose a single preferred minute.', 'Sahih al-Bukhari 2012; Sahih Muslim 761', false, 'রমজানে ইশার পর রাতের নামাজ আদায় করা হয়; অ্যাপ কোনো একক নির্দিষ্ট উত্তম মিনিট নির্ধারণ করে না।');
  return whole('No narrower preferred interval is asserted; use the prayer’s actual eligible period and your Madhab guidance.', 'School-specific guidance', true, 'আরও সংকীর্ণ উত্তম সময় নির্ধারণ করা হয়নি; নামাজের প্রকৃত উপযুক্ত সময় ও আপনার মাজহাবের নির্দেশনা অনুসরণ করুন।');
}

export function bestTimeState(window, now = Date.now()) {
  if (!window || !Number.isFinite(window.start) || !Number.isFinite(window.end) || window.end <= window.start) return { state: 'none', remaining: null };
  if (now < window.start) return { state: 'upcoming', remaining: window.start - now };
  if (now < window.end) return { state: 'active', remaining: window.end - now };
  return { state: 'passed', remaining: null };
}

export function bestTimeNote(key, language = 'en') {
  if (key === 'dhuhr') return { reason: language === 'bn' ? 'তীব্র গরম না থাকলে যোহর আগে এবং প্রচণ্ড গরমে বিলম্বে আদায়ের বর্ণনা রয়েছে। অ্যাপ স্থানীয় গরম বা কষ্ট অনুমান করতে পারে না, তাই সর্বজনীনভাবে আরও সংকীর্ণ উত্তম সময় নির্ধারণ করে না।' : 'The Sunnah describes praying Dhuhr earlier when there is no intense heat and delaying it when heat is severe. The app cannot infer local heat or hardship, so it does not designate a narrower universal preferred window.', source: 'Sahih Muslim 615c, 618' };
  return null;
}
