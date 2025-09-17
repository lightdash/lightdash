import {
    FeatureFlags,
    ProjectMemberRole,
    convertOrganizationRoleToProjectRole,
    convertProjectRoleToOrganizationRole,
    getHighestProjectRole,
    isGroupWithMembers,
    type InheritedRoles,
    type KnexPaginateArgs,
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

export const useProjectUsersWithRoles = (
    projectUuid: string,
    params?: {
        searchInput?: string;
        enabled?: boolean;
        paginateArgs?: KnexPaginateArgs;
    },
) => {
    const userGroupsFeatureFlagQuery = useFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    const organizationUsersQuery = useOrganizationUsers({
        searchInput: params?.searchInput,
        projectUuid,
        enabled: params?.enabled,
        paginateArgs: params?.paginateArgs,
    });

    const groupsQuery = useOrganizationGroups(
        { includeMembers: 5 },
        {
            enabled:
                userGroupsFeatureFlagQuery.isSuccess &&
                userGroupsFeatureFlagQuery.data.enabled,
        },
    );

    const projectAccessQuery = useProjectAccess(projectUuid);

    const projectGroupAccessQuery = useProjectGroupAccessList(projectUuid);

    const orgRoles = useMemo(() => {
        if (!organizationUsersQuery.isSuccess || !projectAccessQuery.isSuccess)
            return undefined;

        return organizationUsersQuery.data.reduce<
            Record<string, OrganizationMemberRole>
        >((acc, orgUser) => {
            return {
                ...acc,
                [orgUser.userUuid]: orgUser.role,
            };
        }, {});
    }, [organizationUsersQuery, projectAccessQuery]);

    const groupRoles = useMemo(() => {
        if (
            !organizationUsersQuery.isSuccess ||
            !projectGroupAccessQuery.isSuccess ||
            !groupsQuery.isSuccess
        )
            return {};

        return organizationUsersQuery.data.reduce<
            Record<string, ProjectMemberRole>
        >((aggregatedRoles, orgUser) => {
            const userGroupRoles = projectGroupAccessQuery.data.reduce<
                string[]
            >((userRoles, groupAccess) => {
                const group = groupsQuery.data.find(
                    (g) => g.uuid === groupAccess.groupUuid,
                );
                if (!group || !isGroupWithMembers(group)) return userRoles;
                if (!group.memberUuids.includes(orgUser.userUuid))
                    return userRoles;

                return [...userRoles, groupAccess.role];
            }, []);

            const highestRole = getHighestProjectRole(
                userGroupRoles.map((roleString) => ({
                    type: 'group',
                    role: roleString as ProjectMemberRole, // Cast string role to ProjectMemberRole for compatibility
                })),
            );

            if (!highestRole) return aggregatedRoles;

            return {
                ...aggregatedRoles,
                [orgUser.userUuid]: highestRole.role,
            };
        }, {});
    }, [organizationUsersQuery, projectGroupAccessQuery, groupsQuery]);

    const projectRoles = useMemo(() => {
        if (!projectAccessQuery.isSuccess) return {};

        return projectAccessQuery.data.reduce<
            Record<string, ProjectMemberRole>
        >((acc, projectMember) => {
            return {
                ...acc,
                [projectMember.userUuid]: projectMember.role,
            };
        }, {});
    }, [projectAccessQuery]);

    const inheritedRoles = useMemo(() => {
        // Organization users and org roles are not always available, and we don't want to show the user access page if they are not available
        if (!organizationUsersQuery.isSuccess || !orgRoles) return undefined;
        return organizationUsersQuery.data.reduce<
            Record<string, InheritedRoles>
        >((acc, orgUser) => {
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
        }, {});
    }, [organizationUsersQuery, orgRoles, groupRoles, projectRoles]);

    const usersWithProjectRole: ProjectUserWithRole[] = useMemo(() => {
        if (!organizationUsersQuery.isSuccess || !inheritedRoles) return [];

        return organizationUsersQuery.data.map((orgUser) => {
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
    }, [organizationUsersQuery, projectRoles, inheritedRoles, projectUuid]);

    return {
        usersWithProjectRole,
        isLoading:
            projectAccessQuery.isInitialLoading ||
            organizationUsersQuery.isInitialLoading,
        inheritedRoles,
    };
};
