import { subject } from '@casl/ability';
import {
    isGroupWithMembers,
    OrganizationMemberRole,
    type GroupWithMembers,
    type Role,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Menu,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconCheck,
    IconDotsVertical,
    IconInfoCircle,
    IconPlus,
    IconSearch,
    IconTrash,
    IconUserCircle,
    IconX,
} from '@tabler/icons-react';
import Fuse from 'fuse.js';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
} from 'mantine-react-table';
import { useCallback, useMemo, useState, type FC, type ReactNode } from 'react';
import { useOrganizationGroups } from '../../hooks/useOrganizationGroups';
import {
    useOrganizationRoleAssignments,
    useOrganizationRoles,
} from '../../hooks/useOrganizationRoles';
import {
    useDeleteProjectUserRoleAssignmentMutation,
    useUpsertProjectUserRoleAssignmentMutation,
} from '../../hooks/useProjectRoles';
import {
    useProjectUsersWithRoles,
    type ProjectUserWithRoleV2,
} from '../../hooks/useProjectUsersWithRolesV2';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import useApp from '../../providers/App/useApp';
import {
    getAccessWarning,
    systemRolesOrder,
    type UserGroupAccess,
} from '../../utils/roleAccessWarnings';
import MantineIcon from '../common/MantineIcon';
import CreateProjectAccessModal from './CreateProjectAccessModal';
import RemoveProjectAccessModal from './RemoveProjectAccessModal';

// --- Enriched row type with pre-computed per-row values ---

type EnrichedProjectUser = ProjectUserWithRoleV2 & {
    organizationRoleId: string | undefined;
    userGroupAccesses: UserGroupAccess[];
    currentRoleUuid: string | undefined;
    hasProjectRole: boolean;
    isMember: boolean;
    highestRole: string;
    highestRoleType: string;
    accessWarning: ReactNode | undefined;
};

// --- Small sub-component for the action cell (needs local state for delete modal) ---

type ProjectAccessActionCellProps = {
    user: EnrichedProjectUser;
    canManageProjectAccess: boolean;
    onDelete: (userUuid: string) => void;
    isLoading: boolean;
};

const ProjectAccessActionCell: FC<ProjectAccessActionCellProps> = ({
    user,
    canManageProjectAccess,
    onDelete,
    isLoading,
}) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    if (!canManageProjectAccess) return null;

    return (
        <>
            <Tooltip
                position="top"
                label={
                    user.hasProjectRole
                        ? 'Revoke project access'
                        : 'Cannot revoke inherited access from Organization'
                }
            >
                <ActionIcon
                    disabled={!user.hasProjectRole || isLoading}
                    variant="outline"
                    color="red"
                    size="sm"
                    onClick={() => setIsDeleteDialogOpen(true)}
                >
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Tooltip>

            {isDeleteDialogOpen && (
                <RemoveProjectAccessModal
                    user={{
                        firstName: user.firstName,
                        lastName: user.lastName,
                        email: user.email,
                    }}
                    onDelete={() => {
                        onDelete(user.userUuid);
                        setIsDeleteDialogOpen(false);
                    }}
                    onClose={() => setIsDeleteDialogOpen(false)}
                />
            )}
        </>
    );
};

// --- Main component ---

interface ProjectAccessProps {
    projectUuid: string;
}

const ProjectAccess: FC<ProjectAccessProps> = ({ projectUuid }) => {
    const theme = useMantineTheme();
    const { user } = useApp();
    const ability = useAbilityContext();

    const [search, setSearch] = useState('');
    const [showMembersOnly, setShowMembersOnly] = useState(false);
    const [isAddingProjectAccess, setIsAddingProjectAccess] = useState(false);

    const { usersWithProjectRole, groupRoles, isLoading } =
        useProjectUsersWithRoles(projectUuid);

    const { data: organizationRoles, isLoading: isLoadingOrganizationRoles } =
        useOrganizationRoles();
    const {
        data: organizationRoleAssignments,
        isLoading: isLoadingOrganizationRoleAssignments,
    } = useOrganizationRoleAssignments();

    // Fetch organization groups to check for inherited group access
    const { data: organizationGroups } = useOrganizationGroups({
        includeMembers: 2000,
    });

    const rolesData = useMemo(() => {
        return organizationRoles?.map(
            (role: Pick<Role, 'roleUuid' | 'name' | 'ownerType'>) => ({
                value: role.roleUuid,
                label: role.name,
                group:
                    role.ownerType === 'system' ? 'System role' : 'Custom role',
            }),
        );
    }, [organizationRoles]);

    // Convert flat grouped format (v6) to nested grouped format (v8) for Select
    const groupedRolesData = useMemo(() => {
        if (!rolesData) return [];
        const groups: Record<string, { value: string; label: string }[]> = {};
        rolesData.forEach((item) => {
            if (!groups[item.group]) groups[item.group] = [];
            groups[item.group].push({ value: item.value, label: item.label });
        });
        return Object.entries(groups).map(([group, items]) => ({
            group,
            items,
        }));
    }, [rolesData]);

    const canManageProjectAccess = ability.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    // Mutations (shared across all rows)
    const upsertMutation =
        useUpsertProjectUserRoleAssignmentMutation(projectUuid);
    const deleteMutation =
        useDeleteProjectUserRoleAssignmentMutation(projectUuid);

    const isMutating = upsertMutation.isLoading || deleteMutation.isLoading;

    const handleRoleChange = useCallback(
        (userUuid: string, newRoleUuid: string | null) => {
            if (newRoleUuid === 'member') return;
            if (!canManageProjectAccess || !newRoleUuid) return;
            upsertMutation.mutate({ userId: userUuid, roleId: newRoleUuid });
        },
        [canManageProjectAccess, upsertMutation],
    );

    const handleDelete = useCallback(
        (userUuid: string) => {
            if (!canManageProjectAccess) return;
            deleteMutation.mutate(userUuid);
        },
        [canManageProjectAccess, deleteMutation],
    );

    // Helper to get role name from roleId
    const getRoleName = useCallback(
        (roleId: string) => {
            const role = rolesData?.find((r) => r.value === roleId);
            return role?.label || roleId;
        },
        [rolesData],
    );

    // Filter out members without project roles when showMembersOnly is false
    const usersAfterMemberFilter = useMemo(() => {
        if (!usersWithProjectRole) return [];
        if (showMembersOnly) return usersWithProjectRole;

        // Hide users who are members at org level and don't have a direct project role
        return usersWithProjectRole.filter((u) => {
            const isMemberOnly =
                u.role === OrganizationMemberRole.MEMBER && !u.projectRole;
            return !isMemberOnly;
        });
    }, [usersWithProjectRole, showMembersOnly]);

    // Count of hidden members (for info display)
    const hiddenMembersCount = useMemo(() => {
        if (!usersWithProjectRole) return 0;
        return usersWithProjectRole.filter(
            (u) => u.role === OrganizationMemberRole.MEMBER && !u.projectRole,
        ).length;
    }, [usersWithProjectRole]);

    const filteredUsers = useMemo(() => {
        if (search && usersAfterMemberFilter) {
            return new Fuse(usersAfterMemberFilter, {
                keys: ['firstName', 'lastName', 'email', 'role', 'projectRole'],
                ignoreLocation: true,
                threshold: 0.3,
            })
                .search(search)
                .map((result) => result.item);
        }
        return usersAfterMemberFilter;
    }, [usersAfterMemberFilter, search]);

    // Enrich filtered users with pre-computed per-row values
    const enrichedUsers: EnrichedProjectUser[] = useMemo(() => {
        if (!filteredUsers) return [];

        return filteredUsers.map((u) => {
            const hasProjectRole = !!u.projectRole;
            const isMember = u.role === OrganizationMemberRole.MEMBER;

            const organizationRoleId = (organizationRoleAssignments || []).find(
                (assignment) =>
                    assignment.assigneeType === 'user' &&
                    assignment.assigneeId === u.userUuid,
            )?.roleId;

            // Find groups the user belongs to that have project access
            const userGroupAccesses: UserGroupAccess[] = (() => {
                if (!organizationGroups || !groupRoles) return [];

                const userGroups = organizationGroups.filter((group) => {
                    if (!isGroupWithMembers(group)) return false;
                    return group.memberUuids.includes(u.userUuid);
                });

                return userGroups
                    .map((group) => {
                        const groupAccess = groupRoles.find(
                            (access) => access.assigneeId === group.uuid,
                        );
                        return groupAccess
                            ? {
                                  group: group as GroupWithMembers,
                                  access: groupAccess,
                                  roleName: groupAccess.roleName,
                              }
                            : null;
                    })
                    .filter((item): item is UserGroupAccess => item !== null);
            })();

            const currentRoleUuid = hasProjectRole
                ? rolesData?.find((role) => role.value === u.projectRole)?.value
                : undefined;

            // Compute highest role
            let bestRole = organizationRoleId || 'member';
            let bestSource = 'Organization';
            userGroupAccesses.forEach((uga) => {
                const roleId = uga.access.roleId;
                if (
                    systemRolesOrder.indexOf(roleId) >
                    systemRolesOrder.indexOf(bestRole)
                ) {
                    bestRole = roleId;
                    bestSource = `Group ${uga.group.name}`;
                }
            });

            const accessWarning = getAccessWarning({
                organizationRole: organizationRoleId,
                hasProjectRole,
                projectRole: u.projectRole,
                userGroupAccesses,
            });

            return {
                ...u,
                organizationRoleId,
                userGroupAccesses,
                currentRoleUuid,
                hasProjectRole,
                isMember,
                highestRole: bestRole,
                highestRoleType: bestSource,
                accessWarning,
            };
        });
    }, [
        filteredUsers,
        organizationRoleAssignments,
        organizationGroups,
        groupRoles,
        rolesData,
    ]);

    const columns: MRT_ColumnDef<EnrichedProjectUser>[] = useMemo(() => {
        const cols: MRT_ColumnDef<EnrichedProjectUser>[] = [
            {
                accessorKey: 'email',
                header: 'User',
                enableSorting: false,
                size: 300,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconUserCircle} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const u = row.original;

                    // Build role summary tooltip
                    const roleSummary = (
                        <Stack>
                            <Text fw={300} fz="xs">
                                Organization role:{' '}
                                <Text fw={600} span fz="xs">
                                    {getRoleName(u.organizationRoleId || '')}
                                </Text>
                            </Text>
                            {u.userGroupAccesses.map((uga) => (
                                <Text key={uga.group.uuid} fw={300}>
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
                            {u.hasProjectRole && (
                                <Text fw={300}>
                                    Project role:{' '}
                                    <Text fw={600} span>
                                        {u.projectRole}
                                    </Text>
                                </Text>
                            )}
                        </Stack>
                    );

                    return (
                        <Tooltip
                            label={roleSummary}
                            fz="sm"
                            position="top-start"
                        >
                            <Stack gap="xxs" align="flex-start">
                                {u.firstName && (
                                    <Text fw={600} fz="sm">
                                        {u.firstName} {u.lastName}
                                    </Text>
                                )}
                                {u.email && (
                                    <Badge variant="light" color="gray">
                                        {u.email}
                                    </Badge>
                                )}
                            </Stack>
                        </Tooltip>
                    );
                },
            },
            {
                accessorKey: 'role',
                header: 'Role',
                enableSorting: false,
                size: 300,
                Cell: ({ row }) => {
                    const u = row.original;

                    return (
                        <Group gap="xs">
                            <Tooltip
                                disabled={u.hasProjectRole}
                                multiline
                                w={
                                    u.isMember && !u.hasProjectRole
                                        ? 280
                                        : undefined
                                }
                                label={
                                    u.isMember && !u.hasProjectRole ? (
                                        <Text fz="xs">
                                            <Text fw={600} fz="xs">
                                                Members have no access to this
                                                project.
                                            </Text>
                                            <Text fz="xs">
                                                Assign a project role to grant
                                                them visibility.
                                            </Text>
                                        </Text>
                                    ) : (
                                        <Text fz="xs">
                                            User inherits this role from{' '}
                                            <Text span fw={600} fz="xs">
                                                {u.highestRoleType}
                                            </Text>
                                        </Text>
                                    )
                                }
                            >
                                <Select
                                    id="user-role"
                                    w={250}
                                    size="xs"
                                    disabled={
                                        isMutating || !canManageProjectAccess
                                    }
                                    data={
                                        u.isMember && !u.hasProjectRole
                                            ? [
                                                  {
                                                      group: 'Organization role',
                                                      items: [
                                                          {
                                                              value: 'member',
                                                              label: 'member (no project access)',
                                                          },
                                                      ],
                                                  },
                                                  ...groupedRolesData,
                                              ]
                                            : groupedRolesData
                                    }
                                    value={u.currentRoleUuid || u.highestRole}
                                    onChange={(newRoleUuid) =>
                                        handleRoleChange(
                                            u.userUuid,
                                            newRoleUuid,
                                        )
                                    }
                                />
                            </Tooltip>
                            {u.accessWarning && (
                                <Tooltip label={u.accessWarning}>
                                    <MantineIcon
                                        icon={IconAlertTriangle}
                                        color="yellow.9"
                                    />
                                </Tooltip>
                            )}
                        </Group>
                    );
                },
            },
        ];

        if (canManageProjectAccess) {
            cols.push({
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 50,
                Cell: ({ row }) => (
                    <Box
                        component="div"
                        onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                            e.stopPropagation();
                            e.preventDefault();
                        }}
                    >
                        <ProjectAccessActionCell
                            user={row.original}
                            canManageProjectAccess={canManageProjectAccess}
                            onDelete={handleDelete}
                            isLoading={isMutating}
                        />
                    </Box>
                ),
            });
        }

        return cols;
    }, [
        canManageProjectAccess,
        getRoleName,
        handleRoleChange,
        handleDelete,
        isMutating,
        groupedRolesData,
    ]);

    const table = useMantineReactTable({
        columns,
        data: enrichedUsers,
        enableColumnResizing: false,
        enableRowNumbers: false,
        enablePagination: true,
        paginationDisplayMode: 'pages',
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableGlobalFilterModes: false,
        enableSorting: false,
        enableRowVirtualization: false,
        enableTopToolbar: true,
        enableBottomToolbar: true,
        mantinePaperProps: {
            shadow: undefined,
            style: {
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        mantineTableHeadRowProps: {
            style: {
                boxShadow: 'none',
            },
        },
        mantineTableContainerProps: {
            style: { maxHeight: 'calc(100dvh - 420px)' },
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(enrichedUsers.length),
        },
        mantinePaginationProps: {
            showRowsPerPage: false,
            color: 'dark',
            size: 'sm',
        },
        mantineTableHeadCellProps: (props) => {
            const isLastColumn =
                props.table.getAllColumns().indexOf(props.column) ===
                props.table.getAllColumns().length - 1;

            return {
                bg: 'ldGray.0',
                h: '3xl',
                pos: 'relative',
                style: {
                    userSelect: 'none',
                    padding: `${theme.spacing.xs} ${theme.spacing.xl}`,
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                    borderRight: props.column.getIsResizing()
                        ? `2px solid ${theme.colors.blue[3]}`
                        : `1px solid ${
                              isLastColumn
                                  ? 'transparent'
                                  : theme.colors.ldGray[2]
                          }`,
                    borderTop: 'none',
                    borderLeft: 'none',
                },
            };
        },
        mantineTableBodyCellProps: () => {
            return {
                style: {
                    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
                    borderRight: 'none',
                    borderLeft: 'none',
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                    borderTop: 'none',
                },
            };
        },
        renderTopToolbar: () => (
            <Group
                justify="space-between"
                p={`${theme.spacing.sm} ${theme.spacing.md}`}
                wrap="nowrap"
            >
                <Group gap="xs" wrap="nowrap">
                    <Tooltip
                        withinPortal
                        variant="xs"
                        label="Search by name, email, or role"
                    >
                        <TextInput
                            data-testid="project-access-search-input"
                            size="xs"
                            radius="md"
                            type="search"
                            variant="default"
                            placeholder="Search users by name, email, or role"
                            value={search}
                            leftSection={
                                <MantineIcon
                                    size="md"
                                    color="ldGray.6"
                                    icon={IconSearch}
                                />
                            }
                            onChange={(e) => setSearch(e.target.value)}
                            rightSection={
                                search && (
                                    <ActionIcon
                                        onClick={() => setSearch('')}
                                        variant="transparent"
                                        size="xs"
                                        color="ldGray.5"
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                )
                            }
                            miw={350}
                            maw={400}
                        />
                    </Tooltip>
                </Group>

                <Group gap="xs" wrap="nowrap">
                    {canManageProjectAccess && (
                        <Button
                            size="xs"
                            leftSection={<MantineIcon icon={IconPlus} />}
                            onClick={() => setIsAddingProjectAccess(true)}
                        >
                            Add user access
                        </Button>
                    )}
                    {hiddenMembersCount > 0 && (
                        <Menu withinPortal position="bottom-end">
                            <Menu.Target>
                                <Tooltip withinPortal label="View options">
                                    <ActionIcon
                                        variant="subtle"
                                        color="ldGray.6"
                                        size="sm"
                                    >
                                        <MantineIcon icon={IconDotsVertical} />
                                    </ActionIcon>
                                </Tooltip>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item
                                    leftSection={
                                        showMembersOnly ? (
                                            <MantineIcon
                                                icon={IconCheck}
                                                size="sm"
                                            />
                                        ) : (
                                            <Box w={16} />
                                        )
                                    }
                                    onClick={() =>
                                        setShowMembersOnly(!showMembersOnly)
                                    }
                                >
                                    Show members ({hiddenMembersCount})
                                </Menu.Item>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon
                                            icon={IconInfoCircle}
                                            size="sm"
                                            color="ldGray.6"
                                        />
                                    }
                                    disabled
                                >
                                    <Text size="xs" c="ldGray.6" maw={260}>
                                        Members have no project access by
                                        default. They only see content if given
                                        a role at project or group level.
                                    </Text>
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    )}
                </Group>
            </Group>
        ),
        icons: {
            IconArrowsSort: () => (
                <MantineIcon icon={IconArrowsSort} size="md" color="ldGray.5" />
            ),
            IconSortAscending: () => (
                <MantineIcon icon={IconArrowUp} size="md" color="blue.6" />
            ),
            IconSortDescending: () => (
                <MantineIcon icon={IconArrowDown} size="md" color="blue.6" />
            ),
        },
        state: {
            isLoading:
                isLoading ||
                isLoadingOrganizationRoles ||
                isLoadingOrganizationRoleAssignments,
            density: 'md',
        },
    });

    return (
        <>
            <MantineReactTable table={table} />

            {isAddingProjectAccess && (
                <CreateProjectAccessModal
                    projectUuid={projectUuid}
                    roles={rolesData || []}
                    onClose={() => setIsAddingProjectAccess(false)}
                />
            )}
        </>
    );
};

export default ProjectAccess;
