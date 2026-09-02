import { getAllScopesForRole, ProjectMemberRole } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { commonScopeSource } from './scopeSource';

describe('commonScopeSource', () => {
    it('exposes the enterprise scope map with group and description', () => {
        const map = commonScopeSource.getAllScopeMap({ isEnterprise: true });
        expect(map['manage:Dashboard']).toMatchObject({
            name: 'manage:Dashboard',
            group: 'content',
        });
        expect(typeof map['manage:Dashboard'].description).toBe('string');
    });
    it('delegates role scope sets to common', () => {
        expect(commonScopeSource.getAllScopesForRole('viewer')).toEqual(
            getAllScopesForRole(ProjectMemberRole.VIEWER),
        );
    });
});
