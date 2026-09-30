import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MobileProxyAPI } from '../api/client.js';
import { toMcpError } from '../api/errors.js';

interface HistoryResponse {
  status: 'ok';
  history: { date: string; sum: string | number; comment: string; hold: string | number; ofd_url: string }[];
}

export function registerAccountHistory(server: McpServer, api: MobileProxyAPI): void {
  server.registerTool(
    'get_account_history',
    {
      title: 'Account transaction history',
      description:
        'Lists balance operations newest first: top-ups, purchases, renewals and refunds, with the ' +
        'amount, a description that names the proxy (PID) where relevant, and a receipt link when ' +
        'one was issued. Dates are Moscow time. Page with offset.',
      inputSchema: {
        limit: z.number().int().min(1).max(50).default(20).describe('Operations to return (max 50)'),
        offset: z.number().int().min(0).default(0).describe('Skip this many newest operations'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ limit, offset }) => {
      try {
        const data = await api.call<HistoryResponse>('get_history', { length: limit, start: offset });
        const operations = (data.history ?? []).map((h) => ({
          date: h.date,
          amount: Number(h.sum),
          description: h.comment,
          ...(Number(h.hold) ? { on_hold: true } : {}),
          ...(h.ofd_url ? { receipt_url: h.ofd_url } : {}),
        }));
        return { content: [{ type: 'text' as const, text: JSON.stringify({ offset, count: operations.length, operations }, null, 2) }] };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
