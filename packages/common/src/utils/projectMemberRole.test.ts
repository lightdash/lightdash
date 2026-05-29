import { OrganizationMemberRole } from '../types/organizationMemberProfile';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { SpaceMemberRole } from '../types/space';
import {
    convertProjectRoleToOrganizationRole,
    convertProjectRoleToSpaceRole,
    getHighestSpaceRole,
    isProjectMemberRole,
} from './projectMemberRole';

// A custom role is persisted as a UUID and coalesced into the legacy `role`
// field, so the system-role helpers must tolerate it instead of throwing.
const CUSTOM_ROLE_UUID = 'ac5ac86a-b8a6-47fa-9679-40520dcb6136';
// Simulate the runtime value: a UUID arriving where a ProjectMemberRole is typed.
const customRoleAsProjectRole = CUSTOM_ROLE_UUID as ProjectMemberRole;

describe('projectMemberRole', () => {
    describe('getHighestSpaceRole', () => {
        it('should get the highest space role', () => {
            const highestRole = getHighestSpaceRole([
                SpaceMemberRole.ADMIN,
                SpaceMemberRole.EDITOR,
                SpaceMemberRole.VIEWER,
            ]);
            expect(highestRole).toBe(SpaceMemberRole.ADMIN);

            const highestRole2 = getHighestSpaceRole([
                SpaceMemberRole.EDITOR,
                SpaceMemberRole.VIEWER,
            ]);
            expect(highestRole2).toBe(SpaceMemberRole.EDITOR);

            const highestRole3 = getHighestSpaceRole([SpaceMemberRole.VIEWER]);
            expect(highestRole3).toBe(SpaceMemberRole.VIEWER);

            const highestRole4 = getHighestSpaceRole([
                SpaceMemberRole.VIEWER,
                undefined,
            ]);
            expect(highestRole4).toBe(SpaceMemberRole.VIEWER);

            const highestRole5 = getHighestSpaceRole([undefined, undefined]);
            expect(highestRole5).toBe(undefined);

            const highestRole6 = getHighestSpaceRole([
                undefined,
                SpaceMemberRole.VIEWER,
                SpaceMemberRole.EDITOR,
            ]);
            expect(highestRole6).toBe(SpaceMemberRole.EDITOR);
            // Test goes here
        });
    });

    describe('isProjectMemberRole', () => {
        it('returns true for system roles', () => {
            expect(isProjectMemberRole(ProjectMemberRole.VIEWER)).toBe(true);
            expect(isProjectMemberRole(ProjectMemberRole.ADMIN)).toBe(true);
        });

        it('returns false for a custom-role UUID', () => {
            expect(isProjectMemberRole(CUSTOM_ROLE_UUID)).toBe(false);
            expect(isProjectMemberRole('not-a-role')).toBe(false);
        });
    });

    // These converters are total over the 5 system roles and must fail fast on a
    // non-system role (custom-role UUID). Callers are responsible for guarding with
    // isProjectMemberRole before converting — see useProjectUsersWithRoles.
    describe('convertProjectRoleToOrganizationRole', () => {
        it('maps system roles', () => {
            expect(
                convertProjectRoleToOrganizationRole(ProjectMemberRole.EDITOR),
            ).toBe(OrganizationMemberRole.EDITOR);
        });

        it('throws on a custom-role UUID', () => {
            expect(() =>
                convertProjectRoleToOrganizationRole(customRoleAsProjectRole),
            ).toThrow();
        });
    });

    describe('convertProjectRoleToSpaceRole', () => {
        it('maps system roles', () => {
            expect(convertProjectRoleToSpaceRole(ProjectMemberRole.ADMIN)).toBe(
                SpaceMemberRole.ADMIN,
            );
        });

        it('throws on a custom-role UUID', () => {
            expect(() =>
                convertProjectRoleToSpaceRole(customRoleAsProjectRole),
            ).toThrow();
        });
    });
});
