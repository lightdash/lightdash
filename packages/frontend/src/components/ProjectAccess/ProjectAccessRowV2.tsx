import {
    isSystemRole,
    OrganizationMemberRole,
    ProjectMemberRole,
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
import MantineIcon from '../common/MantineIcon';
import RemoveProjectAccessModal from './RemoveProjectAccessModal';

type Props = {
    projectUuid: string;
    canManageProjectAccess: boolean;
    user: ProjectUserWithRoleV2;
    organizationRoles: { value: string; label: string; group: string }[];
    organizationRoleAssignments: RoleAssignment[];
};

const ProjectAccessRowV2: FC<Props> = ({
    projectUuid,
    canManageProjectAccess,
    user,
    organizationRoles,
    organizationRoleAssignments,
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
    // Get the current role UUID (either project role or org role)
    const currentRoleUuid = useMemo(() => {
        if (hasProjectRole) {
            // Find the project role UUID from organization roles
            const projectRoleData = organizationRoles.find(
                (role) => role.label === user.projectRole,
            );
            return projectRoleData?.value;
        }
        // Use the organization role assignment
        return organizationRole;
    }, [hasProjectRole, user, organizationRoles, organizationRole]);

    const isLoading = upsertMutation.isLoading || deleteMutation.isLoading;
    const isMember = user.role === OrganizationMemberRole.MEMBER;

    const accessWarning = useMemo(() => {
        if (!organizationRole) return;
        if (!hasProjectRole) return;

        const projectRole = user.projectRole as ProjectMemberRole;
        if (isSystemRole(projectRole)) {
            const projectSystemRoles = [
                'member',
                ...Object.values(ProjectMemberRole),
            ];
            const organizationSystemRoles: string[] = Object.values(
                OrganizationMemberRole,
            );
            if (
                organizationSystemRoles.indexOf(organizationRole) >
                projectSystemRoles.indexOf(projectRole)
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
        } else {
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
                        Make sure the organization role doesn't override the
                        project role permissions.
                    </Text>
                </>
            );
        }
    }, [hasProjectRole, user.projectRole, organizationRole]);

    return (
        <>
            <tr>
                <td width="30%">
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
                </td>
                <td width="70%">
                    <Group spacing="xs">
                        <Tooltip
                            disabled={hasProjectRole}
                            label={
                                <Text>
                                    User inherits this role from{' '}
                                    <Text span fw={600}>
                                        Organization
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
                                value={currentRoleUuid}
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
