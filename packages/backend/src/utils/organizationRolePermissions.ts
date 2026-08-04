import {
    ForbiddenError,
    getOrganizationMemberRolePermissions,
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
    if (
        !user.role ||
        (user.organizationUuid && user.organizationUuid !== organizationUuid)
    ) {
        throw new ForbiddenError('You do not have permission');
    }

    if (!user.roleUuid) {
        return getOrganizationSystemRoleScopes(user.role, {
            includePersonalAccessToken: user.ability.can(
                'manage',
                'PersonalAccessToken',
            ),
        });
    }

    const role = await rolesModel.getRoleWithScopesByUuid(user.roleUuid);
    if (
        role.organizationUuid !== organizationUuid ||
        role.level !== 'organization'
    ) {
        throw new ForbiddenError('You do not have permission');
    }

    return role.scopes;
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
