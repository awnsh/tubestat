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

`npm run test:e2e` loads the built extension into Playwright’s Chromium (set `E2E_CHANNEL=msedge` to use an installed Edge instead), plays a real YouTube video and a Short, and checks what was recorded (screenshots land in `e2e-output/`).

`npm run dev` serves the dashboard at `http://localhost:5173/dashboard.html` outside the extension (storage falls back to `localStorage`). Use **Preview with sample data** there to see a populated UI.

## Replay Map

TubeStat draws your own viewing on YouTube's seek bar: a thin strip above the timeline that shows the parts of the video you've already watched, the parts you've replayed (yellow at 2×, magenta at 3× or more), and the gaps you skipped. When you come back to a video you've partly seen, a small chip offers **Resume** or **Next unseen** in one click.

- It's measured on the video's own timeline while it plays, so 2× speed still counts once and seeking past a part never marks it seen.
- Each video's map is 120 slices stored under `h:<videoId>`, summed across every viewing (`src/replay/heat.ts`).
- The stretches you replay most show up under **Insights → Moments you replay**, each linking straight to that timestamp.
- Turn it off in **Profile → Replay Map on YouTube**. Shorts and live streams aren't mapped.

## Updates

Chrome Web Store installs are updated by Chrome. Chrome never updates an unpacked extension, so those copies check `api.github.com/repos/awnsh/tubestat/releases/latest` at most every 12 hours (`src/update/check.ts`) and show a notice in the popup and dashboard when the release tag (`v1.2.0`) is newer than the manifest version. To update, unzip the new release **into the same folder** and press reload in `chrome://extensions`: the folder path decides an unpacked extension's ID, and the ID owns the data.

To publish a release, run `npm run package`, then attach the zip to a GitHub release tagged `v<version>` and named `tubestat-extension.zip` (the website's download button and the notice link to that name).

## Phone and other devices

The extension can't see the YouTube app, but `youtube.com/feed/history` lists what you watched on every signed-in device. When you open it on desktop, `page-bridge.ts` reads each entry and the day heading it sits under ("Today", "Wednesday", "Oct 12", in the page's language), and the worker saves it as a `history` watch at noon that day. Anything TubeStat already tracked within a day either side is skipped. Watch time is `length × resume bar`, shown as an estimate. Shorts on the history page don't show a channel or a resume bar, so they add videos but no hours or creators. Turn it off in **Profile → Your phone and other devices**.

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
| Subscriber count when you subscribed | Captured live; else interpolated from TubeStat's own snapshots; else read from Internet Archive copies of the channel page near that date (`src/youtube/archive.ts`) | Verified, or labelled estimate with the snapshot date |
| Past subscriber counts | Not published by YouTube | Growth chart starts on first visit; only the subscription-date count is estimated from the archive |
| History before install | Google Takeout `watch-history.json` import (dates, no watch time) | Verified videos; hours not counted |
| Viewing on your phone and other devices | `youtube.com/feed/history` when you open it on desktop: day headings, plus how far the red resume bar reaches | Verified videos and days; watch time is an estimate (`length × bar`), Shorts add no hours |

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
  replay/      Replay Map: per-video heat model, seek-bar strip and resume chip
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

## Optional: sign in with Google

Profile → **Sign in with Google**. One sign-in does two things:

- **Account sync.** Stats are kept in the Drive app-data folder of the user's own Google account (`drive.appdata`): `core.json` (channels, subscriptions, groups), `replays.json`, and one `w-YYYY-MM.json` per month of watches, gzipped. The background worker syncs about every 30 minutes, downloading only files another device changed and uploading only files whose merged contents changed (`src/account/sync.ts`). Merging never deletes: watches combine by id, channels and subscriptions keep the newest details plus all history, and a `history` entry is dropped when another device tracked the same video (`src/account/merge.ts`). There's no TubeStat server.
- **Subscription dates.** `youtube.readonly` reads when you subscribed to each channel, about weekly.

Sign-in uses TubeStat's own OAuth client, `BUILT_IN_CLIENT_ID` in `src/account/google.ts`. Its redirect URI is the relay page `https://awnsh.github.io/tubestat/oauth.html` (`docs/oauth.html`), which forwards Google's answer to `https://<extension-id>.chromiumapp.org/` named in `state`; that lets one client serve every unpacked copy, whose IDs all differ. Tokens are never stored; background syncs get a fresh one with `prompt=none`.

To set up the client: in Google Cloud Console enable **YouTube Data API v3** and **Google Drive API**, configure the consent screen (External; scopes `openid`, `email`, `profile`, `youtube.readonly`, `drive.appdata`; homepage and privacy policy on `awnsh.github.io`), and create a **Web application** client with the relay page as its redirect URI. `youtube.readonly` is a sensitive scope, so until Google verifies the app only listed test users (up to 100) can sign in. Developers can instead save their own client ID in Profile, which redirects straight to their copy's `chromiumapp.org` address.

## Friends and leaderboards

There's no server. Each person copies a **stat code** (`TUBESTAT1.…`) that holds only weekly totals (name, watch time, videos, creators, streaks) and pastes friends' codes into a group. To add live sync later, implement `GroupTransport` in `src/social/social.ts`.

## Logo

The mark is YouTube's played-progress bar forming the crossbar of a T, with the red playhead where the stem meets it. Files are in `brand/`: the app icon, the mark for dark and light backgrounds, and the full logo, as SVG and PNG. `npm run icons` regenerates them along with the extension icons.

## Privacy

Signed out, no viewing data leaves the device: network requests are only for YouTube thumbnails/avatars and GitHub's latest-release endpoint (the update check, above). Signed in, stats also sync to the user's own Google Drive app folder, and subscriptions are read from the YouTube Data API. Export everything as JSON or delete everything from Profile.
