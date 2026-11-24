import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { createTurnTranscript } from './turnTranscript';

const system: ModelMessage = { role: 'system', content: 'system' };
const earlierTurn: ModelMessage[] = [
    { role: 'user', content: 'earlier' },
    { role: 'assistant', content: 'earlier answer' },
];

describe('createTurnTranscript', () => {
    it('keeps this turn as the last step sent it, plus the final response', () => {
        const transcript = createTurnTranscript({
            start: 3,
            currentOnlyIndex: null,
        });
        transcript.recordStep([
            system,
            ...earlierTurn,
            { role: 'user', content: 'a' },
        ]);
        transcript.recordStep([
            system,
            ...earlierTurn,
            { role: 'user', content: 'a' },
            { role: 'assistant', content: 'b' },
        ]);

        expect(
            transcript.complete([{ role: 'assistant', content: 'done' }]),
        ).toEqual([
            { role: 'user', content: 'a' },
            { role: 'assistant', content: 'b' },
            { role: 'assistant', content: 'done' },
        ]);
    });

    it('leaves out the bound content read for this turn, so a later turn sees only its own fresh copy', () => {
        const transcript = createTurnTranscript({
            start: 1,
            currentOnlyIndex: 2,
        });
        transcript.recordStep([
            system,
            { role: 'user', content: 'Rename the chart' },
            { role: 'user', content: 'Current content of the bound chart' },
            { role: 'assistant', content: 'Renamed.' },
        ]);

        expect(transcript.complete([])).toEqual([
            { role: 'user', content: 'Rename the chart' },
            { role: 'assistant', content: 'Renamed.' },
        ]);
    });

    it('is not kept when the turn holds binary inputs', () => {
        const transcript = createTurnTranscript({
            start: 1,
            currentOnlyIndex: null,
        });
        transcript.recordStep([
            system,
            {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        image: new Uint8Array([1]),
                    },
                ],
            },
        ]);

        expect(transcript.complete([])).toBeNull();
    });
});
