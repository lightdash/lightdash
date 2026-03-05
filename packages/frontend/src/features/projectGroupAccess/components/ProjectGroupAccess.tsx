import { subject } from '@casl/ability';
import {
    FeatureFlags,
    isGroupWithMembers,
    type CreateProjectGroupAccess,
    type GroupWithMembers,
    type ProjectGroupAccess,
    type Role,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconPlus,
    IconTrash,
    IconUsersGroup,
} from '@tabler/icons-react';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
} from 'mantine-react-table';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import useToaster from '../../../hooks/toaster/useToaster';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useOrganizationRoles } from '../../../hooks/useOrganizationRoles';
import {
    useDeleteProjectGroupRoleAssignmentMutation,
    useProjectGroupRoleAssignments,
    useUpsertProjectGroupRoleAssignmentMutation,
} from '../../../hooks/useProjectGroupRoles';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';
import { TrackPage } from '../../../providers/Tracking/TrackingProvider';
import { CategoryName, PageName, PageType } from '../../../types/Events';
import AddProjectGroupAccessModal from './AddProjectGroupAccessModal';
import RevokeProjectGroupAccessModal from './RevokeProjectGroupAccessModal';

// --- Enriched row type ---

type EnrichedGroupRow = {
    projectUuid: string;
    groupUuid: string;
    role: string;
    group: GroupWithMembers;
    currentRoleUuid: string;
};

// --- Action cell sub-component (needs local state for modal) ---

type GroupAccessActionCellProps = {
    row: EnrichedGroupRow;
    canManageProjectAccess: boolean;
    isLoading: boolean;
    onDelete: (groupUuid: string) => void;
};

const GroupAccessActionCell: FC<GroupAccessActionCellProps> = ({
    row,
    canManageProjectAccess,
    isLoading,
    onDelete,
}) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    if (!canManageProjectAccess) return null;

    return (
        <>
            <Tooltip position="top" label="Remove group access">
                <ActionIcon
                    disabled={!canManageProjectAccess || isLoading}
                    variant="outline"
                    color="red"
                    size="sm"
                    onClick={() => setIsDeleteDialogOpen(true)}
                >
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Tooltip>

            {isDeleteDialogOpen && (
                <RevokeProjectGroupAccessModal
                    group={row.group}
                    onDelete={() => {
                        onDelete(row.groupUuid);
                        setIsDeleteDialogOpen(false);
                    }}
                    onClose={() => setIsDeleteDialogOpen(false)}
                />
            )}
        </>
    );
};

// --- Main component ---

interface ProjectGroupAccessProps {
    projectUuid: string;
}

const ProjectGroupAccessComponent: FC<ProjectGroupAccessProps> = ({
    projectUuid,
}) => {
    const theme = useMantineTheme();
    const { user } = useApp();
    const ability = useAbilityContext();
    const { showToastSuccess } = useToaster();

    const [isAddingGroupAccess, setIsAddingGroupAccess] = useState(false);

    const userGroupsFeatureFlagQuery = useServerFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    if (userGroupsFeatureFlagQuery.isError) {
        console.error(userGroupsFeatureFlagQuery.error);
        throw new Error('Error fetching user groups feature flag');
    }

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.isSuccess &&
        userGroupsFeatureFlagQuery.data.enabled;

    const { data: groups } = useOrganizationGroups(
        { includeMembers: 5 },
        { enabled: isGroupManagementEnabled },
    );

    const {
        data: projectGroupRoleAssignments,
        isInitialLoading: isLoadingProjectGroupAccessList,
    } = useProjectGroupRoleAssignments(projectUuid);

    // Convert v2 role assignments to legacy ProjectGroupAccess format for UI compatibility
    const projectGroupAccessList = useMemo(() => {
        if (!projectGroupRoleAssignments) return [];

        return projectGroupRoleAssignments.map(
            (assignment): ProjectGroupAccess => ({
                projectUuid,
                groupUuid: assignment.assigneeId,
                role: assignment.roleId, // Use roleId (UUID) instead of roleName for custom roles
            }),
        );
    }, [projectGroupRoleAssignments, projectUuid]);

    const { data: organizationRoles } = useOrganizationRoles();

    const rolesData = useMemo(() => {
        if (!organizationRoles) return [];

        const systemRoles: { value: string; label: string }[] = [];
        const customRoles: { value: string; label: string }[] = [];

        organizationRoles.forEach(
            (role: Pick<Role, 'roleUuid' | 'name' | 'ownerType'>) => {
                const item = { value: role.roleUuid, label: role.name };
                if (role.ownerType === 'system') {
                    systemRoles.push(item);
                } else {
                    customRoles.push(item);
                }
            },
        );

        const roleGroups: {
            group: string;
            items: { value: string; label: string }[];
        }[] = [];

        if (systemRoles.length > 0) {
            roleGroups.push({ group: 'System role', items: systemRoles });
        }
        if (customRoles.length > 0) {
            roleGroups.push({ group: 'Custom role', items: customRoles });
        }

        return roleGroups;
    }, [organizationRoles]);

    // Flatten roles for lookup
    const allRoles = useMemo(
        () => rolesData.flatMap((g) => g.items),
        [rolesData],
    );

    const canManageProjectAccess = ability.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    // Mutations
    const { mutateAsync: addProjectGroupAccess, isLoading: isSubmitting } =
        useUpsertProjectGroupRoleAssignmentMutation(projectUuid);

    const { mutateAsync: removeProjectGroupAccess, isLoading: isDeleting } =
        useDeleteProjectGroupRoleAssignmentMutation(projectUuid);

    const isMutating = isSubmitting || isDeleting;

    const handleAddProjectGroupAccess = async (
        formData: CreateProjectGroupAccess,
    ) => {
        await addProjectGroupAccess({
            groupId: formData.groupUuid,
            roleId: formData.role,
        });
        showToastSuccess({ title: 'Group access added' });
        setIsAddingGroupAccess(false);
    };

    const handleRoleChange = useCallback(
        async (groupUuid: string, newRoleUuid: string | null) => {
            if (!canManageProjectAccess || !newRoleUuid) return;

            await addProjectGroupAccess({
                groupId: groupUuid,
                roleId: newRoleUuid,
            });
        },
        [canManageProjectAccess, addProjectGroupAccess],
    );

    const handleDelete = useCallback(
        async (groupUuid: string) => {
            await removeProjectGroupAccess(groupUuid);
        },
        [removeProjectGroupAccess],
    );

    const availableGroups = useMemo(() => {
        if (!groups || !projectGroupAccessList) return [];

        return groups
            .map((g) => {
                if (isGroupWithMembers(g)) {
                    return g;
                }
            })
            .filter((g): g is GroupWithMembers => {
                return Boolean(
                    g &&
                    isGroupWithMembers(g) &&
                    !projectGroupAccessList?.find((access) => {
                        return access.groupUuid === g.uuid;
                    }),
                );
            });
    }, [groups, projectGroupAccessList]);

    // Enrich group access data with group info and resolved role UUID
    const enrichedGroups: EnrichedGroupRow[] = useMemo(() => {
        if (!projectGroupAccessList || !groups) return [];

        return projectGroupAccessList
            .map((access) => {
                const group = groups.find((g) => g.uuid === access.groupUuid);
                if (!group || !isGroupWithMembers(group)) return null;

                const roleData = allRoles.find(
                    (role) =>
                        role.value === access.role ||
                        role.label === access.role,
                );
                const currentRoleUuid = roleData?.value || access.role;

                return {
                    projectUuid: access.projectUuid,
                    groupUuid: access.groupUuid,
                    role: access.role,
                    group,
                    currentRoleUuid,
                };
            })
            .filter((row): row is EnrichedGroupRow => row !== null);
    }, [projectGroupAccessList, groups, allRoles]);

    const columns: MRT_ColumnDef<EnrichedGroupRow>[] = useMemo(() => {
        const cols: MRT_ColumnDef<EnrichedGroupRow>[] = [
            {
                accessorKey: 'groupUuid',
                header: 'Group Name',
                enableSorting: false,
                size: 300,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconUsersGroup} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const r = row.original;
                    return (
                        <Stack gap="xxs" align="flex-start">
                            <Text fw={600} fz="sm">
                                {r.group.name}
                            </Text>
                            <Badge variant="light" color="gray">
                                {r.group.members.length} member
                                {r.group.members.length !== 1 ? 's' : ''}
                            </Badge>
                        </Stack>
                    );
                },
            },
            {
                accessorKey: 'role',
                header: 'Group Role',
                enableSorting: false,
                size: 300,
                Cell: ({ row }) => {
                    const r = row.original;
                    return (
                        <Select
                            id={`group-role-${r.groupUuid}`}
                            w={250}
                            size="xs"
                            disabled={isMutating || !canManageProjectAccess}
                            data={rolesData}
                            value={r.currentRoleUuid}
                            onChange={(newRoleUuid) =>
                                handleRoleChange(r.groupUuid, newRoleUuid)
                            }
                        />
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
                        <GroupAccessActionCell
                            row={row.original}
                            canManageProjectAccess={canManageProjectAccess}
                            isLoading={isMutating}
                            onDelete={handleDelete}
                        />
                    </Box>
                ),
            });
        }

        return cols;
    }, [
        canManageProjectAccess,
        handleRoleChange,
        handleDelete,
        isMutating,
        rolesData,
    ]);

    const table = useMantineReactTable({
        columns,
        data: enrichedGroups,
        enableColumnResizing: false,
        enableRowNumbers: false,
        enablePagination: true,
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
            style: { maxHeight: 'calc(100dvh - 300px)' },
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(enrichedGroups.length),
        },
        mantinePaginationProps: {
            showRowsPerPage: false,
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
                    padding: `${theme.spacing.xs} ${theme.spacing.xl}`,
                    borderRight: 'none',
                    borderLeft: 'none',
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                    borderTop: 'none',
                },
            };
        },
        renderTopToolbar: () => (
            <Group
                justify="flex-end"
                p={`${theme.spacing.sm} ${theme.spacing.md}`}
                wrap="nowrap"
            >
                {canManageProjectAccess && (
                    <Button
                        size="xs"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={() => setIsAddingGroupAccess(true)}
                    >
                        Add group access
                    </Button>
                )}
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
            isLoading: isLoadingProjectGroupAccessList,
            density: 'xs',
        },
        renderEmptyRowsFallback: () => (
            <Box p="4xl">
                <SuboptimalState
                    icon={IconUsersGroup}
                    title="No group found with access to this project"
                    description={
                        'Click "Add group access" to add a group to this project'
                    }
                />
            </Box>
        ),
    });

    return (
        <TrackPage
            name={PageName.PROJECT_MANAGE_GROUP_ACCESS}
            type={PageType.PAGE}
            category={CategoryName.SETTINGS}
        >
            <MantineReactTable table={table} />

            {availableGroups && isAddingGroupAccess && (
                <AddProjectGroupAccessModal
                    projectUuid={projectUuid}
                    totalNumberOfGroups={groups?.length || 0}
                    availableGroups={availableGroups}
                    organizationRoles={rolesData}
                    isSubmitting={isSubmitting}
                    onSubmit={handleAddProjectGroupAccess}
                    onClose={() => setIsAddingGroupAccess(false)}
                />
            )}
        </TrackPage>
    );
};

export default ProjectGroupAccessComponent;
