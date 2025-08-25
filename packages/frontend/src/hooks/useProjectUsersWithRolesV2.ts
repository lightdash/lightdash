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

export const useProjectUsersWithRolesV2 = (projectUuid: string) => {
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
        >((acc: Record<string, ProjectMemberRole>, assignment: any) => {
            if (assignment.assigneeType === 'user') {
                // Convert the role name to ProjectMemberRole
                const projectRole = assignment.roleName as ProjectMemberRole;
                acc[assignment.assigneeId] = projectRole;
            }
            return acc;
        }, {});
    }, [projectRoleAssignmentsQuery]);

    const usersWithProjectRole: ProjectUserWithRoleV2[] = useMemo(() => {
        if (!organizationUsersQuery.isSuccess) return [];

        return organizationUsersQuery.data.map((orgUser) => ({
            ...orgUser,
            projectUuid,
            projectRole: projectRoles[orgUser.userUuid] || null,
        }));
    }, [organizationUsersQuery, projectRoles, projectUuid]);

    const usersDictionary = useMemo(() => {
        return usersWithProjectRole.reduce<
            Record<string, ProjectUserWithRoleV2>
        >(
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
        isLoading:
            projectRoleAssignmentsQuery.isInitialLoading ||
            organizationUsersQuery.isInitialLoading,
        projectRoles,
    };
};
