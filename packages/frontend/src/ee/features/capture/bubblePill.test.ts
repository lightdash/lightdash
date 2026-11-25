import { describe, expect, it } from 'vitest';
import { pillLabel, pillState } from './bubblePill';

const quiet = { failed: false, working: false, asked: false, unread: false };

describe('pillState', () => {
    it('says the agent is working while a reply is on its way', () => {
        expect(pillState({ ...quiet, working: true, unread: true })).toBe(
            'working',
        );
    });

    it('says a reply is ready once the agent is done and it is unread', () => {
        expect(pillState({ ...quiet, unread: true })).toBe('ready');
    });

    it('a question for the user comes before a ready reply', () => {
        expect(pillState({ ...quiet, asked: true, unread: true })).toBe(
            'needs-answer',
        );
        // Still waiting on the user after they have read it.
        expect(pillState({ ...quiet, asked: true })).toBe('needs-answer');
    });

    it('a failed send comes before everything', () => {
        expect(
            pillState({
                failed: true,
                working: true,
                asked: true,
                unread: true,
            }),
        ).toBe('failed');
    });

    it('a read conversation is at rest', () => {
        expect(pillState(quiet)).toBe('idle');
    });
});

describe('pillLabel', () => {
    it('is sentence case and names no product', () => {
        const labels = (
            ['working', 'ready', 'needs-answer', 'failed'] as const
        ).map(pillLabel);
        expect(labels).toEqual([
            'Working',
            'Reply ready',
            'Needs your answer',
            'Could not send',
        ]);
        expect(pillLabel('idle')).toBeNull();
    });
});
