import {
    convertOrganizationRoleToProjectRole,
    convertProjectRoleToOrganizationRole,
    FeatureFlags,
    getHighestProjectRole,
    isGroupWithMembers,
    isSystemRole,
    ProjectMemberRole,
    type Group,
    type InheritedRoles,
    type KnexPaginateArgs,
    type OrganizationMemberProfile,
    type OrganizationMemberRole,
    type ProjectGroupAccess,
    type ProjectMemberProfile,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useProjectGroupAccessList } from '../features/projectGroupAccess/hooks/useProjectGroupAccess';
import { useOrganizationGroups } from './useOrganizationGroups';
import { useOrganizationUsers } from './useOrganizationUsers';
import { useProjectAccess } from './useProjectAccess';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

export type ProjectUserWithRole = Omit<OrganizationMemberProfile, 'role'> & {
    inheritedRole: InheritedRoles | undefined;
    finalRole: OrganizationMemberRole;
    projectUuid: string;
    role: ProjectMemberRole;
    /**
     * True when any of the user's roles (organization, group or project) is a
     * custom role. Custom roles can't be ranked against system roles, so
     * `inheritedRole` says nothing about them; consumers that gate on a
     * minimum system role should treat these users as having project access.
     */
    hasCustomRole: boolean;
};

/**
 * Users who hold a custom role through any path: their organization
 * membership, a group with a custom project role, or a direct project
 * membership. The API reports a custom role as `roleUuid` (or
 * `hasMultipleRoles` for role sets) next to the plain `member` base role, so
 * looking only at `role` makes these users look like they have no access.
 */
export const collectCustomRoleHolders = ({
    organizationUsers,
    projectAccess,
    projectGroupAccess,
    groups,
}: {
    organizationUsers: Pick<
        OrganizationMemberProfile,
        'userUuid' | 'roleUuid' | 'hasMultipleRoles'
    >[];
    projectAccess: Pick<
        ProjectMemberProfile,
        'userUuid' | 'roleUuid' | 'hasMultipleRoles'
    >[];
    projectGroupAccess: Pick<ProjectGroupAccess, 'groupUuid' | 'role'>[];
    groups: Group[];
}): Set<string> => {
    const holders = new Set<string>();

    organizationUsers.forEach((orgUser) => {
        if (orgUser.roleUuid !== undefined || orgUser.hasMultipleRoles) {
            holders.add(orgUser.userUuid);
        }
    });

    projectAccess.forEach((member) => {
        if (member.roleUuid !== undefined || member.hasMultipleRoles) {
            holders.add(member.userUuid);
        }
    });

    projectGroupAccess.forEach((groupAccess) => {
        if (isSystemRole(groupAccess.role)) return;
        const group = groups.find((g) => g.uuid === groupAccess.groupUuid);
        if (!group || !isGroupWithMembers(group)) return;
        group.memberUuids.forEach((userUuid) => holders.add(userUuid));
    });

    return holders;
};

export const useProjectUsersWithRoles = (
    projectUuid: string,
    params?: {
        searchInput?: string;
        enabled?: boolean;
        paginateArgs?: KnexPaginateArgs;
    },
) => {
    const userGroupsFeatureFlagQuery = useServerFeatureFlag(
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
                    // A group can carry a custom-role UUID instead of a system role.
                    // Custom roles aren't rankable here, so drop them (undefined) rather
                    // than casting a UUID into ProjectMemberRole, which crashes downstream.
                    role: isSystemRole(roleString) ? roleString : undefined,
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

    const customRoleHolders = useMemo(() => {
        if (!organizationUsersQuery.isSuccess) return new Set<string>();

        return collectCustomRoleHolders({
            organizationUsers: organizationUsersQuery.data,
            projectAccess: projectAccessQuery.data ?? [],
            projectGroupAccess: projectGroupAccessQuery.data ?? [],
            groups: groupsQuery.data ?? [],
        });
    }, [
        organizationUsersQuery,
        projectAccessQuery,
        projectGroupAccessQuery,
        groupsQuery,
    ]);

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
                hasCustomRole: customRoleHolders.has(orgUser.userUuid),
            };
        });
    }, [
        organizationUsersQuery,
        projectRoles,
        inheritedRoles,
        projectUuid,
        customRoleHolders,
    ]);

    return {
        usersWithProjectRole,
        isLoading:
            projectAccessQuery.isInitialLoading ||
            organizationUsersQuery.isInitialLoading,
        inheritedRoles,
    };
};
