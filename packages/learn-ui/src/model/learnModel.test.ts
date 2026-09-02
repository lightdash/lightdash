import { describe, expect, it } from 'vitest';
import { createLearnModel } from './learnModel';
import { commonScopeSource, entry } from './testFixtures';

describe('createLearnModel', () => {
    const model = createLearnModel(commonScopeSource);
    it('binds board, ask and visibility to one registry', () => {
        const dashboards = entry({ id: 'd', scope: 'manage:Dashboard' });
        const viewer = model.roleScopes('viewer');
        expect(model.isUnlocked(dashboards, viewer)).toBe(false);
        expect(model.lockedLabel(dashboards)).toBe(
            'interactive viewer and above',
        );
        expect(model.lessonVisible('manage:Dashboard', viewer)).toBe(false);
        expect(model.lessonVisible('manage:NotAThing', viewer)).toBe(true);
    });
});
