# Sender v1.1 acceptance and device tests

Status: **PENDING DEVICE TEST** — Mac display + browser → iPhone 16 camera +
AirGapFree Build 9. No optical throughput or production reliability claim has
been established by automated Sender tests.

## Fixed A/B matrix

| Profile | Target FPS | Burst factor |
| --- | ---: | ---: |
| Baseline | 15 | 2× |
| Candidate A | 20 | 1.5× |
| Candidate B | 24 | 1.5× |
| Candidate C (experimental) | 30 | 1.2× |

Test identical 5 MiB and 10 MiB files under every profile; optionally add 50 MiB.
Record the chunk-size setting separately from file size. Use the same file hash,
browser/version, Mac/display refresh rate, brightness, camera distance/angle,
lighting and receiver build. Use a fresh receiver transfer state for each trial
so already verified chunks do not inflate the result. Repeat each profile at
least three times if practical; record failures as well as successes.

Stop the Sender before changing FPS or redundancy. Start timing at Start sending
(after preparation), and end only when AirGapFree reports whole-file verification
and completion. Record interruptions, manual pauses and focused resend in the
elapsed time. Verify the Receiver's whole-file SHA-256 matches the Sender.
Do not infer completion from Sender pass count or its estimated cycle duration.

## Trial record

| Field | Record |
| --- | --- |
| Trial/date; Mac/display; OS/browser/version | |
| Display refresh rate/brightness; distance/lighting | |
| Receiver device/build (iPhone 16 / Build 9) | |
| Sender target FPS; observed actual FPS range | |
| Burst factor; chunk-size setting | |
| File size in bytes; whole SHA-256 | |
| Start time; Receiver complete time; elapsed seconds | |
| Success/failure and failure reason | |
| Focused resend needed? Which chunks/how many cycles? | |
| Receiver camera dropped frames | |
| Receiver skipped/decode metrics, if available | |
| Receiver diagnostics or diagnostic artifact reference | |
| Effective end-to-end KiB/s | |

For a successful transfer only:

```text
effective end-to-end KiB/s = (verified file bytes / 1024)
                            / (Receiver complete time - Start time in seconds)
```

Leave unavailable diagnostics and failed-transfer throughput blank; do not
substitute Sender payload/frame arithmetic for Receiver completion timing.
30 FPS can be worse than 15 FPS, and 1.2× can require additional replays.

## Browser acceptance checklist

**MANUAL BROWSER ACCEPTANCE PENDING** as of 2026-09-12. The available browser
automation tool rejected direct `file://` navigation under its URL security
policy. No workaround was attempted. Node tests exercise the real application
with deterministic DOM/RAF/WASM adapters, but do not prove browser rendering,
fullscreen, file-origin storage or screen wake-lock behavior.

Open `AirGapBigFile.standalone.html` directly from disk in the intended Mac browser
with the network disconnected, and record browser/version and results:

- [ ] English UI, including errors, advanced controls, hints and metrics.
- [ ] Switch to 简体中文 without reload; document language and all labels change.
- [ ] Reload preserves manual language preference when browser storage is allowed.
- [ ] Choose a file; preparation progresses and SHA-256/chunk metadata appear.
- [ ] Switch language during preparation; file/preparation remain intact.
- [ ] Check 1.2× / 1.5× / 2× default / 3× and 12 / 15 default / 18 / 20 / 24 / 30 FPS.
- [ ] Start; animated CIMBAR and plausible Actual FPS/interval appear after sampling.
- [ ] FPS/redundancy are disabled while sending and paused.
- [ ] Language switch during sending preserves file, current item and burst.
- [ ] Pause freezes burst; Resume continues the same stream and resets FPS samples.
- [ ] Stop unlocks controls; restarting applies new values.
- [ ] Enter and exit fullscreen; canvas fits and sending remains usable.
- [ ] Focus a missing chunk, then return to sweep; each starts with Manifest.
- [ ] Hide/minimize/switch tab while sending: automatically paused on return.
- [ ] Returning visible does not resume until explicit Resume.
- [ ] Manual pause remains manual across hidden/visible changes.
- [ ] Wake lock status: acquire while sending, release on pause/stop, reacquire on Resume.
- [ ] An unsupported/rejected wake lock shows a warning without failing sending.
- [ ] Empty file or unsafe filename displays a localized error.
- [ ] Browser network inspector shows no runtime network requests.

Long-session checks: allow normal idle timeout to pass while sending, verify the
screen remains lit if wake lock is reported active; test OS/browser-specific
release behavior and recover manually. Browser Page Visibility does not reliably
detect a separate window covering the code, so keep the display unobstructed.
