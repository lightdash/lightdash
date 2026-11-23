import { describe, expect, it } from 'vitest';
import {
    formatPacing,
    formatResetsAt,
    formatUntil,
    formatUsed,
} from './rateLimitFormat';

const CHECKED = '2026-11-23T14:00:00.000Z';
const at = (offsetMs: number) =>
    new Date(new Date(CHECKED).getTime() + offsetMs).toISOString();

describe('formatResetsAt', () => {
    it('counts seconds under a minute', () => {
        expect(formatResetsAt(at(42_000), CHECKED)).toBe('resets in 42s');
    });

    it('counts minutes under an hour', () => {
        expect(formatResetsAt(at(37 * 60_000), CHECKED)).toBe(
            'resets in 37 min',
        );
    });

    it('gives a time later today', () => {
        expect(formatResetsAt(at(3 * 3_600_000), CHECKED)).toMatch(
            /^resets at /,
        );
    });

    it('gives a date beyond today', () => {
        expect(formatResetsAt(at(30 * 3_600_000), CHECKED)).toMatch(
            /^resets .+, /,
        );
    });

    it('never counts below zero', () => {
        expect(formatResetsAt(at(-5_000), CHECKED)).toBe('resets in 0s');
    });
});

describe('formatUntil', () => {
    it('gives a time today and a date beyond', () => {
        expect(formatUntil(at(5 * 60_000), CHECKED)).toMatch(/^until \d/);
        expect(formatUntil(at(30 * 3_600_000), CHECKED)).toMatch(/^until .+, /);
    });
});

describe('formatPacing', () => {
    it('says calls a second, or seconds between calls', () => {
        expect(formatPacing(4)).toBe('4 calls a second');
        expect(formatPacing(1)).toBe('1 call a second');
        expect(formatPacing(0.5)).toBe('1 call every 2 seconds');
    });
});

describe('formatUsed', () => {
    it('groups thousands', () => {
        expect(formatUsed(410, 10_000)).toBe('410 of 10,000');
    });
});
