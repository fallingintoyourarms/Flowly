export interface WebSocketFrame {
  type: "text" | "binary" | "ping" | "pong" | "close";
  direction: "client" | "server";
  data?: string;
  timestamp: number;
}

export interface CapturedRequest {
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  rawHeaders?: Record<string, string>;
  body?: string;
  timestamp: number;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  rawResponseHeaders?: Record<string, string>;
  responseBody?: string;
  duration?: number;
  targetUrl?: string;
  isWebSocket?: boolean;
  wsFrames?: WebSocketFrame[];

  replayStatus?: "idle" | "running" | "succeeded" | "failed";
  replayedAt?: number;
  replayError?: string;
  replayedId?: string;

  pinnedForCompare?: boolean;
}
