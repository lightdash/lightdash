import {
    FeatureFlags,
    isOrganizationMemberProfileWithGroups,
    OrganizationMemberRole,
    OrganizationMemberRoleLabels,
    type OrganizationMemberProfile,
    type OrganizationMemberProfileWithGroups,
    type OrganizationRoleSet,
    type Role,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Group,
    HoverCard,
    List,
    Select,
    Stack,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconUserCircle } from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { OrganizationRoleSetCell } from '../../../features/roleSets/components/OrganizationRoleSetCell';
import {
    useMultipleRolesEnabled,
    useReplaceOrganizationUserRoleSetMutation,
} from '../../../features/roleSets/hooks/useRoleSets';
import { useInfiniteScroll } from '../../../hooks/useInfiniteScroll';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import {
    useOrganizationRoles,
    useUpsertOrganizationUserRoleAssignmentMutation,
} from '../../../hooks/useOrganizationRoles';
import { useInfiniteOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
    type ContentTableVirtualizer,
} from '../../common/ContentTable';
import MantineIcon from '../../common/MantineIcon';
import ConfirmAdminSelfDowngradeModal from './ConfirmAdminSelfDowngradeModal';
import InviteSuccess from './InviteSuccess';
import UsersActionMenu from './UsersActionMenu';
import { UsersTopToolbar } from './UsersTopToolbar';

const fetchSize = 50;

type PendingRoleChange =
    | { userId: string; roleId: string }
    | { userId: string; roleSet: OrganizationRoleSet };

const UsersTable: FC = () => {
    const theme = useMantineTheme();
    const { user: activeUser } = useApp();
    const rowVirtualizerInstanceRef =
        useRef<ContentTableVirtualizer<HTMLDivElement, HTMLTableRowElement>>(
            null,
        );

    const [search, setSearch] = useState('');
    const inviteLink = useCreateInviteLinkMutation();
    const [inviteSuccessFor, setInviteSuccessFor] = useState<string | null>(
        null,
    );
    const [pendingRoleChange, setPendingRoleChange] =
        useState<PendingRoleChange | null>(null);

    // Callback to handle when an invite is sent
    const handleInviteSent = useCallback((userUuid: string) => {
        setInviteSuccessFor(userUuid);
    }, []);

    const userGroupsFeatureFlagQuery = useServerFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.isSuccess &&
        userGroupsFeatureFlagQuery.data.enabled;

    // Debounce search to avoid too many API calls
    const debouncedSearch = useMemo(() => {
        return { search };
    }, [search]);

    const [debouncedSearchValue] = useDebouncedValue(debouncedSearch, 300);

    // Use infinite query for pagination
    const { data, fetchNextPage, hasNextPage, isError, isFetching, isLoading } =
        useInfiniteOrganizationUsers({
            searchInput: debouncedSearchValue.search,
            includeGroups: isGroupManagementEnabled ? 10000 : undefined,
            pageSize: fetchSize,
        });

    const flatData = useMemo<
        (OrganizationMemberProfile | OrganizationMemberProfileWithGroups)[]
    >(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);

    const totalDBRowCount = data?.pages?.[0]?.pagination?.totalResults ?? 0;
    const totalFetched = flatData.length;

    const {
        containerRef: tableContainerRef,
        onScroll,
        scrollToTop,
    } = useInfiniteScroll({
        fetchNextPage,
        isFetching,
        hasMore: totalFetched < totalDBRowCount,
        threshold: 400,
    });

    // Scroll to top when search changes
    useEffect(() => {
        scrollToTop();
    }, [debouncedSearchValue, scrollToTop]);

    const updateUserRole = useUpsertOrganizationUserRoleAssignmentMutation();
    const replaceRoleSet = useReplaceOrganizationUserRoleSetMutation();
    const multipleRolesEnabled = useMultipleRolesEnabled();
    const organizationRolesQuery = useOrganizationRoles();

    const handleRoleChange = useCallback(
        (user: OrganizationMemberProfile, newRole: string) => {
            const isCurrentUser = activeUser.data?.userUuid === user.userUuid;
            const isAdminSelfDowngrade =
                isCurrentUser &&
                user.role === OrganizationMemberRole.ADMIN &&
                newRole !== OrganizationMemberRole.ADMIN;

            if (isAdminSelfDowngrade) {
                setPendingRoleChange({
                    userId: user.userUuid,
                    roleId: newRole,
                });
                return;
            }

            updateUserRole.mutate({
                userId: user.userUuid,
                roleId: newRole,
            });
        },
        [activeUser.data?.userUuid, updateUserRole],
    );

    const handleRoleSetChange = useCallback(
        (user: OrganizationMemberProfile, roleSet: OrganizationRoleSet) => {
            const isCurrentUser = activeUser.data?.userUuid === user.userUuid;
            const isAdminSelfDowngrade =
                isCurrentUser &&
                user.role === OrganizationMemberRole.ADMIN &&
                roleSet.systemRole !== OrganizationMemberRole.ADMIN;

            if (isAdminSelfDowngrade) {
                setPendingRoleChange({ userId: user.userUuid, roleSet });
                return;
            }
            replaceRoleSet.mutate({ userUuid: user.userUuid, roleSet });
        },
        [activeUser.data?.userUuid, replaceRoleSet],
    );

    const handleConfirmAdminSelfDowngrade = useCallback(() => {
        if (!pendingRoleChange) {
            return;
        }
        const onSuccess = () => setPendingRoleChange(null);
        if ('roleSet' in pendingRoleChange) {
            replaceRoleSet.mutate(
                {
                    userUuid: pendingRoleChange.userId,
                    roleSet: pendingRoleChange.roleSet,
                },
                { onSuccess },
            );
            return;
        }
        updateUserRole.mutate(pendingRoleChange, { onSuccess });
    }, [pendingRoleChange, updateUserRole, replaceRoleSet]);

    const organizationRoleOptions = useMemo(() => {
        const systemRoles = Object.values(OrganizationMemberRole).map(
            (orgMemberRole) => ({
                value: orgMemberRole,
                label: OrganizationMemberRoleLabels[orgMemberRole],
            }),
        );
        const customRoles =
            organizationRolesQuery.data
                ?.filter(
                    (role: Role) =>
                        role.ownerType === 'user' &&
                        role.level === 'organization',
                )
                .map((role: Role) => ({
                    value: role.roleUuid,
                    label: role.name,
                })) ?? [];

        return customRoles.length > 0
            ? [
                  { group: 'System roles', items: systemRoles },
                  { group: 'Custom roles', items: customRoles },
              ]
            : systemRoles;
    }, [organizationRolesQuery.data]);

    const canManageUsers =
        activeUser.data?.ability?.can('manage', 'OrganizationMemberProfile') ??
        false;
    const canInvite =
        activeUser.data?.ability?.can('create', 'InviteLink') ?? false;
    const canImpersonate =
        activeUser.data?.ability?.can('impersonate', 'User') ?? false;
    const showActions = canManageUsers || canInvite || canImpersonate;

    const columns: ContentTableColumnDef<
        OrganizationMemberProfile | OrganizationMemberProfileWithGroups
    >[] = useMemo(() => {
        const cols: ContentTableColumnDef<
            OrganizationMemberProfile | OrganizationMemberProfileWithGroups
        >[] = [
            {
                accessorKey: 'email',
                header: 'User',
                enableSorting: false,
                size: 300,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconUserCircle} color="dimmed" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const user = row.original;
                    const showInviteSuccess =
                        inviteLink.data &&
                        inviteSuccessFor === user.userUuid &&
                        user.isPending;

                    return (
                        <Stack gap="xs">
                            {!user.isActive ? (
                                <Stack gap="xxs" align="flex-start">
                                    <Text fw={600} fz="sm" c="dimmed">
                                        {user.firstName
                                            ? `${user.firstName} ${user.lastName}`
                                            : user.email}
                                    </Text>
                                    <Badge color="red">Inactive</Badge>
                                </Stack>
                            ) : user.isPending ? (
                                <Stack gap="xxs" align="flex-start">
                                    {user.email && (
                                        <Text fw={600} fz="sm">
                                            {user.email}
                                        </Text>
                                    )}
                                    <Group gap="xs">
                                        <Badge color="orange">
                                            {!user.isInviteExpired
                                                ? 'Pending'
                                                : 'Link expired'}
                                        </Badge>
                                    </Group>
                                </Stack>
                            ) : (
                                <Stack gap="xxs" align="flex-start">
                                    <Text fw={600} fz="sm">
                                        {user.firstName} {user.lastName}
                                    </Text>

                                    {user.email && <Badge>{user.email}</Badge>}
                                </Stack>
                            )}
                            {showInviteSuccess && (
                                <Box mt="xs">
                                    <InviteSuccess
                                        invite={inviteLink.data}
                                        onClose={() =>
                                            setInviteSuccessFor(null)
                                        }
                                    />
                                </Box>
                            )}
                        </Stack>
                    );
                },
            },
        ];

        if (canManageUsers) {
            cols.push({
                accessorKey: 'role',
                header: 'Role',
                enableSorting: false,
                size: 200,
                Cell: ({ row }) => {
                    const user = row.original;
                    if (multipleRolesEnabled) {
                        return (
                            <OrganizationRoleSetCell
                                user={user}
                                organizationRoles={organizationRolesQuery.data}
                                disabled={
                                    organizationRolesQuery.isLoading ||
                                    replaceRoleSet.isLoading
                                }
                                onChange={(roleSet) =>
                                    handleRoleSetChange(user, roleSet)
                                }
                            />
                        );
                    }
                    return (
                        <Select
                            data={organizationRoleOptions}
                            onChange={(newRole: string | null) => {
                                if (newRole) {
                                    handleRoleChange(user, newRole);
                                }
                            }}
                            value={user.roleUuid ?? user.role}
                            disabled={organizationRolesQuery.isLoading}
                            w={180}
                            size="xs"
                        />
                    );
                },
            });

            if (isGroupManagementEnabled) {
                cols.push({
                    accessorKey: 'groups',
                    header: 'Groups',
                    enableSorting: false,
                    size: 120,
                    Cell: ({ row }) => {
                        const user = row.original;
                        if (
                            !isOrganizationMemberProfileWithGroups(user) ||
                            !user.groups
                        ) {
                            return (
                                <Text fz="sm" c="dimmed">
                                    0 groups
                                </Text>
                            );
                        }

                        return (
                            <HoverCard disabled={user.groups.length < 1}>
                                <HoverCard.Target>
                                    <Text fz="sm" c="dimmed">
                                        {`${user.groups.length} group${
                                            user.groups.length !== 1 ? 's' : ''
                                        }`}
                                    </Text>
                                </HoverCard.Target>
                                <HoverCard.Dropdown p="sm">
                                    <Text fz="xs" fw={600} c="dimmed">
                                        User groups:
                                    </Text>
                                    <List size="xs" ml="xs" mt="xs" fz="xs">
                                        {user.groups.map((group) => (
                                            <List.Item key={group.name}>
                                                {group.name}
                                            </List.Item>
                                        ))}
                                    </List>
                                </HoverCard.Dropdown>
                            </HoverCard>
                        );
                    },
                });
            }
        }

        if (showActions) {
            cols.push({
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 50,
                Cell: ({ row }) => {
                    const user = row.original;
                    const isCurrentUser =
                        activeUser.data?.userUuid === user.userUuid;
                    const disabled = isCurrentUser || flatData.length < 1;

                    return (
                        <Box
                            component="div"
                            onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                                e.stopPropagation();
                                e.preventDefault();
                            }}
                        >
                            <UsersActionMenu
                                user={user}
                                disabled={disabled}
                                canInvite={canInvite}
                                canDelete={canManageUsers}
                                inviteLink={inviteLink}
                                onInviteSent={handleInviteSent}
                            />
                        </Box>
                    );
                },
            });
        }

        return cols;
    }, [
        canManageUsers,
        showActions,
        inviteLink,
        inviteSuccessFor,
        isGroupManagementEnabled,
        handleRoleChange,
        handleRoleSetChange,
        multipleRolesEnabled,
        replaceRoleSet.isLoading,
        organizationRoleOptions,
        organizationRolesQuery.data,
        organizationRolesQuery.isLoading,
        activeUser.data?.userUuid,
        flatData.length,
        canInvite,
        handleInviteSent,
    ]);

    const table = useContentTable({
        columns,
        data: flatData,
        enableColumnResizing: false,
        enablePagination: false,
        enableSorting: false,
        enableRowVirtualization: true,
        enableTopToolbar: true,
        mantineTableContainerProps: {
            ref: tableContainerRef,
            style: { maxHeight: 'calc(100dvh - 420px)' },
            onScroll,
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(flatData.length),
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
            <UsersTopToolbar search={search} setSearch={setSearch} />
        ),
        renderBottomToolbar: () => (
            <Box
                p={`${theme.spacing.sm} ${theme.spacing.xl} ${theme.spacing.md} ${theme.spacing.xl}`}
                fz="xs"
                fw={500}
                c="ldGray.8"
                style={{
                    borderTop: `1px solid ${theme.colors.ldGray[3]}`,
                }}
            >
                {isFetching ? (
                    <Text c="ldGray.8" fz="xs">
                        Loading more...
                    </Text>
                ) : (
                    <Group gap="two">
                        <Text fz="xs" c="ldGray.8">
                            {hasNextPage
                                ? 'Scroll for more users'
                                : 'All users loaded'}
                        </Text>
                        <Text fz="xs" fw={400} c="dimmed">
                            {hasNextPage
                                ? `(${totalFetched} of ${totalDBRowCount} loaded)`
                                : `(${totalFetched})`}
                        </Text>
                    </Group>
                )}
            </Box>
        ),
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { estimateSize: () => 72, overscan: 10 },
        state: {
            isLoading,
            showAlertBanner: isError,
            showProgressBars: isFetching,
            density: 'md',
        },
    });

    return (
        <>
            <ContentTable table={table} />
            <ConfirmAdminSelfDowngradeModal
                opened={pendingRoleChange !== null}
                loading={updateUserRole.isLoading || replaceRoleSet.isLoading}
                onClose={() => setPendingRoleChange(null)}
                onConfirm={handleConfirmAdminSelfDowngrade}
            />
        </>
    );
};

export default UsersTable;
