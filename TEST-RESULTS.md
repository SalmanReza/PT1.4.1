# Test results — Prayer Times Desktop v1.4.0

## Source integrity

- The uploaded `/mnt/data/Prayer-Times-Windows-v1.3.5-Source.zip` remains untouched.
- Implementation was performed in a separate extracted working copy.

## Automated checks

- `npm test`: **202/202 passed**, 0 failed.
- `npm run check`: passed all JavaScript syntax checks, including the new best-time, recovery, source-label and digit modules.
- New/updated coverage includes the universal second-following-Fard lock, voluntary-event lock boundaries, Best Time state transitions, prayer-card categories, Completed Today, countdown-page completion controls, pre/post-Fard component eligibility, recovery of Fard/voluntary events, JSON backup validation/merge conflicts, clock/temporal-view wiring, grouped event notifications and Observatory path/resize wiring.

## Build checks not completed

- `npm run web:build`: failed because Vite is not installed in the supplied environment (`vite: not found`).
- `npm run build`: failed because the Tauri CLI is not installed (`tauri: not found`); Cargo/Rust are also unavailable.
- `npm ci --offline`: failed because the required Vite package was not cached.
- Online `npm ci`: timed out before dependencies could be installed.
- Rust/Cargo checks and Tauri packaging: not run; `cargo` and `rustc` are unavailable in this environment.
- Windows WebView2, NSIS installer, tray notification delivery, F11 fullscreen and mouse hit-testing: not run on a Windows machine.
- No real GUI screenshot or interactive browser test was possible in this environment.

## Important limitations — not claimed as completed

1. **Eclipse integration is outstanding.** No eclipse card, eclipse-contact calculation or 24-hour local visibility alert has been added. This requires validated astronomical source data and must not be approximated into a false prediction.
2. **Astronomical validation is outstanding.** Sun/Moon coordinates and altitude-based paths update in real time in the code, but they have not been compared against an independent ephemeris or validated on real Windows display sizes. The Observatory should not yet be described as independently accuracy-verified.
3. **Language resources are partial.** The progress-message generator has timestamped 90-day message-ID avoidance, same-language near-duplicate filtering, a fallback message pool and its existing bilingual grammar/template logic. It does not contain complete English and Bangla dictionaries.
4. **Religious review remains necessary.** Approximate Fajr/Asr/Maghrib highlight windows are labelled as UI reminders, not fixed Sunnah durations. The Madhab-aware Rak'ah summaries and all preferred-time guidance require a final scholarly review before release.
5. **Visual verification remains outstanding.** The four card identities, countdown page, Completed Today, temporal view, day/night Observatory and resize-stable colour logic have automated/static coverage, but still need a Windows WebView2 visual pass.

## Release recommendation

The source update is ready for a Windows build and a focused manual QA pass, but it is **not yet a verified Windows release**. Do not distribute it as fully validated until the outstanding items above—especially eclipse integration, astronomical validation, religious review and Windows UI testing—are resolved.
