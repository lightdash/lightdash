import {
    type OrganizationMemberProfile,
    type ProjectMemberRole,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useOrganizationUsers } from './useOrganizationUsers';
import { useProjectRoleAssignments } from './useProjectRoles';

export type ProjectUserWithRoleV2 = OrganizationMemberProfile & {
    projectUuid: string;
    projectRole: ProjectMemberRole | null;
    /** True when the direct project assignment holds extra custom roles. */
    projectRoleHasMultiple: boolean;
};

export const useProjectUsersWithRoles = (projectUuid: string) => {
    const organizationUsersQuery = useOrganizationUsers();
    const projectRoleAssignmentsQuery = useProjectRoleAssignments(projectUuid);

    // Create a mapping of user UUIDs to their direct project role assignments
    const projectRoles = useMemo(() => {
        if (
            !projectRoleAssignmentsQuery.isSuccess ||
            !projectRoleAssignmentsQuery.data
        )
            return {};

        return projectRoleAssignmentsQuery.data.reduce<
            Record<string, { role: ProjectMemberRole; hasMultiple: boolean }>
        >((acc, assignment) => {
            if (assignment.assigneeType === 'user') {
                acc[assignment.assigneeId] = {
                    // Convert the role id to ProjectMemberRole
                    role: assignment.roleId as ProjectMemberRole,
                    hasMultiple: assignment.hasMultipleRoles === true,
                };
            }
            return acc;
        }, {});
    }, [
        projectRoleAssignmentsQuery.isSuccess,
        projectRoleAssignmentsQuery.data,
    ]);

    const usersWithProjectRole: ProjectUserWithRoleV2[] = useMemo(() => {
        if (!organizationUsersQuery.isSuccess) return [];

        const mappedUsers = organizationUsersQuery.data.map((orgUser) => ({
            ...orgUser,
            projectUuid,
            projectRole: projectRoles[orgUser.userUuid]?.role ?? null,
            projectRoleHasMultiple:
                projectRoles[orgUser.userUuid]?.hasMultiple ?? false,
        }));

        // Sort users: project roles first, then alphabetically by firstName
        return mappedUsers.sort((a, b) => {
            // Users with project roles come first
            const aHasRole = a.projectRole !== null;
            const bHasRole = b.projectRole !== null;

            if (aHasRole && !bHasRole) return -1;
            if (!aHasRole && bHasRole) return 1;

            // Within each group (with/without roles), sort alphabetically by firstName
            const aFirstName = a.firstName || '';
            const bFirstName = b.firstName || '';

            return aFirstName.localeCompare(bFirstName, undefined, {
                sensitivity: 'base',
            });
        });
    }, [
        organizationUsersQuery.isSuccess,
        organizationUsersQuery.data,
        projectRoles,
        projectUuid,
    ]);

    const groupRoles = useMemo(() => {
        return projectRoleAssignmentsQuery.data?.filter(
            (assignment) => assignment.assigneeType === 'group',
        );
    }, [projectRoleAssignmentsQuery.data]);

    return {
        usersWithProjectRole,
        isLoading:
            projectRoleAssignmentsQuery.isInitialLoading ||
            organizationUsersQuery.isInitialLoading,
        groupRoles,
    };
};
