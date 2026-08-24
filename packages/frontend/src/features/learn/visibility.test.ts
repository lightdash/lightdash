import { describe, expect, it } from 'vitest';
import {
    effectiveEntry,
    effectiveRollup,
    filterCourseForScopes,
    lessonVisible,
    manifestScopeKnown,
    visibleLessonCount,
} from './visibility';

// Real registry scopes: the DashboardComments trio is the CS-169 reference
// scope group (view held from interactive viewer, create from editor,
// manage from developer).
const VIEW = 'view:DashboardComments';
const CREATE = 'create:DashboardComments';
const MANAGE = 'manage:DashboardComments';

describe('lessonVisible', () => {
    it('an untagged lesson (null or undefined) is always visible', () => {
        expect(lessonVisible(null, [], manifestScopeKnown)).toBe(true);
        expect(lessonVisible(undefined, [], manifestScopeKnown)).toBe(true);
    });

    it('a scope whose base the registry does not know is always visible (forward compat)', () => {
        expect(manifestScopeKnown('view:FluxCapacitor')).toBe(false);
        expect(
            lessonVisible('view:FluxCapacitor', [], manifestScopeKnown),
        ).toBe(true);
    });

    it('a known scope is visible only when held', () => {
        expect(lessonVisible(VIEW, [VIEW], manifestScopeKnown)).toBe(true);
        expect(lessonVisible(MANAGE, [VIEW], manifestScopeKnown)).toBe(false);
    });

    it('a bare tag is held under any modifier; @global only unmodified', () => {
        expect(
            lessonVisible(MANAGE, [`${MANAGE}@space`], manifestScopeKnown),
        ).toBe(true);
        expect(
            lessonVisible(
                `${VIEW}@global`,
                [`${VIEW}@space`],
                manifestScopeKnown,
            ),
        ).toBe(false);
        expect(
            lessonVisible(`${VIEW}@global`, [VIEW], manifestScopeKnown),
        ).toBe(true);
    });

    it('honours a caller-supplied scopeKnown', () => {
        // Pretend the base is unknown: the lesson stays visible even unheld.
        expect(lessonVisible(MANAGE, [], () => false)).toBe(true);
    });
});

describe('visibleLessonCount', () => {
    const entry = { lessonCount: 3, lessonScopes: [VIEW, null, MANAGE] };

    it('counts lessons visible to the held scopes, nulls always counted', () => {
        expect(visibleLessonCount(entry, [VIEW])).toBe(2);
        expect(visibleLessonCount(entry, [VIEW, CREATE, MANAGE])).toBe(3);
        expect(visibleLessonCount(entry, [])).toBe(1);
    });

    it('falls back to lessonCount when the catalogue has no lessonScopes', () => {
        expect(visibleLessonCount({ lessonCount: 5 }, [])).toBe(5);
    });
});

describe('effectiveEntry', () => {
    it('replaces lessonCount with the visible count, leaving the original untouched', () => {
        const entry = {
            id: 'dashboard-comments',
            lessonCount: 3,
            lessonScopes: [VIEW, CREATE, MANAGE],
        };
        const eff = effectiveEntry(entry, [VIEW]);
        expect(eff.lessonCount).toBe(1);
        expect(eff.id).toBe('dashboard-comments');
        expect(entry.lessonCount).toBe(3);
    });

    it('is the identity for an entry without lessonScopes (pre-CS-169 catalogue)', () => {
        const entry = { id: 'legacy', lessonCount: 4 };
        expect(effectiveEntry(entry, [])).toBe(entry);
    });
});

describe('filterCourseForScopes', () => {
    const course = {
        title: 'Dashboard comments',
        lessons: [
            { id: '01-read', title: 'Read', html: '', scope: VIEW },
            { id: '02-post', title: 'Post', html: '', scope: CREATE },
            { id: '03-tidy', title: 'Tidy', html: '', scope: MANAGE },
        ],
        quiz: {
            questions: [
                {
                    id: 'q1',
                    prompt: 'a',
                    choices: ['x', 'y'],
                    answer: 0,
                    lesson: '01-read',
                },
                {
                    id: 'q2',
                    prompt: 'b',
                    choices: ['x', 'y'],
                    answer: 1,
                    lesson: '02-post',
                },
                {
                    id: 'q3',
                    prompt: 'c',
                    choices: ['x', 'y'],
                    answer: 0,
                    lesson: '03-tidy',
                },
                { id: 'q4', prompt: 'd', choices: ['x', 'y'], answer: 1 },
            ],
        },
    };

    it('drops hidden lessons and their quiz questions, keeping questions without a lesson key', () => {
        const filtered = filterCourseForScopes(course, [VIEW, CREATE]);
        expect(filtered.lessons.map((l) => l.id)).toEqual([
            '01-read',
            '02-post',
        ]);
        expect(filtered.quiz.questions.map((q) => q.id)).toEqual([
            'q1',
            'q2',
            'q4',
        ]);
    });

    it('keeps untagged and unknown-scope lessons visible', () => {
        const mixed = {
            lessons: [
                { id: 'a', scope: null },
                { id: 'b' },
                { id: 'c', scope: 'view:FluxCapacitor' },
                { id: 'd', scope: MANAGE },
            ],
            quiz: { questions: [] },
        };
        expect(
            filterCourseForScopes(mixed, []).lessons.map((l) => l.id),
        ).toEqual(['a', 'b', 'c']);
    });

    it('returns the same course object when nothing is hidden (pre-CS-169 course.json)', () => {
        const legacy = {
            lessons: [
                { id: 'l1', title: 'One', html: '' },
                { id: 'l2', title: 'Two', html: '' },
            ],
            quiz: {
                questions: [
                    { id: 'q1', prompt: 'a', choices: ['x'], answer: 0 },
                ],
            },
        };
        expect(filterCourseForScopes(legacy, [])).toBe(legacy);
        expect(filterCourseForScopes(course, [VIEW, CREATE, MANAGE])).toBe(
            course,
        );
    });

    it('does not mutate the original course', () => {
        const filtered = filterCourseForScopes(course, [VIEW]);
        expect(filtered).not.toBe(course);
        expect(course.lessons).toHaveLength(3);
        expect(course.quiz.questions).toHaveLength(4);
        expect(filtered.lessons).toHaveLength(1);
        expect(filtered.quiz.questions.map((q) => q.id)).toEqual(['q1', 'q4']);
    });
});

describe('effectiveRollup', () => {
    const entry = { lessonCount: 3, lessonScopes: [VIEW, CREATE, MANAGE] };
    const completedTwo = {
        completed: true,
        passed: true,
        lessonsCompleted: new Set(['l1', 'l2']),
    };

    it('re-opens a completed module when a role change unlocks a lesson', () => {
        // Completed with 2 visible lessons as interactive viewer, then
        // switched to editor: 3 visible, only 2 done — the module must stop
        // reading as done.
        const derived = effectiveRollup(entry, completedTwo, [
            VIEW,
            CREATE,
            MANAGE,
        ]);
        expect(derived).toEqual({
            completed: false,
            passed: false,
            lessonsCompleted: completedTwo.lessonsCompleted,
        });
    });

    it('keeps done on a downgrade — everything the role can see is finished', () => {
        // Completed all 3 as editor, then switched to viewer: 1 visible, 3 done.
        const all = {
            completed: true,
            passed: true,
            lessonsCompleted: new Set(['l1', 'l2', 'l3']),
        };
        expect(effectiveRollup(entry, all, [VIEW])).toBe(all);
    });

    it('is the identity for a module the role does not hold at all', () => {
        const locked = { lessonCount: 2, lessonScopes: [MANAGE, MANAGE] };
        expect(effectiveRollup(locked, completedTwo, [VIEW])).toBe(
            completedTwo,
        );
    });

    it('is the identity when the rollup is not completed, and for undefined', () => {
        const open = {
            completed: false,
            passed: false,
            lessonsCompleted: new Set<string>(),
        };
        expect(effectiveRollup(entry, open, [VIEW, CREATE, MANAGE])).toBe(open);
        expect(effectiveRollup(entry, undefined, [VIEW])).toBeUndefined();
    });
});
