import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { vi } from 'vitest';
import { createHttpApp, type HttpAppOptions } from '../src/http/app.js';

export const SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';

/** Starts the HTTP app on a free port. The stub API answers get_balance with the key it was created for. */
export async function startApp(opts: Partial<HttpAppOptions> = {}) {
  const server: Server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;

  const createApi = vi.fn((apiKey: string) => ({
    call: vi.fn(async (cmd: string) => (cmd === 'get_balance' ? { status: 'ok', balance: 100, key_used: apiKey } : {})),
  }));
  const validateApiKey = vi.fn(async (key: string) => key === 'GOODKEY0123456789');

  const app = createHttpApp({
    publicUrl: new URL(base),
    createApi: createApi as unknown as HttpAppOptions['createApi'],
    validateApiKey,
    ...opts,
  });
  server.on('request', app);

  return {
    base,
    createApi,
    validateApiKey,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
