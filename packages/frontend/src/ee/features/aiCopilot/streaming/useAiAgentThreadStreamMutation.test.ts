import { describe, expect, it } from 'vitest';
import { getMcpUnavailableNoticeFromChunk } from './useAiAgentThreadStreamMutation';

describe('getMcpUnavailableNoticeFromChunk', () => {
    it('parses MCP unavailable data chunks', () => {
        expect(
            getMcpUnavailableNoticeFromChunk({
                type: 'data-mcp-unavailable',
                data: {
                    serverUuid: 'server-1',
                    serverName: 'Docs MCP',
                    message: 'Connection refused',
                    status: 'error',
                },
                transient: true,
            }),
        ).toEqual({
            serverUuid: 'server-1',
            serverName: 'Docs MCP',
            message: 'Connection refused',
            status: 'error',
        });
    });

    it('ignores unrelated chunks', () => {
        expect(
            getMcpUnavailableNoticeFromChunk({
                type: 'text-start',
                id: 'text-1',
            }),
        ).toBeNull();
    });
});
