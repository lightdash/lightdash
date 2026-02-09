import { subject } from '@casl/ability';
import {
    isGroupWithMembers,
    OrganizationMemberRole,
    type GroupWithMembers,
    type Group as LightdashGroup,
    type Role,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconTrash,
    IconUserCircle,
} from '@tabler/icons-react';
import Fuse from 'fuse.js';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
} from 'mantine-react-table';
import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
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
import LoadingState from '../common/LoadingState';
import MantineIcon from '../common/MantineIcon';
import CreateProjectAccessModal from './CreateProjectAccessModal';
import { ProjectAccessTopToolbar } from './ProjectAccessTopToolbar';
import RemoveProjectAccessModal from './RemoveProjectAccessModal';

interface ProjectAccessProps {
    projectUuid: string;
    isAddingProjectAccess: boolean;
    onAddProjectAccessOpen: () => void;
    onAddProjectAccessClose: () => void;
}

interface ProjectAccessTableUser extends ProjectUserWithRoleV2 {
    userGroupAccesses: UserGroupAccess[];
    highestRole: string;
    highestRoleType: string;
    hasProjectRole: boolean;
    organizationRole: string | undefined;
    accessWarning: string | null;
}

const ProjectAccess: FC<ProjectAccessProps> = ({
    projectUuid,
    isAddingProjectAccess,
    onAddProjectAccessOpen,
    onAddProjectAccessClose,
}) => {
    const theme = useMantineTheme();
    const { user } = useApp();
    const ability = useAbilityContext();
    const tableContainerRef = useRef<HTMLDivElement>(null);

    const [search, setSearch] = useState('');
    const [userToDelete, setUserToDelete] = useState<ProjectAccessTableUser | null>(null);

    // Debounce search to avoid excessive filtering
    const debouncedSearch = useMemo(() => ({ search }), [search]);
    const [debouncedSearchValue] = useDebouncedValue(debouncedSearch, 300);

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

    const upsertMutation = useUpsertProjectUserRoleAssignmentMutation(projectUuid);
    const deleteMutation = useDeleteProjectUserRoleAssignmentMutation(projectUuid);

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

    const canManageProjectAccess = ability.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    // Enrich users with computed properties for display
    const enrichedUsers = useMemo((): ProjectAccessTableUser[] => {
        if (!usersWithProjectRole) return [];

        return usersWithProjectRole.map((u) => {
            const hasProjectRole = !!u.projectRole;
            const organizationRole = organizationRoleAssignments?.find(
                (assignment) =>
                    assignment.assigneeType === 'user' &&
                    assignment.assigneeId === u.userUuid,
            )?.roleId;

            // Find groups the user belongs to that have project access
            const userGroupAccesses: UserGroupAccess[] = (() => {
                if (!organizationGroups || !groupRoles) return [];

                const userGroups = organizationGroups.filter((group: LightdashGroup | GroupWithMembers) => {
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
                                  group,
                                  access: groupAccess,
                                  roleName: groupAccess.roleName,
                              }
                            : null;
                    })
                    .filter((item): item is UserGroupAccess => item !== null);
            })();

            // Calculate highest role
            let bestRole = organizationRole || 'member';
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
                organizationRole,
                hasProjectRole,
                projectRole: u.projectRole,
                userGroupAccesses,
            });

            return {
                ...u,
                userGroupAccesses,
                highestRole: bestRole,
                highestRoleType: bestSource,
                hasProjectRole,
                organizationRole,
                accessWarning,
            };
        });
    }, [usersWithProjectRole, organizationRoleAssignments, organizationGroups, groupRoles]);

    // Filter users based on search
    const filteredUsers = useMemo(() => {
        if (debouncedSearchValue.search && enrichedUsers.length > 0) {
            return new Fuse(enrichedUsers, {
                keys: ['firstName', 'lastName', 'email', 'role', 'projectRole'],
                ignoreLocation: true,
                threshold: 0.3,
            })
                .search(debouncedSearchValue.search)
                .map((result) => result.item);
        }
        return enrichedUsers;
    }, [enrichedUsers, debouncedSearchValue.search]);

    // Scroll to top when search changes
    useEffect(() => {
        if (tableContainerRef.current) {
            tableContainerRef.current.scrollTop = 0;
        }
    }, [debouncedSearchValue]);

    const handleRoleChange = useCallback(
        (userUuid: string, newRoleUuid: string | null) => {
            if (newRoleUuid === 'member') {
                // We can't set 'member' as project role, this is a special organization role
                return;
            }
            if (!canManageProjectAccess || !newRoleUuid) return;

            upsertMutation.mutate({
                userId: userUuid,
                roleId: newRoleUuid,
            });
        },
        [canManageProjectAccess, upsertMutation],
    );

    const handleDelete = useCallback(() => {
        if (!canManageProjectAccess || !userToDelete) return;

        deleteMutation.mutate(userToDelete.userUuid);
        setUserToDelete(null);
    }, [canManageProjectAccess, deleteMutation, userToDelete]);

    // Helper function to get role name from roleId
    const getRoleName = useCallback(
        (roleId: string) => {
            const role = rolesData?.find((r) => r.value === roleId);
            return role?.label || roleId;
        },
        [rolesData],
    );

    const columns: MRT_ColumnDef<ProjectAccessTableUser>[] = useMemo(() => {
        const cols: MRT_ColumnDef<ProjectAccessTableUser>[] = [
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

                    const userRoleSummary = (
                        <Stack gap="xxs">
                            <Text fz="xs" fw={300}>
                                Organization role:{' '}
                                <Text fw={600} span>
                                    {getRoleName(u.organizationRole || '')}
                                </Text>
                            </Text>
                            {(u.userGroupAccesses || []).map((uga) => (
                                <Text key={uga.group.uuid} fz="xs" fw={300}>
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
                                <Text fz="xs" fw={300}>
                                    Project role:{' '}
                                    <Text fw={600} span>
                                        {u.projectRole}
                                    </Text>
                                </Text>
                            )}
                        </Stack>
                    );

                    return (
                        <Tooltip label={userRoleSummary}>
                            <Stack gap="xxs" align="flex-start">
                                {u.firstName && (
                                    <Text fw={600} fz="sm">
                                        {u.firstName} {u.lastName}
                                    </Text>
                                )}
                                {u.email && (
                                    <Badge
                                        variant="filled"
                                        color="ldGray.2"
                                        radius="xs"
                                        style={{ textTransform: 'none' }}
                                        px="xxs"
                                    >
                                        <Text fz="xs" fw={400} c="ldGray.8">
                                            {u.email}
                                        </Text>
                                    </Badge>
                                )}
                            </Stack>
                        </Tooltip>
                    );
                },
            },
            {
                accessorKey: 'projectRole',
                header: 'Role',
                enableSorting: false,
                size: 350,
                Cell: ({ row }) => {
                    const u = row.original;
                    const isMember = u.role === OrganizationMemberRole.MEMBER;
                    const isLoading = upsertMutation.isLoading || deleteMutation.isLoading;

                    const currentRoleUuid = u.hasProjectRole
                        ? rolesData?.find((role) => role.value === u.projectRole)?.value
                        : undefined;

                    return (
                        <Group gap="xs">
                            <Tooltip
                                disabled={u.hasProjectRole}
                                label={
                                    <Text fz="xs">
                                        User inherits this role from{' '}
                                        <Text span fw={600}>
                                            {u.highestRoleType}
                                        </Text>
                                    </Text>
                                }
                            >
                                <Select
                                    id={`user-role-${u.userUuid}`}
                                    w={280}
                                    size="xs"
                                    disabled={isLoading || !canManageProjectAccess}
                                    data={
                                        isMember && !u.hasProjectRole
                                            ? [
                                                  {
                                                      value: 'member',
                                                      label: 'member',
                                                      group: 'Organization role',
                                                  },
                                                  ...(rolesData || []),
                                              ]
                                            : rolesData || []
                                    }
                                    value={currentRoleUuid || u.highestRole}
                                    onChange={(value) => handleRoleChange(u.userUuid, value)}
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
                size: 60,
                Cell: ({ row }) => {
                    const u = row.original;
                    const isLoading = upsertMutation.isLoading || deleteMutation.isLoading;

                    return (
                        <Box
                            component="div"
                            onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                                e.stopPropagation();
                                e.preventDefault();
                            }}
                        >
                            <Tooltip
                                position="top"
                                label={
                                    u.hasProjectRole
                                        ? 'Revoke project access'
                                        : 'Cannot revoke inherited access from Organization'
                                }
                            >
                                <ActionIcon
                                    disabled={!u.hasProjectRole || isLoading}
                                    variant="outline"
                                    color="red"
                                    onClick={() => setUserToDelete(u)}
                                >
                                    <MantineIcon icon={IconTrash} />
                                </ActionIcon>
                            </Tooltip>
                        </Box>
                    );
                },
            });
        }

        return cols;
    }, [
        canManageProjectAccess,
        rolesData,
        upsertMutation.isLoading,
        deleteMutation.isLoading,
        handleRoleChange,
        getRoleName,
    ]);

    const table = useMantineReactTable({
        columns,
        data: filteredUsers,
        enableColumnResizing: false,
        enableRowNumbers: false,
        enablePagination: false,
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableGlobalFilterModes: false,
        enableSorting: false,
        enableRowVirtualization: true,
        enableTopToolbar: true,
        enableBottomToolbar: false,
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
            ref: tableContainerRef,
            style: { maxHeight: 'calc(100dvh - 420px)' },
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(filteredUsers.length),
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
            <ProjectAccessTopToolbar
                search={search}
                setSearch={setSearch}
                isFetching={isLoading}
                currentResultsCount={filteredUsers.length}
                canManageProjectAccess={canManageProjectAccess}
                onAddUserClick={onAddProjectAccessOpen}
            />
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
        rowVirtualizerProps: { overscan: 10 },
        state: {
            isLoading: isLoading || isLoadingOrganizationRoles || isLoadingOrganizationRoleAssignments,
            showProgressBars: isLoading,
            density: 'md',
        },
    });

    if (isLoading || isLoadingOrganizationRoles || isLoadingOrganizationRoleAssignments) {
        return <LoadingState title="Loading user access" />;
    }

    return (
        <>
            <MantineReactTable table={table} />

            {isAddingProjectAccess && (
                <CreateProjectAccessModal
                    projectUuid={projectUuid}
                    roles={rolesData || []}
                    onClose={() => onAddProjectAccessClose()}
                />
            )}

            {userToDelete && (
                <RemoveProjectAccessModal
                    user={{
                        firstName: userToDelete.firstName,
                        lastName: userToDelete.lastName,
                        email: userToDelete.email,
                    }}
                    onDelete={handleDelete}
                    onClose={() => setUserToDelete(null)}
                />
            )}
        </>
    );
};

export default ProjectAccess;
