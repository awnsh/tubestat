# Chrome Web Store submission: TubeStat

Everything the developer dashboard asks for, in the order it asks. Upload `store/tubestat-<version>.zip` (made by `npm run package`).

## Store listing tab

**Name** (from the manifest): TubeStat: Watch Time Tracker for YouTube

**Summary** (from the manifest, 132 characters max):
A private record of how you watch YouTube: watch time, top creators, history, and how early you found them. Stays on your device.

**Category:** Productivity → Tools (alternative: Lifestyle → Entertainment)

**Language:** English

**Description:**

```
Your YouTube life, tracked.

TubeStat quietly records how you watch YouTube and turns it into a profile of your viewing life, like a Wrapped that's always up to date. You never have to open it for it to work: just watch YouTube as usual.

WHAT YOU'LL SEE
• Watch time for today, this week, month, year, and all time, with the change from the previous period
• Your top creators by watch time, videos, or sessions
• Your top categories, and how your taste changes over time
• Your longest viewing sessions, streaks, and milestones
• A history of every month, plus a Time Machine to jump back to any of them
• Insights written from your real data, like when you watch most

CREATOR HISTORY AND OG STATUS
Every creator gets a page about you and them: when you subscribed, how long you've watched, and how much they've grown since. TubeStat records subscriber counts as you browse and earns you a DAY ONE, OG, or EARLY badge from measured numbers, never guesses.

WRAPPED AND SHARING
Play back any month or year as a story and turn it into an image for your feed. Compare weekly totals with friends on a leaderboard by swapping a short code that contains only totals, never what you watched.

HONEST NUMBERS
YouTube doesn't expose everything, so TubeStat tells you where each number came from: tracked since install, verified, or estimated. Pauses and ads don't count toward watch time, and skipping to the end doesn't count as finishing.

PRIVATE BY DESIGN
• Everything is stored on your device. There's no TubeStat server and no account.
• Your viewing history is never uploaded, sold, or used for ads.
• Export everything as JSON or delete it all in one click.

OPTIONAL EXTRAS
• Import your Google Takeout watch history to fill in the years before you installed.
• Connect your YouTube account (read-only, off by default) to get the exact dates you subscribed.

TubeStat is free and open source. It isn't affiliated with YouTube or Google.
```

**Graphic assets** (all in `store/`):
- Store icon 128×128: `public/icons/128.png`
- Screenshots 1280×800: `1-overview.png`, `2-creator-history.png`, `3-top-creators.png`, `4-history.png`, `5-insights.png`
- Small promo tile 440×280: `promo-small-440x280.png`
- Marquee promo tile 1400×560 (optional): `promo-marquee-1400x560.png`

**Additional fields:**
- Official URL / Homepage: https://awnsh.github.io/tubestat
- Support URL: https://github.com/awnsh/tubestat/issues

## Privacy practices tab

**Single purpose description:**
TubeStat records the user's own YouTube viewing (videos watched, channels, and watch time) on their device and shows them statistics and history about it.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Stores the user's viewing history, channels, subscriptions, and settings locally on their device. |
| `unlimitedStorage` | The viewing history is meant to accumulate over years; without this, Chrome's 10 MB local quota would eventually stop TubeStat from saving new viewings. |
| Host `https://www.youtube.com/*` | Content scripts read the video that is playing (ID, title, channel, length, playback position) and the channel's public subscriber count, which is the core function of the extension. |
| Host `i.ytimg.com`, `yt3.ggpht.com`, `yt3.googleusercontent.com` | Loads video thumbnails and channel pictures from YouTube's image servers so they can be drawn into share images the user creates. |
| Optional `identity` | Only requested if the user chooses "Connect" in Settings, to sign in to Google with read-only YouTube access so TubeStat can read the dates the user subscribed to channels. |
| Optional host `https://www.googleapis.com/*` | Only requested together with `identity`, to call the YouTube Data API (subscriptions.list and channels.list) with the user's read-only token. |

**Remote code:** No, I am not using remote code. All JavaScript is included in the package.

**Data usage**, check these:
- [x] Web history: the YouTube videos the user watches on youtube.com.
- [x] User activity: watch time and playback progress on YouTube videos.
- [x] Personally identifiable information: **no**. Website content: **no**. Authentication information: **no** (the optional Google token is held in memory only and never stored or transmitted except to Google). Leave the rest unchecked.

Then check all three certifications:
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://awnsh.github.io/tubestat/privacy.html

## Distribution tab

- Visibility: Public
- Regions: All regions
- Pricing: Free

## Notes for reviewers (optional field)

```
TubeStat stores all data locally in chrome.storage.local. To see it working: install, play any YouTube video for ~20 seconds, then open the toolbar popup or the dashboard. To preview a full dashboard without history, open the dashboard → Profile → "Preview with sample data". The optional Google account connection is off by default and requests its permissions only when the user clicks Connect.
```
