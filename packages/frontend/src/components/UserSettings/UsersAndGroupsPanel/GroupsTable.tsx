import { isGroupWithMembers, type GroupWithMembers } from '@lightdash/common';
import {
    Badge,
    Box,
    Group,
    Stack,
    Text,
    useMantineTheme,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconTextCaption,
    IconUsers,
} from '@tabler/icons-react';
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
import { useInfiniteOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import GroupsActionMenu from './GroupsActionMenu';
import { GroupsTopToolbar } from './GroupsTopToolbar';

const fetchSize = 50;
const GROUP_MEMBERS_PER_PAGE = 2000;

interface GroupsTableProps {
    onAddClick: () => void;
    onEditGroup: (group: GroupWithMembers) => void;
}

const GroupsTable: FC<GroupsTableProps> = ({ onAddClick, onEditGroup }) => {
    const theme = useMantineTheme();
    const { user: activeUser } = useApp();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null);

    const [search, setSearch] = useState('');

    // Debounce search to avoid too many API calls
    const debouncedSearch = useMemo(() => {
        return { search };
    }, [search]);

    const [debouncedSearchValue] = useDebouncedValue(debouncedSearch, 300);

    // Use infinite query for pagination
    const { data, fetchNextPage, isError, isFetching, isLoading } =
        useInfiniteOrganizationGroups({
            searchInput: debouncedSearchValue.search,
            includeMembers: GROUP_MEMBERS_PER_PAGE,
            pageSize: fetchSize,
        });

    const flatData = useMemo<GroupWithMembers[]>(
        () =>
            data?.pages
                .flatMap((page) => page.data)
                .filter(isGroupWithMembers) ?? [],
        [data],
    );

    const totalDBRowCount = data?.pages?.[0]?.pagination?.totalResults ?? 0;
    const totalFetched = flatData.length;

    // Temporary workaround to resolve a memoization issue with react-mantine-table
    const [tableData, setTableData] = useState<GroupWithMembers[]>([]);
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

    const canManageGroups =
        activeUser.data?.ability?.can('manage', 'Group') ?? false;

    const columns: MRT_ColumnDef<GroupWithMembers>[] = useMemo(
        () => [
            {
                accessorKey: 'name',
                header: 'Group',
                enableSorting: false,
                size: 260,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconTextCaption} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const group = row.original;
                    return (
                        <Stack gap="xxs">
                            <Text fw={600} fz="sm">
                                {group.name}
                            </Text>
                            {group.members.length > 0 && (
                                <Text fz="xs" c="ldGray.6">
                                    {`${group.members.length} member${
                                        group.members.length !== 1 ? 's' : ''
                                    }`}
                                </Text>
                            )}
                        </Stack>
                    );
                },
            },
            {
                accessorKey: 'members',
                header: 'Members',
                enableSorting: false,
                size: 400,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconUsers} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const group = row.original;
                    return group?.members.length > 0 ? (
                        <Group
                            gap="xxs"
                            maw={400}
                            mah={55}
                            style={{
                                overflow: 'auto',
                                border: `1px solid ${theme.colors.ldGray[2]}`,
                                borderRadius: theme.radius.xs,
                                padding: theme.spacing.xxs,
                            }}
                        >
                            {group.members.map((member) => (
                                <Badge
                                    key={member.userUuid}
                                    variant="filled"
                                    color="ldGray.2"
                                    radius="xs"
                                    style={{ textTransform: 'none' }}
                                    px="xxs"
                                >
                                    <Text fz="xs" fw={400} c="ldGray.8">
                                        {member.email}
                                    </Text>
                                </Badge>
                            ))}
                        </Group>
                    ) : (
                        <Text fz="sm" c="ldGray.6" fs="italic">
                            No members
                        </Text>
                    );
                },
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 50,
                Cell: ({ row }) => {
                    const group = row.original;
                    const disabled = !canManageGroups || tableData.length < 1;

                    return (
                        <Box
                            component="div"
                            onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                                e.stopPropagation();
                                e.preventDefault();
                            }}
                        >
                            <GroupsActionMenu
                                group={group}
                                disabled={disabled}
                                onEdit={onEditGroup}
                            />
                        </Box>
                    );
                },
            },
        ],
        [canManageGroups, tableData.length, onEditGroup, theme],
    );

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
            <GroupsTopToolbar
                search={search}
                setSearch={setSearch}
                isFetching={isFetching || isLoading}
                currentResultsCount={totalFetched}
                canManage={canManageGroups}
                onAddClick={onAddClick}
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

export default GroupsTable;
