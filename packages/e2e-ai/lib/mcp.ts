import { assertUnreachable, SEED_PAT } from '@lightdash/common';
import { z } from 'zod';
import { siteUrl } from './env';

// A PAT-authenticated client for Lightdash's stateless Streamable HTTP MCP
// endpoint, which answers JSON (enableJsonResponse). Plain JSON-RPC, so the
// suite needs no MCP SDK.

const PROTOCOL_VERSION = '2025-06-18';

const rpcResponseSchema = z
    .object({
        jsonrpc: z.literal('2.0'),
        result: z.unknown().optional(),
        error: z.object({ code: z.number(), message: z.string() }).optional(),
    })
    .transform((response) =>
        response.error === undefined
            ? { kind: 'result' as const, result: response.result }
            : { kind: 'error' as const, error: response.error },
    );

export const toolResultSchema = z.object({
    content: z.array(
        z.looseObject({ type: z.string(), text: z.string().optional() }),
    ),
    structuredContent: z.unknown().optional(),
    isError: z.boolean().optional(),
});

const parseJson = (text: string, what: string): unknown => {
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`${what} is not JSON: ${text.slice(0, 500)}`);
    }
};

/** Unauthenticated POST: 401 when the MCP endpoint is mounted. */
export const probeMcp = async () =>
    (
        await fetch(new URL('/api/v1/mcp', siteUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        })
    ).status;

export const createMcpClient = (projectUuid: string, userAgent: string) => {
    const url = new URL(`/api/v1/mcp/projects/${projectUuid}`, siteUrl);
    let sessionId: string | null = null;
    let nextId = 1;

    const post = (body: unknown) =>
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                Authorization: `Bearer ${SEED_PAT.token}`,
                'User-Agent': userAgent,
                ...(sessionId === null
                    ? {}
                    : {
                          'Mcp-Session-Id': sessionId,
                          'MCP-Protocol-Version': PROTOCOL_VERSION,
                      }),
            },
            body: JSON.stringify(body),
        });

    const request = async (method: string, params: unknown) => {
        const id = nextId;
        nextId += 1;
        const response = await post({ jsonrpc: '2.0', id, method, params });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`MCP ${method}: HTTP ${response.status} ${text}`);
        }
        const parsed = rpcResponseSchema.parse(
            parseJson(text, `MCP ${method}`),
        );
        switch (parsed.kind) {
            case 'result':
                return { result: parsed.result, headers: response.headers };
            case 'error':
                throw new Error(
                    `MCP ${method}: ${parsed.error.code} ${parsed.error.message}`,
                );
            default:
                return assertUnreachable(parsed, 'Unknown JSON-RPC response');
        }
    };

    return {
        /** Handshake; keeps the session id the server assigns. */
        initialize: async () => {
            const { result, headers } = await request('initialize', {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: userAgent, version: '1' },
            });
            sessionId = headers.get('mcp-session-id');
            await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
            return result;
        },
        listTools: async () =>
            z
                .object({ tools: z.array(z.object({ name: z.string() })) })
                .parse((await request('tools/list', {})).result).tools,
        callTool: async (name: string, args: unknown) =>
            toolResultSchema.parse(
                (await request('tools/call', { name, arguments: args })).result,
            ),
        sessionId: () => sessionId,
    };
};
