import { Ability, AbilityBuilder } from '@casl/ability';
import {
    OrganizationMemberRole,
    type MemberAbility,
    type SessionUser,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { RolesModel } from '../models/RolesModel';
import {
    getOrganizationSystemRoleScopes,
    validateOrganizationScopesCanBeGranted,
} from './organizationRolePermissions';

const ORG = 'org-1';
const CUSTOM_ROLE = 'custom-org-manager';

// `pat.allowedOrgRoles` defaults to every organization role, so on a default
// instance the ability builder hands this to custom-role members too. It is
// never listed in `scoped_roles`, which is exactly why it needs its own case.
const customRoleCaller = ({
    canManagePersonalAccessToken,
}: {
    canManagePersonalAccessToken: boolean;
}): SessionUser => {
    const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
    can('manage', 'Organization', { organizationUuid: ORG });
    if (canManagePersonalAccessToken) {
        can('manage', 'PersonalAccessToken');
    }

    return {
        userUuid: 'caller',
        organizationUuid: ORG,
        role: OrganizationMemberRole.MEMBER,
        roleUuid: CUSTOM_ROLE,
        ability: build(),
    } as never;
};

const rolesModelWithScopes = (
    scopes: string[],
    extraRoleUuids: string[] = [],
) =>
    ({
        getRoleWithScopesByUuid: vi.fn().mockResolvedValue({
            roleUuid: CUSTOM_ROLE,
            organizationUuid: ORG,
            level: 'organization',
            scopes,
        }),
        // Callers may hold extra custom roles on top of their session slot
        getOrganizationUserRoleSet: vi.fn().mockResolvedValue({
            systemRole: null,
            customRoleUuids: extraRoleUuids,
        }),
    }) as unknown as RolesModel;

describe('validateOrganizationScopesCanBeGranted', () => {
    const managerScopes = [
        'manage:Organization',
        'manage:OrganizationMemberProfile',
        ...getOrganizationSystemRoleScopes(OrganizationMemberRole.MEMBER),
    ];

    it('lets a custom-role caller grant a system role while personal access tokens are enabled', async () => {
        await expect(
            validateOrganizationScopesCanBeGranted({
                user: customRoleCaller({
                    canManagePersonalAccessToken: true,
                }),
                organizationUuid: ORG,
                grantedScopes: getOrganizationSystemRoleScopes(
                    OrganizationMemberRole.MEMBER,
                    { includePersonalAccessToken: true },
                ),
                rolesModel: rolesModelWithScopes(managerScopes),
            }),
        ).resolves.toBeUndefined();
    });

    it('still rejects a system role the custom-role caller does not cover', async () => {
        await expect(
            validateOrganizationScopesCanBeGranted({
                user: customRoleCaller({
                    canManagePersonalAccessToken: true,
                }),
                organizationUuid: ORG,
                grantedScopes: getOrganizationSystemRoleScopes(
                    OrganizationMemberRole.ADMIN,
                    { includePersonalAccessToken: true },
                ),
                rolesModel: rolesModelWithScopes(managerScopes),
            }),
        ).rejects.toThrow('Cannot grant permissions exceeding your own');
    });

    it('rejects a caller that carries no organization', async () => {
        const orgless = customRoleCaller({
            canManagePersonalAccessToken: true,
        });
        delete (orgless as { organizationUuid?: string }).organizationUuid;

        await expect(
            validateOrganizationScopesCanBeGranted({
                user: orgless,
                organizationUuid: ORG,
                grantedScopes: getOrganizationSystemRoleScopes(
                    OrganizationMemberRole.MEMBER,
                ),
                rolesModel: rolesModelWithScopes(managerScopes),
            }),
        ).rejects.toThrow('You do not have permission');
    });

    it('rejects a caller belonging to a different organization', async () => {
        await expect(
            validateOrganizationScopesCanBeGranted({
                user: {
                    ...customRoleCaller({ canManagePersonalAccessToken: true }),
                    organizationUuid: 'some-other-org',
                } as never,
                organizationUuid: ORG,
                grantedScopes: getOrganizationSystemRoleScopes(
                    OrganizationMemberRole.MEMBER,
                ),
                rolesModel: rolesModelWithScopes(managerScopes),
            }),
        ).rejects.toThrow('You do not have permission');
    });

    it('does not lend the caller a token permission it was never granted', async () => {
        await expect(
            validateOrganizationScopesCanBeGranted({
                user: customRoleCaller({
                    canManagePersonalAccessToken: false,
                }),
                organizationUuid: ORG,
                grantedScopes: ['manage:PersonalAccessToken'],
                rolesModel: rolesModelWithScopes(managerScopes),
            }),
        ).rejects.toThrow('Cannot grant permissions exceeding your own');
    });
});
