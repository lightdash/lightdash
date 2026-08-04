import {
    ForbiddenError,
    getAllScopesForRole,
    getOrganizationMemberRolePermissions,
    getUncoveredPermissions,
    getUncoveredProjectScopes,
    OrganizationMemberRole,
    type SessionUser,
} from '@lightdash/common';
import { RolesModel } from '../models/RolesModel';
import { UserModel } from '../models/UserModel';

export const getOrganizationSystemRoleScopes = (
    role: OrganizationMemberRole,
    { includePersonalAccessToken = false } = {},
): string[] => {
    const permissions = getOrganizationMemberRolePermissions(role);
    return includePersonalAccessToken
        ? [...permissions, 'manage:PersonalAccessToken']
        : permissions;
};

export const getCallerOrganizationScopes = async (
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
        { isEnterprise: true },
    );

    if (uncoveredScopes.length > 0) {
        throw new ForbiddenError('Cannot grant permissions exceeding your own');
    }
};

export const validateProjectScopesCanBeGranted = async ({
    user,
    organizationUuid,
    projectUuid,
    grantedScopes,
    rolesModel,
    userModel,
}: {
    user: SessionUser;
    organizationUuid: string;
    projectUuid: string;
    grantedScopes: string[];
    rolesModel: RolesModel;
    userModel: UserModel;
}): Promise<void> => {
    const organizationScopes = await getCallerOrganizationScopes(
        user,
        organizationUuid,
        rolesModel,
    );
    const [directProfiles, groupProfiles] = await Promise.all([
        userModel.getUserProjectRoles(user.userUuid),
        userModel.getUserGroupProjectRolesByOrganizationUuid(
            user.userUuid,
            organizationUuid,
        ),
    ]);
    const projectProfiles = [...directProfiles, ...groupProfiles].filter(
        (profile) => profile.projectUuid === projectUuid,
    );
    const customRoleUuids = [
        ...new Set(
            projectProfiles
                .map((profile) => profile.roleUuid)
                .filter((roleUuid): roleUuid is string => Boolean(roleUuid)),
        ),
    ];
    const customRoles = await Promise.all(
        customRoleUuids.map((roleUuid) =>
            rolesModel.getRoleWithScopesByUuid(roleUuid),
        ),
    );
    const customRoleScopes = new Map(
        customRoles.map((role) => [role.roleUuid, role.scopes]),
    );
    const projectScopes = projectProfiles.flatMap((profile) =>
        profile.roleUuid
            ? (customRoleScopes.get(profile.roleUuid) ?? [])
            : getAllScopesForRole(profile.role),
    );
    const uncoveredScopes = getUncoveredProjectScopes(
        grantedScopes,
        [...new Set([...organizationScopes, ...projectScopes])],
        { isEnterprise: true },
    );

    if (uncoveredScopes.length > 0) {
        throw new ForbiddenError('Cannot grant permissions exceeding your own');
    }
};
