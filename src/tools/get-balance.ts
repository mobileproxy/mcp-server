import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import type { BalanceResponse } from '../api/types.js';
import { toMcpError } from '../api/errors.js';

export function registerGetBalance(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'get_balance',
    {
      title: 'Get account balance',
      description:
        'Returns the current account balance in RUB, plus the can_payout amount for accounts ' +
        'with partner status. Purchases and renewals fail with "Insufficient balance" when the ' +
        'balance does not cover them.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
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
