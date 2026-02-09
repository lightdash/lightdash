import {
    isGroupWithMembers,
    OrganizationMemberRole,
    type GroupWithMembers,
    type Group as LightdashGroup,
    type RoleAssignment,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconTrash } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import {
    useDeleteProjectUserRoleAssignmentMutation,
    useUpsertProjectUserRoleAssignmentMutation,
} from '../../hooks/useProjectRoles';
import { type ProjectUserWithRoleV2 } from '../../hooks/useProjectUsersWithRolesV2';
import {
    getAccessWarning,
    getEffectiveRole,
    type UserGroupAccess,
} from '../../utils/roleAccessWarnings';
import MantineIcon from '../common/MantineIcon';
import RemoveProjectAccessModal from './RemoveProjectAccessModal';

type Props = {
    projectUuid: string;
    canManageProjectAccess: boolean;
    user: ProjectUserWithRoleV2;
    organizationRoles: { value: string; label: string; group: string }[];
    organizationRoleAssignments: RoleAssignment[];
    organizationGroups: (LightdashGroup | GroupWithMembers)[];
    groupRoles: RoleAssignment[];
};

const ProjectAccessRowV2: FC<Props> = ({
    projectUuid,
    canManageProjectAccess,
    user,
    organizationRoles,
    organizationRoleAssignments,
    organizationGroups,
    groupRoles,
}) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const upsertMutation =
        useUpsertProjectUserRoleAssignmentMutation(projectUuid);
    const deleteMutation =
        useDeleteProjectUserRoleAssignmentMutation(projectUuid);

    const handleRoleChange = useCallback(
        (newRoleUuid: string | null) => {
            if (newRoleUuid === 'member') {
                // We can't set 'member' as project role, this is an special organization role
                return;
            }
            if (!canManageProjectAccess || !newRoleUuid) return;

            upsertMutation.mutate({
                userId: user.userUuid,
                roleId: newRoleUuid,
            });
        },
        [canManageProjectAccess, upsertMutation, user.userUuid],
    );

    const handleDelete = useCallback(() => {
        if (!canManageProjectAccess) return;

        deleteMutation.mutate(user.userUuid);
        setIsDeleteDialogOpen(false);
    }, [canManageProjectAccess, deleteMutation, user.userUuid]);

    // Check if user has direct project role
    const hasProjectRole = !!user.projectRole;
    const organizationRole = useMemo(
        () =>
            organizationRoleAssignments.find(
                (assignment) =>
                    assignment.assigneeType === 'user' &&
                    assignment.assigneeId === user.userUuid,
            )?.roleId,
        [organizationRoleAssignments, user.userUuid],
    );

    // Find groups the user belongs to that have project access
    const userGroupAccesses = useMemo((): UserGroupAccess[] => {
        if (!organizationGroups || !groupRoles) return [];

        // Find groups where the user is a member
        const userGroups = organizationGroups.filter((group) => {
            if (!isGroupWithMembers(group)) return false;
            return group.memberUuids.includes(user.userUuid);
        });

        // Find which of these groups have project access
        const groupsWithAccess = userGroups
            .map((group) => {
                const groupAccess = groupRoles.find(
                    (access) => access.assigneeId === group.uuid,
                );
                return groupAccess
                    ? {
                          group,
                          access: groupAccess,
                          roleName: groupAccess.roleName,
                      }
                    : null;
            })
            .filter((item): item is UserGroupAccess => item !== null);

        return groupsWithAccess;
    }, [organizationGroups, groupRoles, user.userUuid]);

    const currentRoleUuid = useMemo(() => {
        if (hasProjectRole) {
            // Find the project role UUID from organization roles
            const projectRoleData = organizationRoles.find(
                (role) => role.value === user.projectRole,
            );
            return projectRoleData?.value;
        }
        return undefined;
    }, [hasProjectRole, user, organizationRoles]);

    const isLoading = upsertMutation.isLoading || deleteMutation.isLoading;
    const isMember = user.role === OrganizationMemberRole.MEMBER;

    // Compute the effective role considering org, group, and project roles
    const effectiveRoleInfo = useMemo(() => {
        return getEffectiveRole({
            organizationRole,
            projectRole: user.projectRole,
            userGroupAccesses,
        });
    }, [organizationRole, user.projectRole, userGroupAccesses]);

    // For backwards compatibility, keep highestRole and highestRoleType
    const highestRole = effectiveRoleInfo.role;
    const highestRoleType =
        effectiveRoleInfo.source === 'organization'
            ? 'Organization'
            : effectiveRoleInfo.source === 'group'
              ? `Group ${effectiveRoleInfo.sourceName}`
              : 'Project';

    // Helper function to get role name from roleId
    const getRoleName = useCallback(
        (roleId: string) => {
            const role = organizationRoles.find((r) => r.value === roleId);
            return role?.label || roleId;
        },
        [organizationRoles],
    );

    const accessWarning = useMemo(() => {
        return getAccessWarning({
            organizationRole,
            hasProjectRole,
            projectRole: user.projectRole,
            userGroupAccesses,
        });
    }, [organizationRole, hasProjectRole, user.projectRole, userGroupAccesses]);

    const userRoleSummary = useMemo(() => {
        return (
            <Stack gap="xs">
                <Text fw={600} size="sm">
                    Effective role:{' '}
                    <Text span c="blue">
                        {getRoleName(effectiveRoleInfo.role)}
                    </Text>
                    {effectiveRoleInfo.isInherited && (
                        <Text span size="xs" c="dimmed">
                            {' '}
                            (inherited from{' '}
                            {effectiveRoleInfo.source === 'organization'
                                ? 'organization'
                                : effectiveRoleInfo.source === 'group'
                                  ? `group "${effectiveRoleInfo.sourceName}"`
                                  : 'project'}
                            )
                        </Text>
                    )}
                </Text>
                <Text size="xs" c="dimmed">
                    Role breakdown:
                </Text>
                <Text fw={300} size="sm">
                    Organization:{' '}
                    <Text fw={600} span>
                        {getRoleName(organizationRole || 'member')}
                    </Text>
                </Text>
                {(userGroupAccesses || []).map((uga) => (
                    <Text key={uga.group.uuid} fw={300} size="sm">
                        Group{' '}
                        <Text fw={600} span>
                            {uga.group.name}
                        </Text>
                        :{' '}
                        <Text fw={600} span>
                            {uga.roleName}
                        </Text>
                    </Text>
                ))}
                {hasProjectRole ? (
                    <Text fw={300} size="sm">
                        Project:{' '}
                        <Text fw={600} span>
                            {user.projectRole}
                        </Text>
                        {effectiveRoleInfo.isInherited && (
                            <Text span size="xs" c="dimmed">
                                {' '}
                                (overridden)
                            </Text>
                        )}
                    </Text>
                ) : null}
            </Stack>
        );
    }, [
        user,
        organizationRole,
        userGroupAccesses,
        hasProjectRole,
        getRoleName,
        effectiveRoleInfo,
    ]);

    return (
        <>
            <tr>
                <td width="30%">
                    <Tooltip label={userRoleSummary}>
                        <Stack gap="xs" align="flex-start">
                            {user.firstName && (
                                <Text fw={700}>
                                    {user.firstName} {user.lastName}
                                </Text>
                            )}
                            {user.email && (
                                <Badge color="gray" size="xs" radius="xs">
                                    {user.email}
                                </Badge>
                            )}
                        </Stack>
                    </Tooltip>
                </td>
                <td width="70%">
                    <Group gap="xs">
                        <Tooltip
                            disabled={hasProjectRole && !effectiveRoleInfo.isInherited}
                            label={
                                effectiveRoleInfo.isInherited ? (
                                    <Text>
                                        Effective role is{' '}
                                        <Text span fw={600}>
                                            {getRoleName(effectiveRoleInfo.role)}
                                        </Text>{' '}
                                        inherited from{' '}
                                        <Text span fw={600}>
                                            {highestRoleType}
                                        </Text>
                                        .{' '}
                                        {hasProjectRole &&
                                            'The assigned project role has no additional effect.'}
                                    </Text>
                                ) : (
                                    <Text>
                                        User inherits this role from{' '}
                                        <Text span fw={600}>
                                            {highestRoleType}
                                        </Text>
                                    </Text>
                                )
                            }
                        >
                            <Select
                                id="user-role"
                                w="300px"
                                size="xs"
                                disabled={isLoading}
                                data={
                                    isMember && !hasProjectRole
                                        ? [
                                              {
                                                  value: 'member',
                                                  label: 'member',
                                                  group: 'Organization role',
                                              },
                                              ...organizationRoles,
                                          ]
                                        : organizationRoles
                                }
                                value={currentRoleUuid || highestRole}
                                onChange={handleRoleChange}
                            />
                        </Tooltip>
                        {effectiveRoleInfo.isInherited && hasProjectRole && (
                            <Tooltip
                                label={
                                    <Text>
                                        This project role is overridden by a
                                        higher role from {highestRoleType}
                                    </Text>
                                }
                            >
                                <Badge
                                    size="xs"
                                    variant="light"
                                    color="orange"
                                >
                                    Overridden
                                </Badge>
                            </Tooltip>
                        )}
                        {accessWarning && (
                            <Tooltip label={accessWarning}>
                                <MantineIcon
                                    icon={IconAlertTriangle}
                                    color="yellow.9"
                                />
                            </Tooltip>
                        )}
                    </Group>
                </td>
                <td width="1%">
                    <Tooltip
                        position="top"
                        label={
                            hasProjectRole
                                ? 'Revoke direct project role assignment'
                                : `Cannot revoke access - user has no direct project role. Access is inherited from ${highestRoleType}.`
                        }
                    >
                        <div>
                            <ActionIcon
                                disabled={!hasProjectRole || isLoading}
                                variant="outline"
                                color="red"
                                onClick={() => setIsDeleteDialogOpen(true)}
                            >
                                <MantineIcon icon={IconTrash} />
                            </ActionIcon>
                        </div>
                    </Tooltip>
                </td>
            </tr>

            {isDeleteDialogOpen && (
                <RemoveProjectAccessModal
                    user={{
                        firstName: user.firstName,
                        lastName: user.lastName,
                        email: user.email,
                    }}
                    onDelete={handleDelete}
                    onClose={() => setIsDeleteDialogOpen(false)}
                />
            )}
        </>
    );
};

export default ProjectAccessRowV2;
