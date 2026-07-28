import type { DistillTranscript } from './transcriptSanitizer';
import { serializeTranscript } from './transcriptSerializer';

const transcript: DistillTranscript = {
    createdFrom: 'web_app',
    turns: Array.from({ length: 8 }, (_, index) => ({
        index: index + 1,
        user: `Question ${index + 1} ${'u'.repeat(80)}`,
        assistant: `Answer ${index + 1} ${'a'.repeat(80)}`,
    })),
};

describe('serializeTranscript', () => {
    it('keeps an under-budget transcript byte-for-byte JSON serializable', () => {
        expect(serializeTranscript(transcript, 10_000)).toBe(
            JSON.stringify(transcript),
        );
    });

    it('keeps head and tail turns with an explicit accurate omission marker', () => {
        const serialized = serializeTranscript(transcript, 800);
        const parsed = JSON.parse(serialized) as {
            transcriptHead: string;
            omission: {
                omittedTurns: number;
                omittedChars: number;
            };
            transcriptTail: string;
        };
        const full = JSON.stringify(transcript);

        expect(serialized.length).toBeLessThanOrEqual(800);
        expect(parsed.transcriptHead).toBe(
            full.slice(0, parsed.transcriptHead.length),
        );
        expect(parsed.transcriptTail).toBe(
            full.slice(-parsed.transcriptTail.length),
        );
        expect(parsed.omission.omittedTurns).toBeGreaterThan(0);
        expect(parsed.omission.omittedChars).toBe(
            full.length -
                parsed.transcriptHead.length -
                parsed.transcriptTail.length,
        );
    });

    it('preserves both ends of a single oversized turn', () => {
        const oversized: DistillTranscript = {
            createdFrom: 'web_app',
            turns: [
                {
                    index: 1,
                    user: `first:${'x'.repeat(2_000)}:last`,
                },
            ],
        };
        const full = JSON.stringify(oversized);
        const serialized = serializeTranscript(oversized, 600);
        const parsed = JSON.parse(serialized) as {
            transcriptHead: string;
            omission: {
                omittedTurns: number;
                omittedChars: number;
            };
            transcriptTail: string;
        };

        expect(parsed.transcriptHead).toContain('first:');
        expect(parsed.transcriptTail).toContain(':last');
        expect(parsed.omission.omittedTurns).toBe(0);
        expect(parsed.omission.omittedChars).toBe(
            full.length -
                parsed.transcriptHead.length -
                parsed.transcriptTail.length,
        );
    });
});
