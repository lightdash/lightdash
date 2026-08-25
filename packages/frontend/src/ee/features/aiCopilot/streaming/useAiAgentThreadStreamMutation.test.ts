import { describe, expect, it } from 'vitest';
import {
    getStreamToolCallPart,
    readStreamResult,
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
            isArgsPartial: false,
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
            isArgsPartial: false,
        });
    });
});

describe('readStreamResult', () => {
    it('returns a successful stream read', async () => {
        await expect(
            readStreamResult(() => Promise.resolve('chunk')),
        ).resolves.toEqual({ status: 'success', value: 'chunk' });
    });

    it('returns a stream read error without inspecting its message', async () => {
        const error = new Error('browser-specific message');

        await expect(
            readStreamResult(() => Promise.reject(error)),
        ).resolves.toEqual({ status: 'error', error });
    });
});
