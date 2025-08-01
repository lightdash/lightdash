import {
    FeatureFlags,
    ProjectMemberRole,
    convertOrganizationRoleToProjectRole,
    convertProjectRoleToOrganizationRole,
    getHighestProjectRole,
    isGroupWithMembers,
    type InheritedRoles,
    type OrganizationMemberProfile,
    type OrganizationMemberRole,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useProjectGroupAccessList } from '../features/projectGroupAccess/hooks/useProjectGroupAccess';
import { useFeatureFlag } from './useFeatureFlagEnabled';
import { useOrganizationGroups } from './useOrganizationGroups';
import { useOrganizationUsers } from './useOrganizationUsers';
import { useProjectAccess } from './useProjectAccess';

export type ProjectUserWithRole = Omit<OrganizationMemberProfile, 'role'> & {
    inheritedRole: InheritedRoles | undefined;
    finalRole: OrganizationMemberRole;
    projectUuid: string;
    role: ProjectMemberRole;
};

export const useProjectUsersWithRoles = (projectUuid: string) => {
    const userGroupsFeatureFlagQuery = useFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    const {
        data: organizationUsers,
        isInitialLoading: isOrganizationUsersLoading,
    } = useOrganizationUsers();

    const { data: groups } = useOrganizationGroups(
        { includeMembers: 5 },
        {
            enabled:
                userGroupsFeatureFlagQuery.isSuccess &&
                userGroupsFeatureFlagQuery.data.enabled,
        },
    );

    const { data: projectAccess, isInitialLoading: isProjectAccessLoading } =
        useProjectAccess(projectUuid);

    const { data: projectGroupAccess } = useProjectGroupAccessList(projectUuid);

    const orgRoles = useMemo(() => {
        if (!organizationUsers || !projectAccess) return undefined;

        return organizationUsers.reduce<Record<string, OrganizationMemberRole>>(
            (acc, orgUser) => {
                return {
                    ...acc,
                    [orgUser.userUuid]: orgUser.role,
                };
            },
            {},
        );
    }, [organizationUsers, projectAccess]);

    const groupRoles = useMemo(() => {
        if (!organizationUsers) return {};
        if (!projectGroupAccess) return {};
        if (!groups) return {};

        return organizationUsers.reduce<Record<string, ProjectMemberRole>>(
            (aggregatedRoles, orgUser) => {
                const userGroupRoles = projectGroupAccess.reduce<
                    ProjectMemberRole[]
                >((userRoles, groupAccess) => {
                    const group = groups.find(
                        (g) => g.uuid === groupAccess.groupUuid,
                    );
                    if (!group || !isGroupWithMembers(group)) return userRoles;
                    if (!group.memberUuids.includes(orgUser.userUuid))
                        return userRoles;

                    return [...userRoles, groupAccess.role];
                }, []);

                const highestRole = getHighestProjectRole(
                    userGroupRoles.map((role) => ({
                        type: 'group',
                        role,
                    })),
                );

                if (!highestRole) return aggregatedRoles;

                return {
                    ...aggregatedRoles,
                    [orgUser.userUuid]: highestRole.role,
                };
            },
            {},
        );
    }, [organizationUsers, projectGroupAccess, groups]);

    const projectRoles = useMemo(() => {
        if (!projectAccess) return {};

        return projectAccess.reduce<Record<string, ProjectMemberRole>>(
            (acc, projectMember) => {
                return {
                    ...acc,
                    [projectMember.userUuid]: projectMember.role,
                };
            },
            {},
        );
    }, [projectAccess]);

    const inheritedRoles = useMemo(() => {
        // Organization users and org roles are not always available, and we don't want to show the user access page if they are not available
        if (!organizationUsers || !orgRoles) return undefined;
        return organizationUsers.reduce<Record<string, InheritedRoles>>(
            (acc, orgUser) => {
                return {
                    ...acc,
                    [orgUser.userUuid]: [
                        {
                            type: 'organization',
                            role: convertOrganizationRoleToProjectRole(
                                orgRoles[orgUser.userUuid],
                            ),
                        },
                        {
                            type: 'group',
                            role: groupRoles[orgUser.userUuid],
                        },
                        {
                            type: 'project',
                            role: projectRoles[orgUser.userUuid],
                        },
                    ],
                };
            },
            {},
        );
    }, [organizationUsers, orgRoles, groupRoles, projectRoles]);

    const usersWithProjectRole: ProjectUserWithRole[] = useMemo(() => {
        if (!organizationUsers || !inheritedRoles) return [];

        return organizationUsers.map((orgUser) => {
            const highestRole = getHighestProjectRole(
                inheritedRoles[orgUser.userUuid],
            );
            const hasProjectRole = !!projectRoles[orgUser.userUuid];
            const inheritedRole = highestRole?.role
                ? convertProjectRoleToOrganizationRole(highestRole.role)
                : orgUser.role;
            return {
                ...orgUser,
                role:
                    projectRoles[orgUser.userUuid] || ProjectMemberRole.VIEWER,
                finalRole: hasProjectRole
                    ? convertProjectRoleToOrganizationRole(
                          projectRoles[orgUser.userUuid] ||
                              ProjectMemberRole.VIEWER,
                      )
                    : inheritedRole,
                inheritedRole: inheritedRoles?.[orgUser.userUuid],
                projectUuid,
            };
        });
    }, [organizationUsers, projectRoles, inheritedRoles, projectUuid]);

    const usersDictionary = useMemo(() => {
        if (!usersWithProjectRole) return {};

        return usersWithProjectRole.reduce<Record<string, ProjectUserWithRole>>(
            (acc, user) => ({
                ...acc,
                [user.userUuid]: user,
            }),
            {},
        );
    }, [usersWithProjectRole]);

    return {
        usersWithProjectRole,
        usersDictionary,
        isLoading: isProjectAccessLoading || isOrganizationUsersLoading,
        inheritedRoles,
    };
};
