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

export type BridgeMessage = BridgeTick | BridgeSubscriptions;
