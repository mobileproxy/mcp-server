import { describe, expect, it } from 'vitest';
import { MobileProxyAPIError, toMcpError } from '../src/api/errors.js';

describe('toMcpError', () => {
  it('turns backend auth errors into an actionable key hint', () => {
    const e = toMcpError(new MobileProxyAPIError('Authorization error #3. Wrong token', {}, 403));
    expect(e.message).toContain('API key missing or invalid');
    expect(e.message).toContain('utm_source=mcp');
  });

  it('explains IP-restricted tokens', () => {
    expect(toMcpError(new MobileProxyAPIError('Authorization error #4', {}, 403)).message).toContain('IP-restricted');
  });

  it('explains the rate limit', () => {
    expect(toMcpError(new MobileProxyAPIError('Too many requests', {}, 429)).message).toContain('Rate limit');
  });

  it('labels plain failures as network errors', () => {
    expect(toMcpError(new Error('ECONNRESET')).message).toContain('Network error: ECONNRESET');
  });
});
