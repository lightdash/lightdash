import {
    type LearnCatalogueEntry,
    type LearnEventInput,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    badgeStates,
    cardState,
    emptyRollup,
    pathProgress,
    pathsFromCatalogue,
    rollupFromEvents,
} from './model';

const entry = (
    overrides: Partial<LearnCatalogueEntry> & { id: string },
): LearnCatalogueEntry => ({
    title: overrides.id,
    description: '',
    version: 1,
    contentHash: 'abc123',
    path: `courses/${overrides.id}/abc123/course.json`,
    lessonCount: 3,
    durationMinutes: 20,
    tags: [],
    track: null,
    publishedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
});

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

describe('cardState', () => {
    it('maps rollups to open / current / done', () => {
        expect(cardState(undefined)).toBe('open');
        expect(cardState(emptyRollup())).toBe('open');
        expect(cardState({ ...emptyRollup(), started: true })).toBe('current');
        expect(cardState({ ...emptyRollup(), completed: true })).toBe('done');
    });
});

describe('pathsFromCatalogue / pathProgress / badgeStates', () => {
    const entries = [
        entry({ id: 'viewer-fundamentals', track: 'foundations' }),
        entry({ id: 'exploring-data', track: 'analyst' }),
        entry({ id: 'ai-agents-essentials', track: 'ai' }),
        entry({ id: 'metrics-as-code', track: 'builder' }),
        entry({ id: 'mystery-module', track: null }),
    ];

    it('groups foundations as shared and folds ai into the analyst path', () => {
        const { analyst, builder } = pathsFromCatalogue(entries);
        expect(analyst.foundations.map((e) => e.id)).toEqual([
            'viewer-fundamentals',
        ]);
        expect(analyst.courses.map((e) => e.id)).toEqual([
            'exploring-data',
            'ai-agents-essentials',
        ]);
        expect(builder.courses.map((e) => e.id)).toEqual(['metrics-as-code']);
        expect(builder.foundations.map((e) => e.id)).toEqual([
            'viewer-fundamentals',
        ]);
        // unknown tracks are simply not routed into either path in the Learn port
        expect(
            [...analyst.courses, ...builder.courses].some(
                (e) => e.id === 'mystery-module',
            ),
        ).toBe(false);
    });

    it('computes path progress from done courses only', () => {
        const { analyst } = pathsFromCatalogue(entries);
        const rollups = new Map([
            ['viewer-fundamentals', { ...emptyRollup(), completed: true }],
            ['exploring-data', { ...emptyRollup(), started: true }],
        ]);
        const progress = pathProgress(analyst, rollups);
        expect(progress.total).toBe(3);
        expect(progress.completed).toBe(1);
        expect(progress.pct).toBe(33);
    });

    it('derives badge earned states from completion counts', () => {
        const { analyst } = pathsFromCatalogue(entries);
        const none = badgeStates(analyst, new Map());
        expect(none.every((b) => !b.earned)).toBe(true);

        const all = new Map(
            [...analyst.foundations, ...analyst.courses].map((e) => [
                e.id,
                { ...emptyRollup(), completed: true },
            ]),
        );
        const earned = badgeStates(analyst, all);
        expect(earned.every((b) => b.earned)).toBe(true);
        expect(earned.map((b) => b.id)).toContain('first-steps');
    });
});
