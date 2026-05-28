import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export class MobileProxyAPIError extends Error {
  constructor(
    message: string,
    public readonly response: unknown,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'MobileProxyAPIError';
  }
}

/**
 * Map a backend error message to an MCP-level error with a helpful hint for
 * the calling agent. The text becomes part of the assistant's reply, so write
 * for an LLM reader, not a stack-trace consumer.
 */
export function toMcpError(err: unknown): McpError {
  if (err instanceof McpError) return err;

  if (err instanceof MobileProxyAPIError) {
    const msg = err.message.toLowerCase();

    if (msg.includes('authorization error #1') || msg.includes('authorization error #2') || msg.includes('authorization error #3')) {
      return new McpError(
        ErrorCode.InvalidParams,
        'API key missing or invalid. Set MOBILEPROXY_API_KEY (get yours at https://mobileproxy.space/user.html?api).',
      );
    }
    if (msg.includes('authorization error #4')) {
      return new McpError(
        ErrorCode.InvalidParams,
        "API key is IP-restricted and this server's IP is not in the allowlist. Edit the token at /user.html?api or remove the restriction.",
      );
    }
    if (msg.includes('too many requests')) {
      return new McpError(
        ErrorCode.InternalError,
        'Rate limit exceeded (max ~3 req/sec per API key). The server already retried 3 times — try again later.',
      );
    }
    return new McpError(ErrorCode.InternalError, err.message);
  }

  if (err instanceof Error) {
    if (err.name === 'AbortError' || /timeout|aborted/i.test(err.message)) {
      return new McpError(ErrorCode.InternalError, `Request timed out: ${err.message}`);
    }
    return new McpError(ErrorCode.InternalError, `Network error: ${err.message}`);
  }

  return new McpError(ErrorCode.InternalError, 'Unknown error: ' + String(err));
}
