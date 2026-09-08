declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
  exit(code?: number): never;
};

declare module 'node:http' {
  export interface IncomingMessage {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    socket: { remoteAddress?: string };
    on(event: 'data', listener: (chunk: Uint8Array) => void): void;
    on(event: 'end', listener: () => void): void;
    on(event: 'error', listener: (error: Error) => void): void;
  }
  export interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(data?: string | Uint8Array): void;
  }
  export function createServer(listener: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>): {
    listen(port: number, host: string, callback?: () => void): void;
  };
}

declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

declare module 'node:path' {
  const path: {
    join(...parts: string[]): string;
    resolve(...parts: string[]): string;
    extname(path: string): string;
    dirname(path: string): string;
    basename(path: string): string;
  };
  export default path;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

declare module 'node:crypto' {
  export function randomBytes(size: number): { toString(encoding: 'hex' | 'base64url'): string };
  export interface Hash { update(data: string | Uint8Array): Hash; digest(encoding: 'hex'): string; }
  export function createHash(algorithm: string): Hash;
  export function scryptSync(password: string, salt: Uint8Array, keylen: number): { toString(encoding: 'hex'): string };
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}

declare module 'node:zlib' {
  export function deflateRawSync(data: string | Uint8Array): Uint8Array;
}

declare module 'node:sqlite' {
  export interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }
  export class StatementSync {
    run(...values: unknown[]): RunResult;
    get(...values: unknown[]): unknown;
    all(...values: unknown[]): unknown[];
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
