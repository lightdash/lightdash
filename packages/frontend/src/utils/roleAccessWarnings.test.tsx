import {
    getAllScopesForRole,
    ProjectMemberRole,
    type GroupWithMembers,
    type ProjectMemberRole as ProjectMemberRoleType,
    type RoleAssignment,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getAccessWarning, type UserGroupAccess } from './roleAccessWarnings';

const CUSTOM_ROLE_UUID = '4f9f8ffa-9fd7-401b-b0d1-031e3e9ee46b';
const GROUP_CUSTOM_ROLE_UUID = '8ac126dc-5f47-4d51-a1bc-884a1efd11f4';

const NARROW_CUSTOM_SCOPES = [
    'view:Project',
    'view:Dashboard',
    'view:SavedChart',
    'view:Space',
];

const buildRoleScopes = (
    customScopes: Record<string, string[]> = {},
): Map<string, string[]> => {
    const map = new Map<string, string[]>();
    Object.values(ProjectMemberRole).forEach((role) => {
        map.set(role, getAllScopesForRole(role));
    });
    Object.entries(customScopes).forEach(([roleId, scopes]) => {
        map.set(roleId, scopes);
    });
    return map;
};

const buildGroupAccess = (
    roleId: string,
    roleName: string,
    groupName = 'Marketing',
): UserGroupAccess => ({
    group: { name: groupName, uuid: `group-${groupName}` } as GroupWithMembers,
    access: { roleId, roleName } as RoleAssignment,
    roleName,
});

describe('getAccessWarning', () => {
    describe('custom project role', () => {
        it('shows no warning for org role member with no groups', () => {
            expect(
                getAccessWarning({
                    organizationRole: 'member',
                    hasProjectRole: true,
                    projectRole: CUSTOM_ROLE_UUID as ProjectMemberRoleType,
                    userGroupAccesses: [],
                    roleScopesById: buildRoleScopes({
                        [CUSTOM_ROLE_UUID]: NARROW_CUSTOM_SCOPES,
                    }),
                }),
            ).toBeUndefined();
        });

        it('warns when the org role grants scopes beyond the custom role', () => {
            expect(
                getAccessWarning({
                    organizationRole: 'editor',
                    hasProjectRole: true,
                    projectRole: CUSTOM_ROLE_UUID as ProjectMemberRoleType,
                    userGroupAccesses: [],
                    roleScopesById: buildRoleScopes({
                        [CUSTOM_ROLE_UUID]: NARROW_CUSTOM_SCOPES,
                    }),
                }),
            ).toBeDefined();
        });

        it('shows no warning when the custom role covers everything the org role grants', () => {
            expect(
                getAccessWarning({
                    organizationRole: 'editor',
                    hasProjectRole: true,
                    projectRole: CUSTOM_ROLE_UUID as ProjectMemberRoleType,
                    userGroupAccesses: [],
                    roleScopesById: buildRoleScopes({
                        [CUSTOM_ROLE_UUID]: getAllScopesForRole(
                            ProjectMemberRole.EDITOR,
                        ),
                    }),
                }),
            ).toBeUndefined();
        });

        it('warns when a group system role grants scopes beyond the custom role', () => {
            expect(
                getAccessWarning({
                    organizationRole: 'member',
                    hasProjectRole: true,
                    projectRole: CUSTOM_ROLE_UUID as ProjectMemberRoleType,
                    userGroupAccesses: [buildGroupAccess('editor', 'Editor')],
                    roleScopesById: buildRoleScopes({
                        [CUSTOM_ROLE_UUID]: NARROW_CUSTOM_SCOPES,
                    }),
                }),
            ).toBeDefined();
        });

        it('shows the conservative warning when scope data is unavailable', () => {
            expect(
                getAccessWarning({
                    organizationRole: 'member',
                    hasProjectRole: true,
                    projectRole: CUSTOM_ROLE_UUID as ProjectMemberRoleType,
                    userGroupAccesses: [],
                }),
            ).toBeDefined();
        });
    });

    describe('custom group role', () => {
        it('shows no warning for org role member with no other access', () => {
            expect(
                getAccessWarning({
                    organizationRole: 'member',
                    hasProjectRole: false,
                    projectRole: null,
                    userGroupAccesses: [
                        buildGroupAccess(GROUP_CUSTOM_ROLE_UUID, 'Analysts'),
                    ],
                    roleScopesById: buildRoleScopes({
                        [GROUP_CUSTOM_ROLE_UUID]: NARROW_CUSTOM_SCOPES,
                    }),
                }),
            ).toBeUndefined();
        });

        it('warns when the project role grants scopes beyond the group custom role', () => {
            expect(
                getAccessWarning({
                    organizationRole: 'member',
                    hasProjectRole: true,
                    projectRole: ProjectMemberRole.EDITOR,
                    userGroupAccesses: [
                        buildGroupAccess(GROUP_CUSTOM_ROLE_UUID, 'Analysts'),
                    ],
                    roleScopesById: buildRoleScopes({
                        [GROUP_CUSTOM_ROLE_UUID]: NARROW_CUSTOM_SCOPES,
                    }),
                }),
            ).toBeDefined();
        });

        it('shows the conservative warning when scope data is unavailable', () => {
            expect(
                getAccessWarning({
                    organizationRole: 'member',
                    hasProjectRole: false,
                    projectRole: null,
                    userGroupAccesses: [
                        buildGroupAccess(GROUP_CUSTOM_ROLE_UUID, 'Analysts'),
                    ],
                }),
            ).toBeDefined();
        });
    });

    describe('system project role', () => {
        it('warns when the org role ranks higher than the project role', () => {
            expect(
                getAccessWarning({
                    organizationRole: 'admin',
                    hasProjectRole: true,
                    projectRole: ProjectMemberRole.VIEWER,
                    userGroupAccesses: [],
                    roleScopesById: buildRoleScopes(),
                }),
            ).toBeDefined();
        });

        it('shows no warning when the org role ranks lower than the project role', () => {
            expect(
                getAccessWarning({
                    organizationRole: 'member',
                    hasProjectRole: true,
                    projectRole: ProjectMemberRole.EDITOR,
                    userGroupAccesses: [],
                    roleScopesById: buildRoleScopes(),
                }),
            ).toBeUndefined();
        });

        it('warns when a group role ranks higher than the project role', () => {
            expect(
                getAccessWarning({
                    organizationRole: 'member',
                    hasProjectRole: true,
                    projectRole: ProjectMemberRole.VIEWER,
                    userGroupAccesses: [buildGroupAccess('editor', 'Editor')],
                    roleScopesById: buildRoleScopes(),
                }),
            ).toBeDefined();
        });
    });
});
