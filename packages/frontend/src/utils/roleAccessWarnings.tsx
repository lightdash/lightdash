import {
    getUncoveredProjectScopes,
    isSystemRole,
    OrganizationMemberRole,
    type GroupWithMembers,
    type ProjectMemberRole,
    type RoleAssignment,
    type ScopeName,
} from '@lightdash/common';
import { Text } from '@mantine-8/core';
import startCase from 'lodash/startCase';
import { Fragment, type ReactNode } from 'react';

export const systemRolesOrder: string[] = Object.values(OrganizationMemberRole);

export interface UserGroupAccess {
    group: GroupWithMembers;
    access: RoleAssignment;
    roleName: string;
}

export interface AccessWarningParams {
    organizationRole?: string;
    organizationRoleName?: string;
    hasProjectRole: boolean;
    projectRole?: ProjectMemberRole | null;
    userGroupAccesses?: UserGroupAccess[] | null;
    /** Scopes per roleId; when absent, custom-role warnings show unconditionally */
    roleScopesById?: Map<string, string[]>;
}

/** e.g. "manage:Dashboard@space" -> "Manage Dashboard" */
const formatScopeName = (scopeName: string): string =>
    startCase(scopeName.split('@')[0].replace(':', ' '));

const formatScopeExamples = (scopeNames: ScopeName[]): string => {
    // Lead with the most meaningful permissions (manage/create over view)
    const sorted = [...scopeNames].sort(
        (a, b) => Number(a.startsWith('view:')) - Number(b.startsWith('view:')),
    );
    const displayNames = [...new Set(sorted.map(formatScopeName))];
    const examples = displayNames.slice(0, 3).join(', ');
    const remaining = displayNames.length - 3;
    return remaining > 0 ? `${examples} and ${remaining} more` : examples;
};

const joinWithAnd = (nodes: ReactNode[]): ReactNode =>
    nodes.map((node, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <Fragment key={index}>
            {index > 0 && (index === nodes.length - 1 ? ' and ' : ', ')}
            {node}
        </Fragment>
    ));

const getLegacyCustomGroupWarning = (
    customGroup: UserGroupAccess,
): ReactNode => (
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
            Make sure the organization or project role doesn't override the
            group role permissions.
        </Text>
    </>
);

/*
  The accessWarning shows alerts when role conflicts or inheritance may cause permission issues:

  1. No Warning: If user has no organization role OR no project role → return
  2. System Role Conflicts (when project role is system role like admin/editor/viewer):
    - Group > Project: If user's group role ranks higher than project role → Show "inherits from
   group" warning
    - Org > Project: If user's organization role ranks higher than project role → Show "inherits
   higher from org" warning
  3. Custom Project Role: warn only when the org or a group role grants scopes
   the custom role does not cover
  4. Custom Group Role: same check, protecting the group's custom role from
   the org/project/other-group roles
*/
export const getAccessWarning = ({
    organizationRole,
    organizationRoleName,
    hasProjectRole,
    projectRole,
    userGroupAccesses,
    roleScopesById,
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
                        <Text fw={300} fz="sm">
                            User inherits role{' '}
                            <Text fw={600} span fz="sm">
                                {bestGroup.roleName}
                            </Text>{' '}
                            from group{' '}
                            <Text fw={600} span fz="sm">
                                {bestGroup.group.name}
                            </Text>
                            .
                        </Text>
                    );
                }
            }

            // Organization role inheritance warning
            if (
                systemRolesOrder.indexOf(organizationRole) >
                systemRolesOrder.indexOf(typedProjectRole)
            ) {
                return (
                    <Text fw={300} fz="sm">
                        User inherits higher role{' '}
                        <Text fw={600} span fz="sm">
                            {organizationRole}
                        </Text>{' '}
                        from organization.
                    </Text>
                );
            }
        }

        // Custom project role warning: only when other roles grant more
        if (hasProjectRole && !isSystemRole(typedProjectRole)) {
            const customRoleScopes = roleScopesById?.get(typedProjectRole);

            if (!roleScopesById || !customRoleScopes) {
                // Scope data unavailable — keep the conservative warning
                return (
                    <>
                        <Text fw={300}>
                            This user has a custom role and an organization role{' '}
                            <Text fw={600} span>
                                {organizationRoleName ?? organizationRole}
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

            const additiveSources: { label: ReactNode; scopes: string[] }[] = [
                {
                    label: (
                        <>
                            organization role{' '}
                            <Text fw={600} span>
                                {organizationRoleName ?? organizationRole}
                            </Text>
                        </>
                    ),
                    scopes: roleScopesById.get(organizationRole) ?? [],
                },
                ...(userGroupAccesses ?? []).map((uga) => ({
                    label: (
                        <>
                            group{' '}
                            <Text fw={600} span>
                                {uga.group.name}
                            </Text>{' '}
                            (role{' '}
                            <Text fw={600} span>
                                {uga.roleName}
                            </Text>
                            )
                        </>
                    ),
                    scopes: roleScopesById.get(uga.access.roleId) ?? [],
                })),
            ];

            const conflicts = additiveSources
                .map((source) => ({
                    ...source,
                    uncoveredScopes: getUncoveredProjectScopes(
                        source.scopes,
                        customRoleScopes,
                        { isEnterprise: true },
                    ),
                }))
                .filter(({ uncoveredScopes }) => uncoveredScopes.length > 0);

            if (conflicts.length === 0) return;

            const uncoveredScopes = [
                ...new Set(conflicts.flatMap((c) => c.uncoveredScopes)),
            ];

            return (
                <>
                    <Text fw={300}>
                        This user has a custom role, but{' '}
                        {joinWithAnd(conflicts.map((c) => c.label))} grant
                        {conflicts.length === 1 ? 's' : ''} them permissions the
                        custom role does not include (e.g.{' '}
                        <Text fw={600} span>
                            {formatScopeExamples(uncoveredScopes)}
                        </Text>
                        ).
                    </Text>
                    <Text fw={300}>
                        Organization and group permissions are additive and
                        cannot be restricted by the project role.
                    </Text>
                </>
            );
        }

        // Custom group role warning: only when other roles grant more
        const customGroups = (userGroupAccesses || []).filter(
            (uga) =>
                uga.access.roleId &&
                !isSystemRole(uga.access.roleId as ProjectMemberRole),
        );
        for (const customGroup of customGroups) {
            const groupRoleScopes = roleScopesById?.get(
                customGroup.access.roleId,
            );

            if (!roleScopesById || !groupRoleScopes) {
                // Scope data unavailable — keep the conservative warning
                return getLegacyCustomGroupWarning(customGroup);
            }

            const additiveScopes = [
                ...(roleScopesById.get(organizationRole) ?? []),
                ...(hasProjectRole && projectRole
                    ? (roleScopesById.get(projectRole) ?? [])
                    : []),
                ...(userGroupAccesses ?? [])
                    .filter((uga) => uga !== customGroup)
                    .flatMap(
                        (uga) => roleScopesById.get(uga.access.roleId) ?? [],
                    ),
            ];
            const uncoveredScopes = getUncoveredProjectScopes(
                additiveScopes,
                groupRoleScopes,
                { isEnterprise: true },
            );

            if (uncoveredScopes.length > 0) {
                return (
                    <>
                        <Text fw={300}>
                            This user belongs to group{' '}
                            <Text fw={600} span>
                                {customGroup.group.name}
                            </Text>{' '}
                            which has custom role{' '}
                            <Text fw={600} span>
                                {customGroup.roleName}
                            </Text>{' '}
                            assigned, but their other roles grant them
                            permissions beyond it (e.g.{' '}
                            <Text fw={600} span>
                                {formatScopeExamples(uncoveredScopes)}
                            </Text>
                            ).
                        </Text>
                        <Text fw={300}>
                            Organization and project permissions are additive
                            and cannot be restricted by the group role.
                        </Text>
                    </>
                );
            }
        }
    } catch (error) {
        console.error('Error getting access warning', error);
        return null;
    }
};
