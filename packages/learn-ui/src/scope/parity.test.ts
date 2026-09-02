import {
    OrganizationMemberRole as CommonOrgRole,
    ProjectMemberRole as CommonProjectRole,
    ScopeGroup as CommonScopeGroup,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { OrganizationMemberRole, ProjectMemberRole, ScopeGroup } from './types';

// The package owns these as const objects so LU's browser bundle never carries
// @lightdash/common. This test is the drift gate against common's enums.
describe('scope const parity with @lightdash/common', () => {
    it('ScopeGroup values match', () => {
        expect(Object.values(ScopeGroup).sort()).toEqual(
            Object.values(CommonScopeGroup).sort(),
        );
    });
    it('ProjectMemberRole values match', () => {
        expect(Object.values(ProjectMemberRole).sort()).toEqual(
            Object.values(CommonProjectRole).sort(),
        );
    });
    it('OrganizationMemberRole values match', () => {
        expect(Object.values(OrganizationMemberRole).sort()).toEqual(
            Object.values(CommonOrgRole).sort(),
        );
    });
});
