import { describe, expect, it } from 'vitest';
import { type LearnEventInput } from '../types';
import {
    cardState,
    emptyRollup,
    mergeRollups,
    rollupFromEvents,
    rollupFromServer,
} from './rollup';

const event = (
    overrides: Partial<LearnEventInput> & {
        object: LearnEventInput['object'];
    },
): LearnEventInput => ({
    verb: 'started',
    occurredAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
});

describe('rollupFromEvents', () => {
    it('derives lessons, best score, pass and completion from events', () => {
        const events: LearnEventInput[] = [
            event({ object: { type: 'course', course: 'a' } }),
            event({
                verb: 'completed',
                object: { type: 'lesson', course: 'a', lesson: 'l1' },
            }),
            event({
                verb: 'failed',
                object: { type: 'quiz', course: 'a' },
                result: { score: 40 },
            }),
            event({
                verb: 'passed',
                object: { type: 'quiz', course: 'a' },
                result: { score: 90 },
            }),
            // different course — must be ignored
            event({
                verb: 'completed',
                object: { type: 'lesson', course: 'b', lesson: 'x' },
            }),
        ];
        const rollup = rollupFromEvents(events, 'a');
        expect(rollup.started).toBe(true);
        expect([...rollup.lessonsCompleted]).toEqual(['l1']);
        expect(rollup.bestScore).toBe(90);
        expect(rollup.passed).toBe(true);
        // quiz pass implies completion
        expect(rollup.completed).toBe(true);
    });

    it('returns an empty rollup when no events match the course', () => {
        expect(rollupFromEvents([], 'a')).toEqual(emptyRollup());
    });
});

describe('rollupFromServer / mergeRollups', () => {
    it('maps server progress rows onto the rollup shape', () => {
        const rollup = rollupFromServer({
            courseId: 'a',
            startedAt: '2026-08-01T00:00:00.000Z',
            completedAt: null,
            lessonsCompleted: ['l1', 'l2'],
            quiz: { bestScore: 70, passed: false, passedAt: null },
            lastEventAt: '2026-08-01T00:00:00.000Z',
        });
        expect(rollup.started).toBe(true);
        expect(rollup.completed).toBe(false);
        expect(rollup.bestScore).toBe(70);
        expect(rollup.lessonsCompleted.size).toBe(2);
    });

    it('merges local and server rollups by union / max', () => {
        const local = {
            ...emptyRollup(),
            started: true,
            lessonsCompleted: new Set(['l1']),
            bestScore: 50,
        };
        const server = {
            ...emptyRollup(),
            lessonsCompleted: new Set(['l2']),
            bestScore: 90,
            passed: true,
            completed: true,
        };
        const merged = mergeRollups(local, server);
        expect([...merged.lessonsCompleted].sort()).toEqual(['l1', 'l2']);
        expect(merged.bestScore).toBe(90);
        expect(merged.passed).toBe(true);
        expect(cardState(merged)).toBe('done');
    });
});

describe('cardState', () => {
    it('maps rollups to open / current / done', () => {
        expect(cardState(undefined)).toBe('open');
        expect(cardState(emptyRollup())).toBe('open');
        expect(cardState({ ...emptyRollup(), started: true })).toBe('current');
        expect(cardState({ ...emptyRollup(), completed: true })).toBe('done');
    });
});
