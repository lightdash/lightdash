import {
    convertOrganizationRoleToProjectRole,
    convertProjectRoleToSpaceRole,
    getHighestProjectRole,
    type GroupRole,
    OrganizationMemberRole,
    type OrganizationRole,
    ProjectMemberRole,
    type ProjectRole,
    type Space,
    SpaceMemberRole,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';

/**
 * What this hook does:
 * Gets inherited user access, by Org or Project role (ADMINs)
 *
 * Gets Group access
 *
 * Gets direct user access
 *  - Users that have been given access to the space
 *  - Users that have been given access from a group
 *
 * Returns a list of users with their access level
 */
export const useSpaceShareList = (
    space: Space,
): { access: Space['access']; groupsAccess: Space['groupsAccess'] } => {
    // Get users that have been given direct access
    const usersWithDirectAccess = useMemo(
        () => space.testing?.userAccess.map((user) => user.user_uuid),
        [space.testing],
    );
    // Get users that have been given access from a group
    const usersWithDirectAccessFromGroup = useMemo(
        () => space.testing?.groupAccess.map((group) => group.group_members),
        [space.testing],
    );

    const filterUsersWithDirectAccess = useCallback(
        (user: { userUuid: string }) => {
            return !usersWithDirectAccess?.includes(user.userUuid);
        },
        [usersWithDirectAccess],
    );

    const filterUsersWithDirectAccessFromGroup = useCallback(
        (user: { userUuid: string }) => {
            return !usersWithDirectAccessFromGroup?.some((group) =>
                group.some((u) => u.user_uuid === user.userUuid),
            );
        },
        [usersWithDirectAccessFromGroup],
    );

    // ⚡️ INHERITED ACCESS
    // For a Private space, this includes
    // - Project Admin
    // - Organization Admin
    // For a Public space, this includes
    // All

    // if inherited from project
    const inheritedFromProject = useMemo(() => {
        if (space.isPrivate) {
            return space.testing?.inheritedAccess.filter(
                (a) =>
                    a.project_role === ProjectMemberRole.ADMIN ||
                    a.project_group_roles?.includes(ProjectMemberRole.ADMIN),
            );
        }
        return space.testing?.inheritedAccess.filter(
            (a) => !!a.project_role || !!a.project_group_roles,
        );
    }, [space.testing, space.isPrivate]);

    // If inherited from organization
    const inheritedFromOrganization = useMemo(() => {
        if (space.isPrivate) {
            return space.testing?.inheritedAccess.filter(
                (a) =>
                    a.organization_role === OrganizationMemberRole.ADMIN &&
                    a.project_role === null,
            );
        }
        return space.testing?.inheritedAccess.filter(
            (a) =>
                a.organization_role === OrganizationMemberRole.ADMIN &&
                a.project_role === null,
        );
    }, [space.testing, space.isPrivate]);

    // This also filters out users that have been given direct access
    const convertedInheritedAccess: Space['access'] = useMemo(() => {
        return [
            ...(inheritedFromProject || [])
                .map((user) => {
                    const inheritedGroupRoles: GroupRole[] =
                        user.project_group_roles?.map((role) => ({
                            type: 'group',
                            role: role ?? undefined,
                        })) ?? [];
                    // Convert organization role to project role
                    const inheritedOrgRole: OrganizationRole = {
                        type: 'organization',
                        role: convertOrganizationRoleToProjectRole(
                            user.organization_role,
                        ),
                    };

                    // Convert project role
                    const inheritedProjectRole: ProjectRole = {
                        type: 'project',
                        role: user.project_role ?? undefined,
                    };

                    const highestRole = getHighestProjectRole([
                        inheritedOrgRole,
                        inheritedProjectRole,
                        ...inheritedGroupRoles,
                    ]);

                    const spaceRole = !space.isPrivate
                        ? highestRole?.role
                            ? convertProjectRoleToSpaceRole(highestRole.role)
                            : SpaceMemberRole.VIEWER
                        : SpaceMemberRole.ADMIN;

                    const inheritedRole = highestRole?.role;
                    const inheritedFrom = highestRole?.type;

                    return {
                        userUuid: user.user_uuid,
                        firstName: user.first_name,
                        lastName: user.last_name,
                        email: user.email,
                        role: spaceRole,
                        hasDirectAccess: false,
                        inheritedRole,
                        inheritedFrom,
                        projectRole: user.project_role,
                    };
                })
                // 🙋 Should we filter out users that have been given direct access here?
                .filter(filterUsersWithDirectAccess)
                .filter(filterUsersWithDirectAccessFromGroup),
            ...(inheritedFromOrganization || [])
                .map((user) => {
                    const inheritedGroupRoles: GroupRole[] =
                        user.project_group_roles?.map((role) => ({
                            type: 'group',
                            role: role ?? undefined,
                        })) ?? [];
                    // Convert organization role to project role
                    const inheritedOrgRole: OrganizationRole = {
                        type: 'organization',
                        role: convertOrganizationRoleToProjectRole(
                            user.organization_role,
                        ),
                    };

                    // Convert project role
                    const inheritedProjectRole: ProjectRole = {
                        type: 'project',
                        role: user.project_role ?? undefined,
                    };

                    const highestRole = getHighestProjectRole([
                        inheritedOrgRole,
                        inheritedProjectRole,
                        ...inheritedGroupRoles,
                    ]);

                    const spaceRole = !space.isPrivate
                        ? highestRole?.role
                            ? convertProjectRoleToSpaceRole(highestRole.role)
                            : SpaceMemberRole.VIEWER
                        : SpaceMemberRole.ADMIN;

                    const inheritedRole = highestRole?.role;
                    const inheritedFrom = highestRole?.type;
                    return {
                        userUuid: user.user_uuid,
                        firstName: user.first_name,
                        lastName: user.last_name,
                        email: user.email,
                        role: spaceRole,
                        hasDirectAccess: false,
                        inheritedRole,
                        inheritedFrom,
                        projectRole: undefined,
                    };
                })
                // 🙋 Should we filter out users that have been given direct access here?
                .filter(filterUsersWithDirectAccess)
                .filter(filterUsersWithDirectAccessFromGroup),
        ];
    }, [
        inheritedFromProject,
        inheritedFromOrganization,
        space.isPrivate,
        filterUsersWithDirectAccess,
        filterUsersWithDirectAccessFromGroup,
    ]);

    // ⚡️ GROUP ACCESS
    // This includes
    // - Groups that have been given access to the space
    const groupsWithAccess = space.testing?.groupAccess;

    const convertedGroupAccess: Space['groupsAccess'] = useMemo(
        () =>
            groupsWithAccess?.map((group) => ({
                groupUuid: group.group_uuid,
                spaceRole: group.space_role,
                groupName: group.group_name,
            })) || [],
        [groupsWithAccess],
    );

    // ⚡️ USER ACCESS
    // This includes
    // - Users that have been given access to the space
    // - Users that have been given access from a group
    const usersWithAccess = space.testing?.userAccess;

    const userDirectAccessConverted: Space['access'] = useMemo(
        () =>
            usersWithAccess?.map((user) => {
                return {
                    userUuid: user.user_uuid,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    email: user.email,
                    role: user.space_role,
                    hasDirectAccess: true,
                    // 🙋 Should we add inheritedRole and inheritedFrom somehow on the BE?
                    inheritedRole: undefined,
                    inheritedFrom: undefined,
                    projectRole: undefined,
                };
            }) || [],
        [usersWithAccess],
    );

    const usersInGroupAccessConverted: Space['access'] = useMemo(
        () =>
            space.testing?.groupAccess
                .flatMap((group) => group.group_members)
                .map((user) => {
                    const group = space.testing?.groupAccess.find((g) =>
                        g.group_members.includes(user),
                    );

                    // 🙋 Should we check the highest role for a user here?
                    const isAdminInProject = inheritedFromProject?.some(
                        (admin) => admin.user_uuid === user.user_uuid,
                    );
                    const isAdminInOrganization =
                        inheritedFromOrganization?.some(
                            (admin) => admin.user_uuid === user.user_uuid,
                        );

                    const isAdmin = isAdminInProject || isAdminInOrganization;

                    // 🙋 This logic can be confusing, can we make it more obvious or apply it on the BE?
                    const spaceRole = isAdmin
                        ? SpaceMemberRole.ADMIN
                        : group?.space_role;
                    const inheritedRole = isAdmin
                        ? isAdminInProject
                            ? ProjectMemberRole.ADMIN
                            : OrganizationMemberRole.ADMIN
                        : undefined;
                    const inheritedFrom = isAdmin
                        ? isAdminInProject
                            ? 'project'
                            : 'organization'
                        : 'group';

                    return {
                        userUuid: user.user_uuid,
                        firstName: user.first_name,
                        lastName: user.last_name,
                        email: user.email,
                        role: spaceRole || SpaceMemberRole.VIEWER, // TODO: Should we default to viewer?
                        hasDirectAccess: true,
                        inheritedRole,
                        inheritedFrom,
                        projectRole: undefined,
                    };
                }) || [],
        [
            inheritedFromProject,
            inheritedFromOrganization,
            space.testing?.groupAccess,
        ],
    );

    console.log('convertedInheritedAccess', convertedInheritedAccess);
    console.log('userDirectAccessConverted', userDirectAccessConverted);
    console.log('usersInGroupAccessConverted', usersInGroupAccessConverted);
    // Convert userAccess and inheritedAccess to the access structure
    const access: Space['access'] = useMemo(
        () => [
            ...convertedInheritedAccess,
            ...userDirectAccessConverted,
            ...usersInGroupAccessConverted,
        ],
        [
            convertedInheritedAccess,
            userDirectAccessConverted,
            usersInGroupAccessConverted,
        ],
    );

    if (!space.testing) return { access: [], groupsAccess: [] };
    return { access, groupsAccess: convertedGroupAccess };
};
