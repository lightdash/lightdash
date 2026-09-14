import { describe, expect, it } from 'vitest';
import { getProjectUrlIdentifier } from './projectUrl';

describe('project URL identifiers', () => {
    it('preserves slugs for normal projects', () => {
        expect(
            getProjectUrlIdentifier({
                projectUuid: 'uuid',
                slug: 'my-project',
            }),
        ).toBe('my-project');
    });
    it('falls back to UUID when a project has no slug', () => {
        expect(
            getProjectUrlIdentifier({
                projectUuid: 'uuid',
                slug: undefined,
            }),
        ).toBe('uuid');
    });
});
