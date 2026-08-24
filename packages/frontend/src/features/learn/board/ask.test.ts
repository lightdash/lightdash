// Ask derivation tests. Twin: lightdash-university test/academy-board-ask.test.ts.
// A change here lands in both repositories in the same piece of work.

import { ProjectMemberRole } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { askHighlights, lockedLabel, suggestionsFor } from './ask';
import { roleScopes } from './model';
import { entry } from './testFixtures';

const library = [
    entry({ id: 'foundation', scope: 'view:Project' }),
    entry({ id: 'dashboards', scope: 'manage:Dashboard' }),
    entry({ id: 'org', scope: 'manage:Organization' }),
];
const viewer = roleScopes(ProjectMemberRole.VIEWER);
const admin = roleScopes(ProjectMemberRole.ADMIN);

const match = (courseId: string, score = 0.9) => ({
    courseId,
    title: courseId,
    score,
});

describe('askHighlights', () => {
    it('splits matches into the ones the role holds and the ones it does not', () => {
        const { matched, locked } = askHighlights(
            [match('foundation'), match('org')],
            library,
            viewer,
        );
        expect([...matched]).toEqual(['foundation']);
        expect([...locked]).toEqual(['org']);
    });

    it('locks nothing for a role that holds everything', () => {
        const { matched, locked } = askHighlights(
            [match('foundation'), match('org')],
            library,
            admin,
        );
        expect([...matched].sort()).toEqual(['foundation', 'org']);
        expect(locked.size).toBe(0);
    });

    it('drops results naming a module the catalogue does not have', () => {
        const { matched, locked } = askHighlights(
            [match('ghost')],
            library,
            admin,
        );
        expect(matched.size).toBe(0);
        expect(locked.size).toBe(0);
    });

    it('de-duplicates lesson-level matches within one module', () => {
        const { matched } = askHighlights(
            [
                {
                    courseId: 'foundation',
                    lessonId: '01',
                    title: 'One',
                    score: 0.9,
                },
                {
                    courseId: 'foundation',
                    lessonId: '02',
                    title: 'Two',
                    score: 0.8,
                },
            ],
            library,
            viewer,
        );
        expect([...matched]).toEqual(['foundation']);
    });

    it('highlights nothing for an empty result list', () => {
        const { matched, locked } = askHighlights([], library, viewer);
        expect(matched.size).toBe(0);
        expect(locked.size).toBe(0);
    });
});

describe('suggestionsFor', () => {
    const suggestions = [
        { query: 'Where do I find things?', courseId: 'foundation' },
        { query: 'How do I run the org?', courseId: 'org' },
        { query: 'Ghost', courseId: 'not-in-catalogue' },
    ];

    it('keeps only suggestions whose module the role holds', () => {
        expect(
            suggestionsFor(suggestions, library, viewer).map((s) => s.courseId),
        ).toEqual(['foundation']);
    });

    it('keeps authored order for a role that holds more', () => {
        expect(
            suggestionsFor(suggestions, library, admin).map((s) => s.courseId),
        ).toEqual(['foundation', 'org']);
    });

    it('caps the chips at one row of three, in authored order', () => {
        const many = [1, 2, 3, 4, 5].map((n) => ({
            query: `Question ${n}`,
            courseId: 'foundation',
        }));
        expect(
            suggestionsFor(many, library, viewer).map((s) => s.query),
        ).toEqual(['Question 1', 'Question 2', 'Question 3']);
    });

    it('drops a suggestion naming a module the catalogue does not have', () => {
        expect(
            suggestionsFor(suggestions, library, admin).some(
                (s) => s.courseId === 'not-in-catalogue',
            ),
        ).toBe(false);
    });
});

describe('lockedLabel', () => {
    it('names the lowest role that can open the module', () => {
        expect(
            lockedLabel(entry({ id: 'org', scope: 'manage:Organization' })),
        ).toBe('admin and above');
    });

    it('is null when every system role holds it, so there is nothing to explain', () => {
        expect(
            lockedLabel(entry({ id: 'foundation', scope: 'view:Project' })),
        ).toBeNull();
        expect(lockedLabel(entry({ id: 'untagged', scope: null }))).toBeNull();
    });
});
