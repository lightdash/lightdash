import {
    ForbiddenError,
    getOrganizationMemberRolePermissions,
    getPermissionsFromAbilityRules,
    getUncoveredPermissions,
    OrganizationMemberRole,
    type SessionUser,
} from '@lightdash/common';
import { RolesModel } from '../models/RolesModel';

export const getOrganizationSystemRoleScopes = (
    role: OrganizationMemberRole,
    { includePersonalAccessToken = false } = {},
): string[] => {
    const permissions = getOrganizationMemberRolePermissions(role);
    return includePersonalAccessToken
        ? [...permissions, 'manage:PersonalAccessToken']
        : permissions;
};

const getCallerOrganizationScopes = async (
    user: SessionUser,
    organizationUuid: string,
    rolesModel: RolesModel,
): Promise<string[]> => {
    // A caller carrying no organization must not have its scopes resolved
    // against one, so compare directly rather than guarding on presence.
    if (!user.role || user.organizationUuid !== organizationUuid) {
        throw new ForbiddenError('You do not have permission');
    }

    // Custom roles never list this scope, but the ability builder still grants
    // it from the PAT config, so it is part of the caller's real footprint.
    const canManagePersonalAccessToken = user.ability.can(
        'manage',
        'PersonalAccessToken',
    );

    // The caller's runtime ability is the union of the slot (system role or
    // custom role from the session) and any extra custom roles they hold.
    const roleSet = await rolesModel.getOrganizationUserRoleSet(
        organizationUuid,
        user.userUuid,
    );
    const customRoleUuids = [
        ...new Set([
            ...(user.roleUuid ? [user.roleUuid] : []),
            ...roleSet.customRoleUuids,
        ]),
    ];
    const customRoles = await Promise.all(
        customRoleUuids.map((roleUuid) =>
            rolesModel.getRoleWithScopesByUuid(roleUuid),
        ),
    );
    if (
        customRoles.some((role) => role.organizationUuid !== organizationUuid)
    ) {
        throw new ForbiddenError('You do not have permission');
    }

    const scopes = [
        ...(user.roleUuid ? [] : getOrganizationSystemRoleScopes(user.role)),
        ...customRoles.flatMap((role) => role.scopes),
    ];
    return canManagePersonalAccessToken
        ? [...scopes, 'manage:PersonalAccessToken']
        : scopes;
};

export const validateOrganizationScopesCanBeGranted = async ({
    user,
    organizationUuid,
    grantedScopes,
    rolesModel,
}: {
    user: SessionUser;
    organizationUuid: string;
    grantedScopes: string[];
    rolesModel: RolesModel;
}): Promise<void> => {
    const callerScopes = await getCallerOrganizationScopes(
        user,
        organizationUuid,
        rolesModel,
    );
    const uncoveredScopes = getUncoveredPermissions(
        grantedScopes,
        callerScopes,
    );

    if (uncoveredScopes.length > 0) {
        throw new ForbiddenError('Cannot grant permissions exceeding your own');
    }
};

/**
 * Project-level delegation: every granted scope must be covered by a permission
 * the caller's own ability already holds. Callers reaching project role writes
 * already need `manage` on the project, so this is a floor against granting
 * scopes the caller does not have anywhere.
 */
export const validateProjectScopesCanBeGranted = ({
    user,
    grantedScopes,
}: {
    user: SessionUser;
    grantedScopes: string[];
}): void => {
    const callerScopes = getPermissionsFromAbilityRules(user.ability.rules);
    const uncoveredScopes = getUncoveredPermissions(
        grantedScopes,
        callerScopes,
    );
    if (uncoveredScopes.length > 0) {
        throw new ForbiddenError('Cannot grant permissions exceeding your own');
    }
};
