import { log } from './logger.js';

export interface RetryOptions {
  retries: number;
  baseMs: number;
  retryOn: (err: unknown) => boolean;
}

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= opts.retries) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === opts.retries || !opts.retryOn(err)) throw err;
      const delay = opts.baseMs * 2 ** attempt;
      log.debug(`retry attempt ${attempt + 1}/${opts.retries} after ${delay}ms`, String(err));
      await sleep(delay);
      attempt += 1;
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
