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

export type EffectiveRoleSource = 'organization' | 'group' | 'project';

export interface EffectiveRoleInfo {
    role: string;
    source: EffectiveRoleSource;
    sourceName: string;
    isInherited: boolean;
}

/**
 * Computes the effective (highest) role for a user based on org, group, and project roles.
 * The "member" org role is treated as the lowest and doesn't grant project access by itself.
 */
export const getEffectiveRole = ({
    organizationRole,
    projectRole,
    userGroupAccesses,
}: {
    organizationRole?: string;
    projectRole?: ProjectMemberRole | null;
    userGroupAccesses?: UserGroupAccess[] | null;
}): EffectiveRoleInfo => {
    // Member is special - it doesn't grant project access, only project-specific roles apply
    const effectiveOrgRole =
        organizationRole === OrganizationMemberRole.MEMBER
            ? null
            : organizationRole;

    let bestRole = effectiveOrgRole || projectRole || 'member';
    let bestSource: EffectiveRoleSource = effectiveOrgRole
        ? 'organization'
        : 'project';
    let bestSourceName = effectiveOrgRole ? 'Organization' : 'Project';

    // Check group roles
    (userGroupAccesses || []).forEach((uga) => {
        const roleId = uga.access.roleId;
        if (
            roleId &&
            isSystemRole(roleId as ProjectMemberRole) &&
            systemRolesOrder.indexOf(roleId) > systemRolesOrder.indexOf(bestRole)
        ) {
            bestRole = roleId;
            bestSource = 'group';
            bestSourceName = uga.group.name;
        }
    });

    // Check if org role beats current best (excluding member)
    if (
        effectiveOrgRole &&
        systemRolesOrder.indexOf(effectiveOrgRole) >
            systemRolesOrder.indexOf(bestRole)
    ) {
        bestRole = effectiveOrgRole;
        bestSource = 'organization';
        bestSourceName = 'Organization';
    }

    // Determine if the effective role differs from the assigned project role
    const isInherited = projectRole
        ? bestSource !== 'project' &&
          systemRolesOrder.indexOf(bestRole) >
              systemRolesOrder.indexOf(projectRole)
        : bestSource !== 'project';

    return {
        role: bestRole,
        source: bestSource,
        sourceName: bestSourceName,
        isInherited,
    };
};

export interface AccessWarningParams {
    organizationRole?: string;
    hasProjectRole: boolean;
    projectRole?: ProjectMemberRole | null;
    userGroupAccesses?: UserGroupAccess[] | null;
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
    userGroupAccesses,
}: AccessWarningParams): ReactNode | undefined => {
    try {
        // Check for organization role warnings (existing logic)
        if (!organizationRole) return;

        const typedProjectRole = projectRole as ProjectMemberRole;

        if (isSystemRole(typedProjectRole)) {
            // Group role inheritance warning (consider all groups and pick the highest)
            const groupsWithSystemRoles = (userGroupAccesses || []).filter(
                (uga) =>
                    uga.access.roleId &&
                    isSystemRole(uga.access.roleId as ProjectMemberRole),
            );
            if (groupsWithSystemRoles.length > 0) {
                const bestGroup = groupsWithSystemRoles.reduce((best, curr) => {
                    const bestIdx = systemRolesOrder.indexOf(
                        best.access.roleId as string,
                    );
                    const currIdx = systemRolesOrder.indexOf(
                        curr.access.roleId as string,
                    );
                    return currIdx > bestIdx ? curr : best;
                });
                if (
                    bestGroup.access.roleId &&
                    systemRolesOrder.indexOf(bestGroup.access.roleId) >
                        systemRolesOrder.indexOf(typedProjectRole)
                ) {
                    return (
                        <Text fw={300}>
                            User inherits role{' '}
                            <Text fw={600} span>
                                {bestGroup.roleName}
                            </Text>{' '}
                            from group{' '}
                            <Text fw={600} span>
                                {bestGroup.group.name}
                            </Text>
                            . The assigned project role has no additional
                            effect.
                        </Text>
                    );
                }
            }

            // Organization role inheritance warning (excluding member role)
            if (
                organizationRole !== OrganizationMemberRole.MEMBER &&
                systemRolesOrder.indexOf(organizationRole) >
                    systemRolesOrder.indexOf(typedProjectRole)
            ) {
                return (
                    <Text fw={300}>
                        User inherits higher role{' '}
                        <Text fw={600} span>
                            {organizationRole}
                        </Text>{' '}
                        from organization. The assigned project role has no
                        additional effect.
                    </Text>
                );
            }
        }

        // Custom group role warning (if any group has a custom role)
        const customGroup = (userGroupAccesses || []).find(
            (uga) =>
                uga.access.roleId &&
                !isSystemRole(uga.access.roleId as ProjectMemberRole),
        );
        if (customGroup) {
            return (
                <>
                    <Text fw={300}>
                        This user belongs to a group{' '}
                        <Text fw={600} span>
                            {customGroup.group.name}
                        </Text>{' '}
                    </Text>
                    <Text fw={300}>
                        which has a custom role
                        <Text fw={600} span>
                            {' '}
                            {customGroup.roleName}
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
