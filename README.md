<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/tubestat-logo-on-dark.svg" />
  <img src="brand/tubestat-logo-on-light.svg" alt="TubeStat" width="280" />
</picture>

**[Website](https://awnsh.github.io/tubestat/)** · **[Download](https://github.com/awnsh/tubestat/releases/latest)** · **[Privacy policy](https://awnsh.github.io/tubestat/privacy.html)**


**Your YouTube life, tracked.** A Chrome extension that quietly records how you watch YouTube and turns it into a personal profile: watch time, top creators, categories, history, how early you found the channels you love, and Wrapped.

Everything stays on your device.

## Install (unpacked)

```bash
npm install
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `dist/` folder.
3. Watch something on youtube.com. It shows up in the dashboard within about 15 seconds.

After changing code, run `npm run build` again and press the reload icon on TubeStat’s card in `chrome://extensions`.

The dashboard opens on install. After that, use the toolbar popup's **Open dashboard** button.

`npm run test:e2e` loads the built extension into Playwright’s Chromium, plays a real YouTube video and a Short, and checks what was recorded (screenshots land in `e2e-output/`).

`npm run dev` serves the dashboard at `http://localhost:5173/dashboard.html` outside the extension (storage falls back to `localStorage`). Use **Preview with sample data** there to see a populated UI.

## What can and can't be known

TubeStat was built around what YouTube actually exposes. It never invents history.

| Data | Source | Status |
|---|---|---|
| Video, title, channel, channel ID, length | Player API (`getPlayerResponse`) in the page | Verified |
| YouTube's category for the video | Player response `microformat.category` | Verified (set by the uploader) |
| Watch time | Real time the video was playing; pauses, stalls and ads excluded | Measured since install |
| % watched / completed | Share of the timeline covered (≥90% = finished; seeking doesn't count) | Measured since install |
| Shorts vs long-form | Which player is playing (`#shorts-player`) | Verified |
| Subscriber counts | Watch page and subscriptions page (YouTube rounds to 3 digits) | Snapshotted daily from first visit |
| Your subscriptions | `youtube.com/feed/channels` when you visit it | Verified |
| **When** you subscribed | Not shown anywhere on YouTube's pages. Captured live when you subscribe while TubeStat is installed, or read from the YouTube Data API if you connect it | Verified when available |
| Subscriber count when you subscribed | Only known if captured live, or interpolated from TubeStat's own snapshots | Verified, or labelled estimate |
| Past subscriber counts | Not published by YouTube | Not shown; growth tracking starts on first visit |
| History before install | Google Takeout `watch-history.json` import (dates, no watch time) | Verified videos; hours not counted |

### OG status

OG status is computed in `src/analytics/og.ts` from measurable data only:

- **Audience basis:** `1 − subscribers_then / subscribers_now`, the share of today's audience that arrived after you. Tiers: DAY ONE ≥ 99%, OG ≥ 90%, EARLY ≥ 60%, ESTABLISHED ≥ 20%, otherwise RECENT.
- **Timing basis** (needs Data API dates): how far into the channel's lifetime you subscribed. DAY ONE ≤ 5%, OG ≤ 20%, EARLY ≤ 45%, ESTABLISHED ≤ 80%. This is always labelled an estimate and never produces an audience claim.
- If neither is available there's no status, just "tracking since".

## Architecture

```
src/
  youtube/     collection: page-bridge (MAIN world player reader), content (isolated tracker host),
               parse, Data API client, Takeout parser
  tracking/    WatchTracker: player samples → Watch records
  storage/     schema, chrome.storage wrapper, month-sharded watches, serialized mutations
  background/  service worker, the only writer of tracked data
  analytics/   periods, categories (modular classifier), engine (aggregates, sessions, streaks),
               og, wins, insights, history/comparisons, wrapped
  social/      stat codes, groups, leaderboards (GroupTransport seam for a future backend)
  sharing/     canvas share cards (1080×1350)
  components/  UI primitives, charts, Wrapped player, share dialog
  pages/       Overview, Creators, CreatorDetail, History (+Time Machine), Insights, Leaderboard, Profile
  popup/       toolbar snapshot
```

- Watches are stored in monthly shards (`w:YYYY-MM`) so history can grow indefinitely without rewriting one huge key.
- All aggregates are derived from raw watches at read time, so improving a calculation improves all past data too.
- Categories: YouTube's category first, then title keywords only to refine it within allowed narrower categories, then the channel's usual category for imported videos. Edit `KEYWORDS` / `YT_MAP` in `analytics/categories.ts` to improve accuracy.

## Optional: subscription dates via the YouTube Data API

Profile → *Subscription dates from your YouTube account*. You create your own OAuth client (Web application) in Google Cloud, enable YouTube Data API v3, and add the redirect URI shown in the app. The connection is read-only (`youtube.readonly`), runs only when you press the button, and the token is never stored.

## Friends and leaderboards

There's no server. Each person copies a **stat code** (`TUBESTAT1.…`) that holds only weekly totals (name, watch time, videos, creators, streaks) and pastes friends' codes into a group. To add live sync later, implement `GroupTransport` in `src/social/social.ts`.

## Logo

The mark is YouTube's played-progress bar forming the crossbar of a T, with the red playhead where the stem meets it. Files are in `brand/`: the app icon, the mark for dark and light backgrounds, and the full logo, as SVG and PNG. `npm run icons` regenerates them along with the extension icons.

## Privacy

No viewing data leaves the device. Network requests are only for YouTube thumbnails/avatars and, if connected, the YouTube Data API. Export everything as JSON or delete everything from Profile.
