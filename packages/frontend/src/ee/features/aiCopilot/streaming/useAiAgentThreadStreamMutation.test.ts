import type { ReasoningUIPart } from 'ai';
import { describe, expect, it } from 'vitest';
import {
    getReasoningFromPart,
    getStreamToolCallPart,
    getStepProgressFromChunk,
    readStreamResult,
} from './useAiAgentThreadStreamMutation';

describe('getReasoningFromPart', () => {
    it('reads Gemini reasoning signatures', () => {
        const part: ReasoningUIPart = {
            type: 'reasoning',
            text: 'Reasoning summary',
            providerMetadata: {
                google: { signature: 'gemini-signature' },
            },
        };

        expect(getReasoningFromPart(part)).toEqual({
            reasoningId: 'gemini-signature',
            text: 'Reasoning summary',
        });
    });

    it('ignores Gemini reasoning blocks without a stable signature', () => {
        const part: ReasoningUIPart = {
            type: 'reasoning',
            text: 'Reasoning summary',
            providerMetadata: {
                google: { interactionId: 'interaction-id' },
            },
        };

        expect(getReasoningFromPart(part)).toBeNull();
    });
});

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
        ).toEqual({
            message: 'Cloning project',
            toolName: 'editDbtProject',
            progressId: null,
            progressStatus: null,
        });
    });

    it('parses progress data chunks without a tool name (toolName null)', () => {
        expect(
            getStepProgressFromChunk({
                type: 'data-step-progress',
                data: { message: 'Running your query...' },
                transient: true,
            }),
        ).toEqual({
            message: 'Running your query...',
            toolName: null,
            progressId: null,
            progressStatus: null,
        });
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
