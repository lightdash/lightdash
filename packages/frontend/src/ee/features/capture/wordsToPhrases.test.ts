import { describe, expect, it } from 'vitest';
import { wordsToPhrases } from './wordsToPhrases';

const w = (startMs: number, text: string, lengthMs = 250) => ({
    startMs,
    endMs: startMs + lengthMs,
    text,
});

describe('wordsToPhrases', () => {
    it('joins words spoken together into one phrase timed from its first word', () => {
        expect(
            wordsToPhrases([w(1000, 'make'), w(1300, 'it'), w(1600, 'blue')], {
                offsetMs: 0,
                breakAtMs: [],
            }),
        ).toEqual([{ atMs: 1000, text: 'make it blue' }]);
    });

    it('starts a new phrase after a pause', () => {
        expect(
            wordsToPhrases([w(1000, 'this'), w(3000, 'and'), w(3300, 'that')], {
                offsetMs: 0,
                breakAtMs: [],
            }),
        ).toEqual([
            { atMs: 1000, text: 'this' },
            { atMs: 3000, text: 'and that' },
        ]);
    });

    it('splits a continuous sentence where a new mark begins', () => {
        const words = [
            w(1000, 'move'),
            w(1300, 'this'),
            w(1600, 'over'),
            w(1900, 'to'),
            w(2200, 'here'),
        ];
        expect(
            wordsToPhrases(words, { offsetMs: 0, breakAtMs: [900, 2100] }),
        ).toEqual([
            { atMs: 1000, text: 'move this over' },
            { atMs: 1900, text: 'to here' },
        ]);
    });

    it('shifts times by when the recording started', () => {
        expect(
            wordsToPhrases([w(500, 'hello')], {
                offsetMs: 2000,
                breakAtMs: [],
            }),
        ).toEqual([{ atMs: 2500, text: 'hello' }]);
    });

    // The recorder starts a moment before the capture clock, so the first
    // words can land before zero.
    it('never times speech before the recording started', () => {
        expect(
            wordsToPhrases([w(300, 'and'), w(600, 'so')], {
                offsetMs: -1200,
                breakAtMs: [],
            }),
        ).toEqual([{ atMs: 0, text: 'and so' }]);
    });

    it('returns nothing for no words', () => {
        expect(wordsToPhrases([], { offsetMs: 0, breakAtMs: [] })).toEqual([]);
    });
});
