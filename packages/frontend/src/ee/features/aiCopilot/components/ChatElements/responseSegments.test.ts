import { type AiAgentMessageAssistant } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getToolGroups,
    segmentPersistedResponse,
    splitAnswerAndNarration,
} from './responseSegments';

const toolCall = (toolCallId: string, toolName: string) => ({
    uuid: toolCallId,
    promptUuid: 'prompt-1',
    toolCallId,
    parentToolCallId: null,
    createdAt: new Date(),
    toolType: 'built-in' as const,
    toolName,
    toolArgs: {},
});

const message = (
    responseParts: AiAgentMessageAssistant['responseParts'],
): AiAgentMessageAssistant =>
    ({
        responseParts,
        toolCalls: [
            toolCall('call-1', 'findExplores'),
            toolCall('call-2', 'runQuery'),
        ],
    }) as unknown as AiAgentMessageAssistant;

describe('response segments', () => {
    it('keeps old prompts on the full-text path', () => {
        expect(segmentPersistedResponse(message(null))).toBeNull();
    });

    it('folds narration under the next tool group and keeps the final text as the answer', () => {
        const segments = segmentPersistedResponse(
            message([
                { type: 'text', text: 'Checking the data.' },
                { type: 'tool', toolCallId: 'call-1' },
                { type: 'text', text: 'Two orgs match.' },
                { type: 'tool', toolCallId: 'call-2' },
                { type: 'text', text: 'Mostly correct.' },
                { type: 'text', text: 'Caveat.' },
            ]),
        )!;
        expect(splitAnswerAndNarration(segments, false)).toEqual({
            answer: 'Mostly correct.\n\nCaveat.',
            narrationByGroupKey: {
                'call-1': ['Checking the data.'],
                'call-2': ['Two orgs match.'],
            },
        });
    });

    it('streams the latest text as the answer even before a running tool', () => {
        const segments = segmentPersistedResponse(
            message([
                { type: 'text', text: 'Checking the data.' },
                { type: 'tool', toolCallId: 'call-1' },
                { type: 'text', text: 'Now querying.' },
                { type: 'tool', toolCallId: 'call-2' },
                { type: 'text', text: '  ' },
            ]),
        )!;
        expect(splitAnswerAndNarration(segments, true)).toEqual({
            answer: 'Now querying.',
            narrationByGroupKey: { 'call-1': ['Checking the data.'] },
        });
    });

    it('leads with tool calls from an earlier run of the prompt', () => {
        const segments = segmentPersistedResponse(
            message([
                { type: 'text', text: 'Approved, running it.' },
                { type: 'tool', toolCallId: 'call-2' },
                { type: 'tool', toolCallId: 'missing' },
                { type: 'text', text: 'Done.' },
            ]),
        )!;
        expect(getToolGroups(segments).map((g) => g.keyId)).toEqual([
            'call-1',
            'call-2',
        ]);
        expect(splitAnswerAndNarration(segments, false)).toEqual({
            answer: 'Done.',
            narrationByGroupKey: { 'call-2': ['Approved, running it.'] },
        });
    });
});
