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
}
