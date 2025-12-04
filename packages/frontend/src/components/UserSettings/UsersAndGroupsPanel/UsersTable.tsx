import {
    FeatureFlags,
    isOrganizationMemberProfileWithGroups,
    OrganizationMemberRole,
    type OrganizationMemberProfile,
    type OrganizationMemberProfileWithGroups,
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
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconUserCircle,
} from '@tabler/icons-react';
import capitalize from 'lodash/capitalize';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
    type MRT_Virtualizer,
} from 'mantine-react-table';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type UIEvent,
} from 'react';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useUpsertOrganizationUserRoleAssignmentMutation } from '../../../hooks/useOrganizationRoles';
import { useInfiniteOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import InviteSuccess from './InviteSuccess';
import UsersActionMenu from './UsersActionMenu';
import { UsersTopToolbar } from './UsersTopToolbar';

const fetchSize = 50;

interface UsersTableProps {
    onInviteClick: () => void;
}

const UsersTable: FC<UsersTableProps> = ({ onInviteClick }) => {
    const theme = useMantineTheme();
    const { user: activeUser } = useApp();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null);

    const [search, setSearch] = useState('');
    const inviteLink = useCreateInviteLinkMutation();
    const [inviteSuccessFor, setInviteSuccessFor] = useState<string | null>(
        null,
    );

    // Callback to handle when an invite is sent
    const handleInviteSent = useCallback((userUuid: string) => {
        setInviteSuccessFor(userUuid);
    }, []);

    const userGroupsFeatureFlagQuery = useFeatureFlag(
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
    const { data, fetchNextPage, isError, isFetching, isLoading } =
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

    // Temporary workaround to resolve a memoization issue with react-mantine-table
    const [tableData, setTableData] = useState<
        (OrganizationMemberProfile | OrganizationMemberProfileWithGroups)[]
    >([]);
    useEffect(() => {
        setTableData(flatData);
    }, [flatData]);

    // Callback to fetch more data when scrolling
    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (containerRefElement) {
                const { scrollHeight, scrollTop, clientHeight } =
                    containerRefElement;
                // Fetch more when within 400px of bottom
                if (
                    scrollHeight - scrollTop - clientHeight < 400 &&
                    !isFetching &&
                    totalFetched < totalDBRowCount
                ) {
                    void fetchNextPage();
                }
            }
        },
        [fetchNextPage, isFetching, totalFetched, totalDBRowCount],
    );

    // Scroll to top when search changes
    useEffect(() => {
        if (rowVirtualizerInstanceRef.current) {
            try {
                rowVirtualizerInstanceRef.current.scrollToIndex(0);
            } catch (e) {
                console.error(e);
            }
        }
    }, [debouncedSearchValue]);

    // Check on mount if table needs initial fetch
    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const updateUserRole = useUpsertOrganizationUserRoleAssignmentMutation();

    const canManageUsers =
        activeUser.data?.ability?.can('manage', 'OrganizationMemberProfile') ??
        false;
    const canInvite =
        activeUser.data?.ability?.can('create', 'InviteLink') ?? false;

    const columns: MRT_ColumnDef<
        OrganizationMemberProfile | OrganizationMemberProfileWithGroups
    >[] = useMemo(() => {
        const cols: MRT_ColumnDef<
            OrganizationMemberProfile | OrganizationMemberProfileWithGroups
        >[] = [
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
                    const user = row.original;
                    const showInviteSuccess =
                        inviteLink.data &&
                        inviteSuccessFor === user.userUuid &&
                        user.isPending;

                    return (
                        <Stack gap="xs">
                            {!user.isActive ? (
                                <Stack gap="xxs" align="flex-start">
                                    <Text fw={600} fz="sm" c="ldGray.6">
                                        {user.firstName
                                            ? `${user.firstName} ${user.lastName}`
                                            : user.email}
                                    </Text>
                                    <Badge
                                        variant="filled"
                                        color="red.4"
                                        radius="xs"
                                        style={{ textTransform: 'none' }}
                                        px="xxs"
                                    >
                                        <Text fz="xs" fw={400} c="ldGray.8">
                                            Inactive
                                        </Text>
                                    </Badge>
                                </Stack>
                            ) : user.isPending ? (
                                <Stack gap="xxs" align="flex-start">
                                    {user.email && (
                                        <Text fw={600} fz="sm">
                                            {user.email}
                                        </Text>
                                    )}
                                    <Group gap="xs">
                                        <Badge
                                            variant="filled"
                                            color="orange.3"
                                            radius="xs"
                                            style={{ textTransform: 'none' }}
                                            px="xxs"
                                        >
                                            <Text fz="xs" fw={400} c="gray.8">
                                                {!user.isInviteExpired
                                                    ? 'Pending'
                                                    : 'Link expired'}
                                            </Text>
                                        </Badge>
                                    </Group>
                                </Stack>
                            ) : (
                                <Stack gap="xxs" align="flex-start">
                                    <Text fw={600} fz="sm">
                                        {user.firstName} {user.lastName}
                                    </Text>

                                    {user.email && (
                                        <Badge
                                            variant="filled"
                                            color="ldGray.2"
                                            radius="xs"
                                            style={{ textTransform: 'none' }}
                                            px="xxs"
                                        >
                                            <Text fz="xs" fw={400} c="ldGray.8">
                                                {user.email}
                                            </Text>
                                        </Badge>
                                    )}
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
                    return (
                        <Select
                            data={Object.values(OrganizationMemberRole).map(
                                (orgMemberRole) => ({
                                    value: orgMemberRole,
                                    label: capitalize(
                                        orgMemberRole.replace('_', ' '),
                                    ),
                                }),
                            )}
                            onChange={(newRole: string | null) => {
                                if (newRole) {
                                    updateUserRole.mutate({
                                        userId: user.userUuid,
                                        roleId: newRole,
                                    });
                                }
                            }}
                            value={user.role}
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
                                <Text fz="sm" c="ldGray.6">
                                    0 groups
                                </Text>
                            );
                        }

                        return (
                            <HoverCard
                                shadow="sm"
                                disabled={user.groups.length < 1}
                            >
                                <HoverCard.Target>
                                    <Text fz="sm" c="ldGray.6">
                                        {`${user.groups.length} group${
                                            user.groups.length !== 1 ? 's' : ''
                                        }`}
                                    </Text>
                                </HoverCard.Target>
                                <HoverCard.Dropdown p="sm">
                                    <Text fz="xs" fw={600} c="ldGray.6">
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

            cols.push({
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 50,
                Cell: ({ row }) => {
                    const user = row.original;
                    const isCurrentUser =
                        activeUser.data?.userUuid === user.userUuid;
                    const disabled = isCurrentUser || tableData.length < 1;

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
        inviteLink,
        inviteSuccessFor,
        isGroupManagementEnabled,
        updateUserRole,
        activeUser.data?.userUuid,
        tableData.length,
        canInvite,
        handleInviteSent,
    ]);

    const table = useMantineReactTable({
        columns,
        data: tableData,
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
            onScroll: (event: UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.target as HTMLDivElement),
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(tableData.length),
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
            <UsersTopToolbar
                search={search}
                setSearch={setSearch}
                isFetching={isFetching || isLoading}
                currentResultsCount={totalFetched}
                canInvite={canInvite}
                onInviteClick={onInviteClick}
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
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { overscan: 10 },
        state: {
            isLoading,
            showAlertBanner: isError,
            showProgressBars: isFetching,
            density: 'md',
        },
    });

    return <MantineReactTable table={table} />;
};

export default UsersTable;
