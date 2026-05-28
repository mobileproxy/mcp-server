/**
 * stderr-only logger. stdout is reserved for the MCP stdio transport — writing
 * anything to stdout from outside the SDK corrupts the JSON-RPC stream.
 */

const DEBUG = process.env.MOBILEPROXY_DEBUG === '1';

function write(level: string, args: unknown[]): void {
  const ts = new Date().toISOString();
  const parts = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a)));
  process.stderr.write(`[${ts}] [${level}] ${parts.join(' ')}\n`);
}

export const log = {
  debug: (...args: unknown[]) => {
    if (DEBUG) write('debug', args);
  },
  info: (...args: unknown[]) => write('info', args),
  warn: (...args: unknown[]) => write('warn', args),
  error: (...args: unknown[]) => write('error', args),
};
