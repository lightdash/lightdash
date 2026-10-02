import {
    type AiAgentToolCall,
    type AiAgentToolResult,
    type ToolGenerateUiMetadata,
} from '@lightdash/common';
import {
    moveChartsOutcomesMock,
    moveChartsSpecMock,
} from '@lightdash/common/src/ee/AiAgent/generativeUi/generativeUiSpec.mock';
import { describe, expect, it } from 'vitest';
import { type StreamPart } from '../../../store/aiAgentThreadStreamSlice';
import {
    getGenerativeUiCalls,
    hasUnresolvedGenerateUi,
} from './generativeUiCalls';

const toolCall = (toolCallId: string, toolName: string): AiAgentToolCall => ({
    uuid: `row-${toolCallId}`,
    promptUuid: 'message-1',
    toolCallId,
    parentToolCallId: null,
    createdAt: new Date('2026-09-29T00:00:00Z'),
    toolArgs: moveChartsSpecMock,
    toolType: 'built-in',
    toolName,
});

const dismissed: ToolGenerateUiMetadata = {
    status: 'dismissed',
    state: moveChartsOutcomesMock.dismissed.state,
};

const toolResult = (toolCallId: string): AiAgentToolResult => ({
    uuid: `result-${toolCallId}`,
    promptUuid: 'message-1',
    result: 'The user skipped the card; nothing ran.',
    createdAt: new Date('2026-09-29T00:01:00Z'),
    toolCallId,
    toolType: 'built-in',
    toolName: 'generateUi',
    metadata: dismissed,
});

const livePart = (
    toolCallId: string,
    toolResult: { result: string; metadata: unknown } | null,
): StreamPart => ({
    type: 'toolCall',
    toolCallId,
    toolName: 'generateUi',
    toolArgs: moveChartsSpecMock,
    toolResult,
});

describe('getGenerativeUiCalls', () => {
    it('keeps only generateUi calls, persisted first, then live-only ones', () => {
        const calls = getGenerativeUiCalls({
            toolCalls: [
                toolCall('tc-1', 'findCharts'),
                toolCall('tc-2', 'generateUi'),
            ],
            toolResults: [],
            streamParts: [
                { type: 'text', text: 'Here is a form' },
                livePart('tc-3', null),
                livePart('tc-2', null),
            ],
        });

        expect(calls.map(({ toolCallId }) => toolCallId)).toEqual([
            'tc-2',
            'tc-3',
        ]);
        expect(calls.every(({ result }) => result === null)).toBe(true);
    });

    it('resolves a call from a persisted or a live result', () => {
        const calls = getGenerativeUiCalls({
            toolCalls: [
                toolCall('tc-1', 'generateUi'),
                toolCall('tc-2', 'generateUi'),
            ],
            toolResults: [toolResult('tc-1')],
            streamParts: [
                livePart('tc-2', {
                    result: 'The user skipped the card; nothing ran.',
                    metadata: dismissed,
                }),
            ],
        });

        expect(calls).toEqual([
            {
                toolCallId: 'tc-1',
                toolArgs: moveChartsSpecMock,
                result: { metadata: dismissed },
            },
            {
                toolCallId: 'tc-2',
                toolArgs: moveChartsSpecMock,
                result: { metadata: dismissed },
            },
        ]);
    });
});

describe('hasUnresolvedGenerateUi', () => {
    it('is true while a persisted card has no result', () => {
        expect(
            hasUnresolvedGenerateUi({
                toolCalls: [toolCall('tc-1', 'generateUi')],
                toolResults: [],
            }),
        ).toBe(true);
    });

    it('is false once every card has a result, or with no card', () => {
        expect(
            hasUnresolvedGenerateUi({
                toolCalls: [toolCall('tc-1', 'generateUi')],
                toolResults: [toolResult('tc-1')],
            }),
        ).toBe(false);
        expect(
            hasUnresolvedGenerateUi({
                toolCalls: [toolCall('tc-1', 'findCharts')],
                toolResults: [],
            }),
        ).toBe(false);
    });
});
