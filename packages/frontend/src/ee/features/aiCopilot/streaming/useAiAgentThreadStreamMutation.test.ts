import { describe, expect, it } from 'vitest';
import {
    getMcpUnavailableNoticeFromChunk,
    getProgressMessageFromChunk,
} from './useAiAgentThreadStreamMutation';

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

describe('getProgressMessageFromChunk', () => {
    it('parses progress data chunks', () => {
        expect(
            getProgressMessageFromChunk({
                type: 'data-progress',
                data: {
                    message: 'Running your query...',
                },
                transient: true,
            }),
        ).toEqual('Running your query...');
    });

    it('ignores unrelated chunks', () => {
        expect(
            getProgressMessageFromChunk({
                type: 'text-start',
                id: 'text-1',
            }),
        ).toBeNull();
    });

    it('ignores invalid data-progress chunks', () => {
        expect(
            getProgressMessageFromChunk({
                type: 'data-progress',
                data: {
                    notAMessage: 'wrong field',
                },
            }),
        ).toBeNull();
    });
});
