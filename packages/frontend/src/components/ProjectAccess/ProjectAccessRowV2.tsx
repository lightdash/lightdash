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
    systemRolesOrder,
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
    const userGroupAccess = useMemo((): UserGroupAccess | null => {
        if (!organizationGroups || !groupRoles) return null;

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

        // TODO can an user be in multiple groups ? what happens then with permisisons
        return groupsWithAccess.length > 0 ? groupsWithAccess[0] : null;
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

    const { highestRole, highestRoleType } = useMemo(() => {
        if (
            userGroupAccess?.access.roleId &&
            systemRolesOrder.indexOf(userGroupAccess.access.roleId) >
                systemRolesOrder.indexOf(organizationRole || 'member')
        ) {
            return {
                highestRole: userGroupAccess.access.roleId,
                highestRoleType: `Group ${userGroupAccess.group.name}`,
            };
        }
        return {
            highestRole: organizationRole,
            highestRoleType: 'Organization',
        };
    }, [userGroupAccess, organizationRole]);

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
            userGroupAccess,
        });
    }, [organizationRole, hasProjectRole, user.projectRole, userGroupAccess]);

    const userRoleSummary = useMemo(() => {
        return (
            <Stack>
                <Text fw={300}>
                    Organization role:{' '}
                    <Text fw={600} span>
                        {getRoleName(organizationRole || '')}
                    </Text>
                </Text>
                {userGroupAccess?.access.roleId ? (
                    <Text fw={300}>
                        Group{' '}
                        <Text fw={600} span>
                            {userGroupAccess.group.name}
                        </Text>
                        :{' '}
                        <Text fw={600} span>
                            {userGroupAccess.roleName}
                        </Text>
                    </Text>
                ) : null}
                {hasProjectRole ? (
                    <Text fw={300}>
                        {' '}
                        Project role:{' '}
                        <Text fw={600} span>
                            {user.projectRole}
                        </Text>
                    </Text>
                ) : null}
            </Stack>
        );
    }, [user, organizationRole, userGroupAccess, hasProjectRole, getRoleName]);

    return (
        <>
            <tr>
                <td width="30%">
                    <Tooltip label={userRoleSummary}>
                        <Stack spacing="xs" align="flex-start">
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
                    <Group spacing="xs">
                        <Tooltip
                            disabled={hasProjectRole}
                            label={
                                <Text>
                                    User inherits this role from{' '}
                                    <Text span fw={600}>
                                        {highestRoleType}
                                    </Text>
                                </Text>
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
                                ? 'Revoke project access'
                                : 'Cannot revoke inherited access from Organization'
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
                    user={{ email: user.email }}
                    onDelete={handleDelete}
                    onClose={() => setIsDeleteDialogOpen(false)}
                />
            )}
        </>
    );
};

export default ProjectAccessRowV2;
