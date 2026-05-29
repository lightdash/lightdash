import { describe, expect, it } from 'vitest';
import {
    getMcpUnavailableNoticeFromChunk,
    getStepProgressFromChunk,
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

describe('getStepProgressFromChunk', () => {
    it('parses progress data chunks with a tool name', () => {
        expect(
            getStepProgressFromChunk({
                type: 'data-step-progress',
                data: {
                    message: 'Cloning project',
                    toolName: 'proposeWriteback',
                },
                transient: true,
            }),
        ).toEqual({ message: 'Cloning project', toolName: 'proposeWriteback' });
    });

    it('parses progress data chunks without a tool name (toolName null)', () => {
        expect(
            getStepProgressFromChunk({
                type: 'data-step-progress',
                data: { message: 'Running your query...' },
                transient: true,
            }),
        ).toEqual({ message: 'Running your query...', toolName: null });
    });

    it('ignores unrelated chunks', () => {
        expect(
            getStepProgressFromChunk({
                type: 'text-start',
                id: 'text-1',
            }),
        ).toBeNull();
    });

    it('ignores data-step-progress chunks with a non-string message', () => {
        expect(
            getStepProgressFromChunk({
                type: 'data-step-progress',
                data: { message: 42 as unknown as string },
            }),
        ).toBeNull();
    });

    it('ignores data-step-progress chunks with an empty message', () => {
        expect(
            getStepProgressFromChunk({
                type: 'data-step-progress',
                data: { message: '' },
            }),
        ).toBeNull();
    });
});
