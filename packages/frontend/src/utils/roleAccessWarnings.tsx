import {
    isSystemRole,
    OrganizationMemberRole,
    type GroupWithMembers,
    type ProjectMemberRole,
    type RoleAssignment,
} from '@lightdash/common';
import { Text } from '@mantine/core';
import { type ReactNode } from 'react';

export const systemRolesOrder: string[] = Object.values(OrganizationMemberRole);

export interface UserGroupAccess {
    group: GroupWithMembers;
    access: RoleAssignment;
    roleName: string;
}

export interface AccessWarningParams {
    organizationRole?: string;
    hasProjectRole: boolean;
    projectRole?: ProjectMemberRole | null;
    userGroupAccess?: UserGroupAccess | null;
}

/* 
  The accessWarning shows alerts when role conflicts or inheritance may cause permission issues:

  1. No Warning: If user has no organization role OR no project role → return
  2. System Role Conflicts (when project role is system role like admin/editor/viewer):
    - Group > Project: If user's group role ranks higher than project role → Show "inherits from
   group" warning
    - Org > Project: If user's organization role ranks higher than project role → Show "inherits
   higher from org" warning
  3. Custom Group Role: If user belongs to group with custom role → Show "group has custom role"
   warning
  4. Custom Project Role: If user has custom project role → Show "custom + org role conflict"
  warning
*/
export const getAccessWarning = ({
    organizationRole,
    hasProjectRole,
    projectRole,
    userGroupAccess,
}: AccessWarningParams): ReactNode | undefined => {
    try {
        // Check for organization role warnings (existing logic)
        if (!organizationRole) return;

        const typedProjectRole = projectRole as ProjectMemberRole;

        if (isSystemRole(typedProjectRole)) {
            // Group role inheritance warning
            if (
                userGroupAccess?.access.roleId &&
                systemRolesOrder.indexOf(userGroupAccess.access.roleId) >
                    systemRolesOrder.indexOf(typedProjectRole)
            ) {
                return (
                    <Text fw={300}>
                        User inherits role{' '}
                        <Text fw={600} span>
                            {userGroupAccess.roleName}
                        </Text>{' '}
                        from group{' '}
                        <Text fw={600} span>
                            {userGroupAccess.group.name}
                        </Text>
                        .
                    </Text>
                );
            }

            // Organization role inheritance warning
            if (
                systemRolesOrder.indexOf(organizationRole) >
                systemRolesOrder.indexOf(typedProjectRole)
            ) {
                return (
                    <Text fw={300}>
                        User inherits higher role{' '}
                        <Text fw={600} span>
                            {organizationRole}
                        </Text>{' '}
                        from organization.
                    </Text>
                );
            }
        }

        // Custom group role warning
        if (
            userGroupAccess?.access.roleId &&
            !isSystemRole(userGroupAccess.access.roleId)
        ) {
            return (
                <>
                    <Text fw={300}>
                        This user belongs to a group{' '}
                        <Text fw={600} span>
                            {userGroupAccess.group.name}
                        </Text>{' '}
                    </Text>
                    <Text fw={300}>
                        which has a custom role
                        <Text fw={600} span>
                            {' '}
                            {userGroupAccess.roleName}
                        </Text>{' '}
                        assigned.{' '}
                    </Text>
                    <Text fw={300}>
                        Make sure the organization or project role doesn't
                        override the group role permissions.
                    </Text>
                </>
            );
        }

        if (hasProjectRole && !isSystemRole(typedProjectRole)) {
            // Custom project role warning
            return (
                <>
                    <Text fw={300}>
                        This user has a custom role and an organization role{' '}
                        <Text fw={600} span>
                            {organizationRole}
                        </Text>{' '}
                        assigned.{' '}
                    </Text>
                    <Text fw={300}>
                        Make sure the organization or group role doesn't
                        override the project role permissions.
                    </Text>
                </>
            );
        }
    } catch (error) {
        console.error('Error getting access warning', error);
        return null;
    }
};
