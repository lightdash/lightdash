import { describe, expect, it, vi } from 'vitest';
import { buildLearnCatalogue, DEVELOPER, gateFor } from './catalogue';

vi.mock('./codeLessons', () => ({
    CONTENT_AS_CODE_LESSONS: [],
    hasCodeLesson: (scope: string) => scope === 'view:ContentAsCode',
}));

describe('content-as-code modules', () => {
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
        const modules = buildLearnCatalogue();
        expect(
            modules.find((module) => module.scope === 'view:ContentAsCode'),
        ).toMatchObject({
            kind: 'scope',
            group: DEVELOPER,
            gate: 'contentAsCode',
        });
        expect(
            modules.find((module) => module.scope === 'manage:ContentAsCode')
                ?.group,
        ).not.toBe(DEVELOPER);
    });
});
