import { getTrainingProjectScopes } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import type * as TourFor from '../scopeTours/tourFor';
import {
    buildLearnCatalogue,
    DEVELOPER,
    DOCS_LESSON_SCOPE,
    gateFor,
    sortForLearner,
} from './catalogue';

// Two lessons, the second running the download the first teaches. The
// helpers are the module's own three one-liners over that list.
vi.mock('./codeLessons', () => {
    const scopes = ['view:ContentAsCode', 'create:ContentAsCode'];
    return {
        CONTENT_AS_CODE_LESSONS: scopes.map((scope) => ({ scope })),
        codeLessonIndex: (scope: string) => scopes.indexOf(scope),
        hasCodeLesson: (scope: string) => scopes.includes(scope),
        sitsWithCodeLessons: (scope: string) =>
            scope.split(':')[1]?.split('@')[0] === 'ContentAsCode',
    };
});
// The lessons have no generated tour in this slice: stand in for them.
vi.mock('../scopeTours/tourFor', async (importOriginal) => {
    const actual = await importOriginal<typeof TourFor>();
    return {
        ...actual,
        tourFor: (scope: string) =>
            scope === 'view:ContentAsCode' || scope === 'create:ContentAsCode'
                ? {
                      scope,
                      title: scope,
                      sources: [],
                      steps: [{ body: 'A lesson.' }],
                  }
                : actual.tourFor(scope),
    };
});

describe('content-as-code modules', () => {
    const modules = buildLearnCatalogue();
    const find = (scope: string) =>
        modules.find((module) => module.scope === scope)!;

    it('gates every content-as-code scope on the licence and the sandbox together', () => {
        [
            'view:ContentAsCode',
            'create:ContentAsCode',
            'manage:ContentAsCode',
        ].forEach((name) =>
            expect(gateFor({ name, isEnterprise: true })).toBe('contentAsCode'),
        );
    });

    it('lists a scope with a code lesson in the Developer group, as a scope module', () => {
        expect(find('view:ContentAsCode')).toMatchObject({
            kind: 'scope',
            group: DEVELOPER,
            gate: 'contentAsCode',
            available: true,
        });
    });

    it('keeps a module of the same subject still to come with its lessons', () => {
        expect(find('manage:ContentAsCode')).toMatchObject({
            group: DEVELOPER,
            gate: 'contentAsCode',
            available: false,
        });
    });

    it('puts the lessons after the semantic-layer ones, in the order they are declared', () => {
        // A learner who holds every lesson on the shelf: what they hold
        // sorts first, so only the teaching order is left to decide.
        const shelf = sortForLearner(
            new Set([...getTrainingProjectScopes(), DOCS_LESSON_SCOPE]),
            modules.filter((module) => module.group === DEVELOPER),
        ).map((module) => module.scope);
        expect(shelf).toEqual([
            'docs:semantic-layer/metrics',
            'docs:semantic-layer/dimensions',
            'view:ContentAsCode',
            'create:ContentAsCode',
            'manage:ContentAsCode',
        ]);
    });
});
