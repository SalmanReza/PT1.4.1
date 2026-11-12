# Prayer Times — Windows desktop application (v1.4.0)

**Windows 10/11 x64 · Tauri 2 · Rust · WebView2 · NSIS**

© 2026–2027 Salman Reza Amit

Prayer Times is an offline-first Windows prayer companion. Prayer calculations, prayer records, preferences and location remain in the local application profile. It is not a browser extension and does not require an account or cloud service.

## Product boundaries

- **Qada is not a feature and is permanently excluded.** The app does not track missed prayers, outstanding prayers or make-up calculations.
- Historical-book, Seerah, Islamic-history and Qur’anic-revelation cards have been removed to keep the app lightweight.
- Qur'an and Sunnah remain the religious foundation for prayer guidance and rules. Relevant Qur'an/Hadith references are displayed with the prayer descriptions.
- The app makes no analytics, telemetry or cloud-sync requests. Location, settings and prayer history are stored locally.
- A fresh installation requires the user to enter coordinates or paste a Google Maps link. Shortened Maps links cannot be expanded offline; users can enter the coordinates manually.

## Included functionality

### Prayer cards and recording

- Four distinct prayer-card categories: five obligatory prayers, daily voluntary prayers, situational voluntary prayers, and special-day prayer events.
- Clicking a prayer title expands its description, relevant Qur'an/Hadith evidence and Rak'ah information inside the card. Rak'ah guidance is adapted to the selected school/profile, with differences identified where counts or forms vary.
- Clicking an event countdown opens a separate expanded countdown page with live countdowns and completion tickboxes. Pre-Fard Sunnah is available only before the Fard is ticked; post-Fard Sunnah/Nafl unlocks only after the Fard is ticked and only while its actual opportunity remains.
- Best Time to Pray is calculated within the actual event period. The expanded page counts down to its beginning, then shows the remaining preferred period. The ordinary card countdown turns gold while that period is active.
- Preferred-time reminders based on a Hadith or juristic recommendation are distinguished from approximate UI highlight windows. Approximate windows are labelled; they are not religious time limits. Dhuhr has no narrower universal gold window because the Sunnah timing depends on heat and hardship, which the app does not infer.
- Fard and voluntary recording use the universal two-following-Fard-period lock. This is a record-correction window only; it does not extend the actual religiously valid prayer time.
- Completed Today shows fully completed events as review-only cards between Next Prayer and Progress Cycle. Completed cards have no countdown. Undo is available only while the event remains eligible.
- Prayer Completion Recovery is a deliberate three-second hold plus confirmation, and only becomes available when the two immediately preceding Fard events are recorded complete. It can record one previously locked Fard or voluntary prayer the user confirms they actually performed.

### Observatory and time views

- The Observatory uses configured coordinates and the local date/time. Sun and Moon positions update every second and display altitude/azimuth, with paths derived from their calculated altitude over the pass.
- Day and night both have animated celestial paths; the night scene includes a star field. Prohibited-time indicators use a separate lower instrument band and do not run over the Sun/Moon paths.
- The Observatory colour system is driven by solar altitude and is independent of window dimensions. The visible readout includes sunrise, solar noon, sunset, moonrise, moonset and lunar phase.
- Clicking the main clock opens a full temporal view with local time/date, prayer timings, prohibited periods, solar/lunar positions, sunrise/sunset, solar noon/Zawal, moonrise/moonset and lunar phase.

### History, notifications and backup

- Prayer records remain local and feed Weekly Prayer Progress.
- Prayer-event start/end transitions are grouped into one notification when simultaneous and include a countdown to the next obligatory prayer. Existing pre-prayer and end reminders remain separate.
- Notifications run while the app is open, minimized or in the system tray. They stop when the app is fully exited.
- JSON backup supports Replace and Merge. A local safety copy is created before import; conflicts are identified and current values are retained for conflicting fields during Merge.
- The English/Bangla progress-message generator stores message timestamps and avoids reusing a message ID for 90 days across reopen events applies a same-language near-duplicate text check, and has a small fallback pool if the normal message set is exhausted.

## Build and test

```bash
npm ci
npm test
npm run check
npm run web:build
npm run build
```

`npm run build` requires the Rust toolchain and the Windows/Tauri packaging environment for a Windows release. The uploaded v1.3.5 source archive is not modified; this v1.4.0 work is in a separate source copy.

## Verification status

See [TEST-RESULTS.md](TEST-RESULTS.md) for the exact automated test result and what could not be run in this environment.

Known outstanding validation/work:

- The eclipse card and eclipse-contact calculation are not implemented in this update. They require a validated ephemeris and location-specific eclipse visibility data; the app must not invent eclipse events or contacts.
- The Observatory's updated Sun/Moon paths have syntax and unit-level checks, but have not yet been independently validated against a trusted astronomical ephemeris or tested on Windows at multiple real display sizes.
- The progress-message system is still a local template/grammar generator; it does not bundle complete English and Bangla dictionaries.
- The best-time prompt windows for Fajr, Asr and Maghrib are explicitly approximate UI reminders where the Sunnah does not define a fixed minute duration. Madhab-specific scholarly review remains necessary before treating any recommendation as a religious ruling.
- No Windows executable, NSIS installer, WebView2 rendering or real Windows fullscreen/mouse test was produced in this environment.
