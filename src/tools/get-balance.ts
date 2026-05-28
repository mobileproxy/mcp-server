import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { BalanceResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';

export function registerGetBalance(server: McpServer, api: MobileProxyAPI): void {
  server.tool(
    'get_balance',
    'Returns the current account balance: main funds in RUB plus the optional ' +
      'can_payout amount for accounts with partner status. Use this BEFORE ' +
      'buy_proxy to confirm the user has enough funds — buy_proxy will fail ' +
      'silently-ish with "Insufficient balance" otherwise.',
    {},
    async () => {
      try {
        const data = await api.call<BalanceResponse>('get_balance');
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
