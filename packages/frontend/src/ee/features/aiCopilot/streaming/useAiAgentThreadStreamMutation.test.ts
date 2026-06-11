import { describe, expect, it } from 'vitest';
import {
    getStreamToolCallPart,
    getMcpUnavailableNoticeFromChunk,
    getStepProgressFromChunk,
} from './useAiAgentThreadStreamMutation';

describe('getStreamToolCallPart', () => {
    it('keeps MCP tool input parts for live rendering', () => {
        expect(
            getStreamToolCallPart({
                type: 'dynamic-tool',
                toolName: 'mcp_lightdash__set_project',
                toolCallId: 'toolu_123',
                state: 'input-available',
                input: {
                    projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
                },
            } as never),
        ).toEqual({
            type: 'toolCall',
            toolCallId: 'toolu_123',
            toolName: 'mcp_lightdash__set_project',
            toolArgs: {
                projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
            },
            toolResult: null,
            isPreliminary: undefined,
        });
    });

    it('keeps MCP tool output parts for live rendering', () => {
        const output = {
            content: [
                {
                    type: 'text',
                    text: '{"projectName":"Jaffle shop"}',
                },
            ],
        };

        expect(
            getStreamToolCallPart({
                type: 'dynamic-tool',
                toolName: 'mcp_lightdash__set_project',
                toolCallId: 'toolu_123',
                state: 'output-available',
                input: {
                    projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
                },
                output,
            } as never),
        ).toEqual({
            type: 'toolCall',
            toolCallId: 'toolu_123',
            toolName: 'mcp_lightdash__set_project',
            toolArgs: {
                projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
            },
            toolResult: output,
            isPreliminary: false,
        });
    });
});

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
                    toolName: 'editDbtProject',
                },
                transient: true,
            }),
        ).toEqual({ message: 'Cloning project', toolName: 'editDbtProject' });
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
