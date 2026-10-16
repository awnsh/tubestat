/**
 * TubeStat data model.
 *
 * Every record carries a `source` so the UI can always tell the user where a
 * number came from:
 *   - "tracked"  measured by the extension while you watched (verified)
 *   - "takeout"  imported from a Google Takeout watch-history file (verified
 *                that you opened the video, watch time unknown)
 *   - "api"      read from the YouTube Data API with your permission (verified)
 *   - "page"     read from a YouTube page you visited (verified, but YouTube
 *                rounds public numbers, e.g. "1.23M")
 *   - "observed" captured live when the extension saw the change happen
 */

export const SCHEMA_VERSION = 1;

export type DataSource = 'tracked' | 'takeout' | 'api' | 'page' | 'observed';

/** One viewing of one video. Re-watching later creates a new record. */
export interface Watch {
  /** Unique id of this viewing. */
  id: string;
  videoId: string;
  title: string;
  channelId: string;
  channelName: string;
  thumbnail: string;
  /** Video length in seconds (0 when unknown, e.g. imported or live). */
  duration: number;
  /** Seconds of real time the video was actually playing (ads excluded). Null when unknown. */
  watchedSeconds: number | null;
  /** Share of the video's timeline you covered, 0–100. Null when unknown. */
  percentageWatched: number | null;
  /** When the viewing started (ms since epoch). */
  timestamp: number;
  /** When playback was last observed (ms since epoch). */
  endedAt: number;
  completed: boolean;
  isShort: boolean;
  isLive: boolean;
  /** YouTube's own category label from the video's metadata, e.g. "Science & Technology". */
  ytCategory: string | null;
  source: DataSource;
}

export interface SubscriberSnapshot {
  /** ms since epoch */
  t: number;
  count: number;
  source: DataSource;
}

export interface Channel {
  channelId: string;
  channelName: string;
  handle: string | null;
  avatar: string | null;
  url: string;
  /** Latest known public subscriber count. */
  subscriberCount: number | null;
  /** First time the extension (or an import) saw you watch this channel. */
  firstSeen: number;
  /** Running totals kept by the background worker (also re-derivable from watches). */
  totalWatchTime: number;
  videosWatched: number;
  /** When the channel was created, from the YouTube Data API. */
  createdAt: number | null;
  /** At most one snapshot per day; the growth record starts on the first visit. */
  subscriberHistory: SubscriberSnapshot[];
  /** Last subscribe-button state seen on a YouTube page (null = never seen). */
  lastSeenSubscribed: boolean | null;
  lastSeenSubscribedAt: number | null;
  updatedAt: number;
}

export interface Subscription {
  channelId: string;
  /** Null when YouTube doesn't tell us when you subscribed. */
  subscriptionDate: number | null;
  subscriptionDateSource: DataSource | null;
  /** Subscriber count at the moment you subscribed. Only known if captured live. */
  subscriberCountAtSubscription: number | null;
  currentSubscriberCount: number | null;
  /** First time the extension saw you subscribed. */
  firstObserved: number;
  lastObserved: number;
  active: boolean;
}

export interface Settings {
  trackingEnabled: boolean;
  /** Minimum seconds of playback before a viewing is saved. */
  minWatchSeconds: number;
  /** Idle gap that ends a viewing session. */
  sessionGapMinutes: number;
  trackShorts: boolean;
  displayName: string;
  /** OAuth client id for the optional YouTube Data API connection. */
  googleClientId: string;
}

export interface Meta {
  schemaVersion: number;
  installedAt: number;
  /** Days on which tracking was active (YYYY-MM-DD), used for the tracking streak. */
  activeDays: string[];
  lastSubscriptionSync: number | null;
  lastApiSync: number | null;
  takeoutImportedAt: number | null;
}

export interface GroupMember {
  /** Stable random id the friend generated on their own device. */
  memberId: string;
  name: string;
  isYou: boolean;
  /** Stats snapshot shared by that member. */
  card: ShareableStats | null;
  updatedAt: number;
}

export interface FriendGroup {
  id: string;
  name: string;
  createdAt: number;
  members: GroupMember[];
}

/** Aggregates a user chooses to share with friends. No titles, no channel list. */
export interface ShareableStats {
  v: 1;
  memberId: string;
  name: string;
  /** ISO week like "2026-W39". */
  week: string;
  weekWatchSeconds: number;
  weekVideos: number;
  weekCreators: number;
  currentStreak: number;
  longestStreak: number;
  totalHours: number;
  generatedAt: number;
}

export interface Database {
  meta: Meta;
  settings: Settings;
  watches: Watch[];
  channels: Record<string, Channel>;
  subscriptions: Record<string, Subscription>;
  groups: FriendGroup[];
  memberId: string;
}

export const DEFAULT_SETTINGS: Settings = {
  trackingEnabled: true,
  minWatchSeconds: 5,
  sessionGapMinutes: 30,
  trackShorts: true,
  displayName: '',
  googleClientId: '',
};

/** Messages from the content script to the background worker. */
export type TrackerMessage =
  | { type: 'watch:upsert'; watch: Watch }
  | {
      type: 'channel:seen';
      channel: {
        channelId: string;
        channelName: string;
        handle: string | null;
        avatar: string | null;
        subscriberCount: number | null;
      };
      /** null = couldn't tell from the page. */
      subscribed: boolean | null;
    }
  | {
      type: 'subscriptions:sync';
      channels: Array<{ channelId: string; channelName: string; handle: string | null; avatar: string | null; subscriberCount: number | null }>;
      complete: boolean;
    }
  | { type: 'takeout:import'; watches: Watch[]; channels: Array<{ channelId: string; channelName: string }> }
  | { type: 'api:apply'; payload: ApiSyncPayload }
  | { type: 'data:deleteAll' }
  | { type: 'tracker:ping' };

export interface ApiSyncPayload {
  subscriptions: Array<{ channelId: string; channelName: string; avatar: string | null; subscribedAt: number }>;
  channels: Array<{
    channelId: string;
    channelName: string;
    handle: string | null;
    avatar: string | null;
    subscriberCount: number | null;
    createdAt: number | null;
  }>;
}
