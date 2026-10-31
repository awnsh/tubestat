/** Messages posted from the page-world bridge to the isolated content script. */

export const BRIDGE_SOURCE = 'tubestat-bridge';

export interface PlayerSample {
  videoId: string;
  title: string;
  channelId: string;
  channelName: string;
  /** "@handle" from the video's owner URL, when present. */
  handle: string | null;
  lengthSeconds: number;
  isLive: boolean;
  /** YouTube's own category label, e.g. "Gaming". */
  category: string | null;
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  /** An ad is playing; ad time is never counted. */
  ad: boolean;
  isShort: boolean;
}

export interface BridgeTick {
  source: typeof BRIDGE_SOURCE;
  kind: 'tick';
  sample: PlayerSample | null;
}

export interface BridgeSubscriptions {
  source: typeof BRIDGE_SOURCE;
  kind: 'subscriptions';
  channels: Array<{ channelId: string; channelName: string; handle: string | null; avatar: string | null; subscriberCount: number | null }>;
  complete: boolean;
}

/** One entry read from youtube.com/feed/history: a video you watched on any signed-in device. */
export interface HistoryItem {
  videoId: string;
  title: string;
  /** Empty when YouTube doesn't show the channel (Shorts shelves). */
  channelId: string;
  channelName: string;
  /** "@handle", used to find the channel when only the link is on the page. */
  handle: string | null;
  /** Local midnight of the day the entry is listed under. */
  day: number;
  /** Video length in seconds, 0 when not shown. */
  duration: number;
  /** How far YouTube's red resume bar reaches, 0–100. Null when there's no bar. */
  percent: number | null;
  isShort: boolean;
}

export interface BridgeHistory {
  source: typeof BRIDGE_SOURCE;
  kind: 'history';
  items: HistoryItem[];
}

export type BridgeMessage = BridgeTick | BridgeSubscriptions | BridgeHistory;
