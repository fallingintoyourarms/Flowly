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
  protocol?: "http" | "websocket" | "graphql" | "graphql-subscription" | "grpc";
  contentType?: string;

  sessionId?: string;
  sessionTags?: string[];

  anomalies?: Array<{
    type: "latency" | "new_error_pattern" | "regression" | "cache_recommendation";
    severity: "info" | "warning" | "critical";
    message: string;
  }>;

  graphql?: {
    operationType?: "query" | "mutation" | "subscription";
    operationName?: string;
  };

  grpc?: {
    service?: string;
    method?: string;
  };
  isWebSocket?: boolean;
  connectionKey?: string;
  wsFrames?: WebSocketFrame[];

  annotations?: Array<{
    id: string;
    createdAt: number;
    text: string;
  }>;

  replayStatus?: "idle" | "running" | "succeeded" | "failed";
  replayedAt?: number;
  replayError?: string;
  replayedId?: string;

  pinnedForCompare?: boolean;
}
