declare module 'http-proxy' {
  import * as http from 'node:http';
  import * as net from 'node:net';
  import { EventEmitter } from 'node:events';

  export interface ServerOptions {
    target?: string;
    forward?: string;
    agent?: http.Agent;
    ssl?: any;
    ws?: boolean;
    xfwd?: boolean;
    secure?: boolean;
    toProxy?: boolean;
    prependPath?: boolean;
    ignorePath?: boolean;
    localAddress?: string;
    changeOrigin?: boolean;
    preserveHeaderKeyCase?: boolean;
    auth?: string;
    hostRewrite?: string;
    autoRewrite?: boolean;
    protocolRewrite?: string;
    cookieDomainRewrite?: boolean | string | { [domain: string]: string };
    cookiePathRewrite?: boolean | string | { [path: string]: string };
    headers?: { [header: string]: string };
    proxyTimeout?: number;
    timeout?: number;
    followRedirects?: boolean;
    selfHandleResponse?: boolean;
    buffer?: any;
  }

  export interface ProxyResponse extends http.IncomingMessage {
    statusCode: number;
    statusMessage: string;
    headers: http.IncomingHttpHeaders;
  }

  export interface ProxyError extends Error {
    code?: string;
  }

  export class ProxyServer extends EventEmitter {
    web(req: http.IncomingMessage, res: http.ServerResponse, options?: ServerOptions, callback?: (err: ProxyError | null) => void): void;
    ws(req: http.IncomingMessage, socket: net.Socket, head: Buffer, options?: ServerOptions, callback?: (err: ProxyError | null, targetSocket?: net.Socket) => void): void;
    close(callback?: () => void): void;
    listen(port: number, hostname?: string, callback?: () => void): void;
    before(name: string, fn: Function): void;
    after(name: string, fn: Function): void;
  }

  export function createProxyServer(options?: ServerOptions): ProxyServer;
  export function createProxy(options?: ServerOptions): ProxyServer;
  export function createServer(options?: ServerOptions): ProxyServer;
}
