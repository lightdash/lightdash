import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { createTurnTranscript } from './turnTranscript';

const system: ModelMessage = { role: 'system', content: 'system' };
const earlierTurn: ModelMessage[] = [
    { role: 'user', content: 'earlier' },
    { role: 'assistant', content: 'earlier answer' },
];
const toolCall: ModelMessage = {
    role: 'assistant',
    content: [
        {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'editContent',
            input: { slug: 'revenue' },
        },
    ],
};
const toolResult: ModelMessage = {
    role: 'tool',
    content: [
        {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'editContent',
            output: { type: 'text', value: 'Saved.' },
        },
    ],
};

describe('createTurnTranscript', () => {
    it("keeps only this turn's tool steps; prompt, hints, preloads and steers are rebuilt each turn", () => {
        const transcript = createTurnTranscript({ start: 3 });
        transcript.recordStep([
            system,
            ...earlierTurn,
            { role: 'user', content: 'Rename it\n\nCandidate fields: ...' },
            { role: 'user', content: 'Reference material preloaded ...' },
            { role: 'user', content: 'Current content of the bound chart' },
            toolCall,
            toolResult,
            { role: 'user', content: 'Additional guidance from the user' },
        ]);

        expect(transcript.complete()).toEqual([toolCall, toolResult]);
    });

    it('is not kept when the turn holds binary inputs', () => {
        const transcript = createTurnTranscript({ start: 1 });
        transcript.recordStep([
            system,
            toolCall,
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-result',
                        toolCallId: 'call-1',
                        toolName: 'editContent',
                        output: {
                            type: 'content',
                            value: [
                                {
                                    type: 'file-data',
                                    data: 'AQ==',
                                    mediaType: 'image/png',
                                },
                            ],
                        },
                    },
                ],
            },
        ]);

        expect(transcript.complete()).toBeNull();
    });
});
