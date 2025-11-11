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
            Record<string, ProjectMemberRole>
        >((acc: Record<string, ProjectMemberRole>, assignment) => {
            if (assignment.assigneeType === 'user') {
                // Convert the role id to ProjectMemberRole
                acc[assignment.assigneeId] =
                    assignment.roleId as ProjectMemberRole;
            }
            return acc;
        }, {});
    }, [projectRoleAssignmentsQuery]);

    const usersWithProjectRole: ProjectUserWithRoleV2[] = useMemo(() => {
        if (!organizationUsersQuery.isSuccess) return [];

        const mappedUsers = organizationUsersQuery.data.map((orgUser) => ({
            ...orgUser,
            projectUuid,
            projectRole: projectRoles[orgUser.userUuid] || null,
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
    }, [organizationUsersQuery, projectRoles, projectUuid]);

    const groupRoles = useMemo(() => {
        return projectRoleAssignmentsQuery.data?.filter(
            (assignment) => assignment.assigneeType === 'group',
        );
    }, [projectRoleAssignmentsQuery]);

    return {
        usersWithProjectRole,
        isLoading:
            projectRoleAssignmentsQuery.isInitialLoading ||
            organizationUsersQuery.isInitialLoading,
        groupRoles,
    };
};
