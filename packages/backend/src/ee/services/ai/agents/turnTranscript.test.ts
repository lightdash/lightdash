import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { createTurnTranscript } from './turnTranscript';

const system: ModelMessage = { role: 'system', content: 'system' };
const memory: ModelMessage = { role: 'user', content: 'memory' };

describe('createTurnTranscript', () => {
    it('keeps the last step messages after the leading ones plus the final response', () => {
        const transcript = createTurnTranscript(2);
        transcript.recordStep([system, memory, { role: 'user', content: 'a' }]);
        transcript.recordStep([
            system,
            memory,
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

    it('is not kept when the turn holds binary inputs', () => {
        const transcript = createTurnTranscript(1);
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
