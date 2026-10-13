import {
    OrganizationMemberRole,
    ProjectMemberRole,
    type Group,
    type GroupWithMembers,
    type OrganizationMemberProfile,
    type ProjectGroupAccess,
    type ProjectMemberProfile,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { collectCustomRoleHolders } from './useProjectUsersWithRoles';

const CUSTOM_ROLE_UUID = '6f1c3a1e-0000-4000-8000-000000000001';
const PROJECT_UUID = 'project-1';

const orgUser = (
    userUuid: string,
    overrides: Partial<OrganizationMemberProfile> = {},
): OrganizationMemberProfile =>
    ({
        userUuid,
        role: OrganizationMemberRole.MEMBER,
        roleUuid: undefined,
        ...overrides,
    }) as OrganizationMemberProfile;

const projectMember = (
    userUuid: string,
    overrides: Partial<ProjectMemberProfile> = {},
): ProjectMemberProfile =>
    ({
        userUuid,
        projectUuid: PROJECT_UUID,
        role: ProjectMemberRole.VIEWER,
        roleUuid: undefined,
        ...overrides,
    }) as ProjectMemberProfile;

const groupWithMembers = (
    uuid: string,
    memberUuids: string[],
): GroupWithMembers =>
    ({
        uuid,
        name: uuid,
        memberUuids,
        members: [],
    }) as unknown as GroupWithMembers;

const groupAccess = (
    groupUuid: string,
    role: ProjectGroupAccess['role'],
): ProjectGroupAccess => ({
    projectUuid: PROJECT_UUID,
    groupUuid,
    role,
});

describe('collectCustomRoleHolders', () => {
    it('returns nobody when every role is a system role', () => {
        const holders = collectCustomRoleHolders({
            organizationUsers: [
                orgUser('admin', { role: OrganizationMemberRole.ADMIN }),
                orgUser('member'),
            ],
            projectAccess: [
                projectMember('member', { role: ProjectMemberRole.EDITOR }),
            ],
            projectGroupAccess: [
                groupAccess('g1', ProjectMemberRole.INTERACTIVE_VIEWER),
            ],
            groups: [groupWithMembers('g1', ['member'])],
        });

        expect(holders.size).toBe(0);
    });

    it('includes users whose organization membership carries a custom role', () => {
        const holders = collectCustomRoleHolders({
            organizationUsers: [
                orgUser('custom', { roleUuid: CUSTOM_ROLE_UUID }),
                orgUser('extra', { hasMultipleRoles: true }),
                orgUser('plain'),
            ],
            projectAccess: [],
            projectGroupAccess: [],
            groups: [],
        });

        expect([...holders].sort()).toEqual(['custom', 'extra']);
    });

    it('includes users whose direct project membership carries a custom role', () => {
        const holders = collectCustomRoleHolders({
            organizationUsers: [orgUser('direct'), orgUser('plain')],
            projectAccess: [
                projectMember('direct', { roleUuid: CUSTOM_ROLE_UUID }),
                projectMember('plain'),
            ],
            projectGroupAccess: [],
            groups: [],
        });

        expect([...holders]).toEqual(['direct']);
    });

    it('includes members of a group that holds a custom project role', () => {
        const holders = collectCustomRoleHolders({
            organizationUsers: [
                orgUser('in-custom-group'),
                orgUser('in-system-group'),
                orgUser('in-no-group'),
            ],
            projectAccess: [],
            projectGroupAccess: [
                groupAccess('custom-group', CUSTOM_ROLE_UUID),
                groupAccess('system-group', ProjectMemberRole.EDITOR),
            ],
            groups: [
                groupWithMembers('custom-group', ['in-custom-group']),
                groupWithMembers('system-group', ['in-system-group']),
            ],
        });

        expect([...holders]).toEqual(['in-custom-group']);
    });

    it('ignores groups whose members were not loaded', () => {
        const groupWithoutMembers = {
            uuid: 'custom-group',
            name: 'custom-group',
        } as Group;

        const holders = collectCustomRoleHolders({
            organizationUsers: [orgUser('someone')],
            projectAccess: [],
            projectGroupAccess: [groupAccess('custom-group', CUSTOM_ROLE_UUID)],
            groups: [groupWithoutMembers],
        });

        expect(holders.size).toBe(0);
    });
});
