import {
    assertUnreachable,
    ContentType,
    type DeletedContentSummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Card,
    Group,
    Text,
    TextInput,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconCalendar,
    IconChartBar,
    IconClock,
    IconFolder,
    IconLayoutDashboard,
    IconRefresh,
    IconSearch,
    IconTag,
    IconTextCaption,
    IconUser,
    IconX,
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
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import useApp from '../../../providers/App/useApp';
import {
    useInfiniteDeletedContent,
    usePermanentlyDeleteContent,
    useRestoreDeletedContent,
} from '../hooks/useDeletedContent';
import { useDeletedContentFilters } from '../hooks/useDeletedContentFilters';
import { ContentTypeFilter } from './ContentTypeFilter';
import { DeletedByFilter } from './DeletedByFilter';
import DeletedContentActionMenu from './DeletedContentActionMenu';

interface Props {
    projectUuid: string;
}

const FETCH_SIZE = 50;

const formatDaysRemaining = (
    deletedAt: Date,
    retentionDays: number,
): string => {
    const deletedDate = new Date(deletedAt);
    const now = new Date();
    const diffDays = Math.ceil(
        (deletedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24) +
            retentionDays,
    );
    if (diffDays <= 0) return 'Expired';
    if (diffDays === 1) return '1 day';
    return `${diffDays} days`;
};

const RecentlyDeletedPage: FC<Props> = ({ projectUuid }) => {
    const theme = useMantineTheme();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null);

    const { health, user } = useApp();
    const retentionDays = health.data?.softDelete.retentionDays;

    const [selectedContentType, setSelectedContentType] = useState<
        'all' | ContentType.CHART | ContentType.DASHBOARD | ContentType.SPACE
    >('all');

    const {
        search,
        setSearch,
        selectedDeletedByUserUuids,
        setSelectedDeletedByUserUuids,
        apiFilters,
    } = useDeletedContentFilters();

    // Debounce filters
    const debouncedFilters = useMemo(() => {
        return { search, apiFilters, selectedContentType };
    }, [search, apiFilters, selectedContentType]);

    const [debouncedSearchAndFilters] = useDebouncedValue(
        debouncedFilters,
        300,
    );

    // Convert selectedContentType to array format for API
    const contentTypesFilter = useMemo(() => {
        if (debouncedSearchAndFilters.selectedContentType === 'all') {
            return debouncedSearchAndFilters.apiFilters.contentTypes;
        }
        return [debouncedSearchAndFilters.selectedContentType];
    }, [debouncedSearchAndFilters]);

    const { data, fetchNextPage, isError, isFetching, isLoading, refetch } =
        useInfiniteDeletedContent({
            projectUuids: [projectUuid],
            pageSize: FETCH_SIZE,
            search: debouncedSearchAndFilters.search,
            contentTypes: contentTypesFilter,
            deletedByUserUuids:
                debouncedSearchAndFilters.apiFilters.deletedByUserUuids,
        });

    const flatData = useMemo<DeletedContentSummary[]>(
        () => data?.pages?.flatMap((page) => page.data) ?? [],
        [data],
    );

    const totalDBRowCount = data?.pages?.[0]?.pagination?.totalResults ?? 0;
    const totalFetched = flatData.length;

    // Workaround for memoization issue with mantine-react-table
    const [tableData, setTableData] = useState<DeletedContentSummary[]>([]);
    useEffect(() => {
        setTableData(flatData);
    }, [flatData]);

    const { mutate: restoreContent, isLoading: isRestoring } =
        useRestoreDeletedContent(projectUuid);
    const { mutate: permanentlyDelete, isLoading: isDeleting } =
        usePermanentlyDeleteContent(projectUuid);

    const isAdmin = user.data?.ability?.can('manage', 'Organization') ?? false;

    // Fetch more data when scrolling near bottom
    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (containerRefElement) {
                const { scrollHeight, scrollTop, clientHeight } =
                    containerRefElement;
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

    // Scroll to top when filters change
    useEffect(() => {
        if (tableContainerRef.current) {
            tableContainerRef.current.scrollTop = 0;
        }
    }, [debouncedSearchAndFilters]);

    // Check on mount if table needs initial fetch
    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const columns = useMemo<MRT_ColumnDef<DeletedContentSummary>[]>(
        () => [
            {
                accessorKey: 'name',
                header: 'Name',
                size: 300,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconTextCaption} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const icon = (() => {
                        switch (row.original.contentType) {
                            case ContentType.CHART:
                                return IconChartBar;
                            case ContentType.DASHBOARD:
                                return IconLayoutDashboard;
                            case ContentType.SPACE:
                                return IconFolder;
                            default:
                                return assertUnreachable(
                                    row.original,
                                    `Unknown content type`,
                                );
                        }
                    })();
                    return (
                        <Group gap="xs" wrap="nowrap">
                            <MantineIcon
                                icon={icon}
                                size="md"
                                color="ldGray.6"
                            />
                            <Text fw={600} fz="xs" lineClamp={1}>
                                {row.original.name}
                            </Text>
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'contentType',
                header: 'Type',
                size: 100,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconTag} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const label = (() => {
                        switch (row.original.contentType) {
                            case ContentType.CHART:
                                return 'Chart';
                            case ContentType.DASHBOARD:
                                return 'Dashboard';
                            case ContentType.SPACE:
                                return 'Space';
                            default:
                                return assertUnreachable(
                                    row.original,
                                    `Unknown content type`,
                                );
                        }
                    })();
                    return (
                        <Badge variant="light" size="sm" radius="sm" fw={400}>
                            {label}
                        </Badge>
                    );
                },
            },
            ...(isAdmin
                ? [
                      {
                          accessorKey: 'deletedBy',
                          header: 'Deleted by',
                          size: 150,
                          Header: ({
                              column,
                          }: {
                              column: { columnDef: { header: string } };
                          }) => (
                              <Group gap="two" wrap="nowrap">
                                  <MantineIcon
                                      icon={IconUser}
                                      color="ldGray.6"
                                  />
                                  {column.columnDef.header}
                              </Group>
                          ),
                          Cell: ({
                              row,
                          }: {
                              row: { original: DeletedContentSummary };
                          }) =>
                              row.original.deletedBy ? (
                                  <Text fz="xs" c="ldGray.6">
                                      {row.original.deletedBy.firstName}{' '}
                                      {row.original.deletedBy.lastName}
                                  </Text>
                              ) : (
                                  <Text fz="xs" c="ldGray.6">
                                      Unknown
                                  </Text>
                              ),
                      } as MRT_ColumnDef<DeletedContentSummary>,
                  ]
                : []),
            {
                accessorKey: 'deletedAt',
                header: 'Deleted',
                size: 130,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconCalendar} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text fz="xs" c="ldGray.6">
                        {new Date(row.original.deletedAt).toLocaleDateString()}
                    </Text>
                ),
            },
            {
                id: 'daysRemaining',
                header: 'Days remaining',
                size: 140,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const remaining = formatDaysRemaining(
                        row.original.deletedAt,
                        retentionDays ?? 0,
                    );
                    const isExpired = remaining === 'Expired';
                    return (
                        <Text fz="xs" c={isExpired ? 'red' : 'ldGray.6'}>
                            {remaining}
                        </Text>
                    );
                },
            },
            {
                id: 'actions',
                header: '',
                size: 50,
                enableResizing: false,
                Cell: ({ row }) => (
                    <Box
                        component="div"
                        onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                            e.stopPropagation();
                            e.preventDefault();
                        }}
                    >
                        <DeletedContentActionMenu
                            item={row.original}
                            onRestore={() => {
                                const item = row.original;
                                switch (item.contentType) {
                                    case ContentType.CHART:
                                        restoreContent({
                                            uuid: item.uuid,
                                            contentType: item.contentType,
                                            source: item.source,
                                        });
                                        break;
                                    case ContentType.DASHBOARD:
                                        restoreContent({
                                            uuid: item.uuid,
                                            contentType: item.contentType,
                                        });
                                        break;
                                    case ContentType.SPACE:
                                        restoreContent({
                                            uuid: item.uuid,
                                            contentType: item.contentType,
                                        });
                                        break;
                                    default:
                                        assertUnreachable(
                                            item,
                                            `Unknown content type`,
                                        );
                                }
                            }}
                            onPermanentlyDelete={() => {
                                const item = row.original;
                                switch (item.contentType) {
                                    case ContentType.CHART:
                                        permanentlyDelete({
                                            uuid: item.uuid,
                                            contentType: item.contentType,
                                            source: item.source,
                                        });
                                        break;
                                    case ContentType.DASHBOARD:
                                        permanentlyDelete({
                                            uuid: item.uuid,
                                            contentType: item.contentType,
                                        });
                                        break;
                                    case ContentType.SPACE:
                                        permanentlyDelete({
                                            uuid: item.uuid,
                                            contentType: item.contentType,
                                        });
                                        break;
                                    default:
                                        assertUnreachable(
                                            item,
                                            `Unknown content type`,
                                        );
                                }
                            }}
                            isLoading={isRestoring || isDeleting}
                        />
                    </Box>
                ),
            },
        ],
        [
            isAdmin,
            retentionDays,
            restoreContent,
            permanentlyDelete,
            isRestoring,
            isDeleting,
        ],
    );

    const table = useMantineReactTable({
        columns,
        data: tableData,
        enableColumnResizing: true,
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
            sx: {
                boxShadow: 'none',
                'th > div > div:last-child': {
                    top: -10,
                    right: -5,
                },
                'th > div > div:last-child > .mantine-Divider-root': {
                    border: 'none',
                },
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

            const isAnyColumnResizing = props.table
                .getAllColumns()
                .some((c) => c.getIsResizing());
            const canResize = props.column.getCanResize();

            return {
                bg: 'ldGray.0',
                h: '3xl',
                pos: 'relative',
                style: {
                    userSelect: 'none',
                    justifyContent: 'center',
                    padding: `${theme.spacing.xs} ${theme.spacing.xl}`,
                    borderTop: `1px solid ${theme.colors.ldGray[2]}`,
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                    borderRight: props.column.getIsResizing()
                        ? `2px solid ${theme.colors.blue[3]}`
                        : `1px solid ${
                              isLastColumn
                                  ? 'transparent'
                                  : theme.colors.ldGray[2]
                          }`,
                    borderLeft: 'none',
                },
                sx: {
                    '&:hover': canResize
                        ? {
                              borderRight: !isAnyColumnResizing
                                  ? `2px solid ${theme.colors.blue[3]} !important`
                                  : undefined,
                              transition: `border-right ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                          }
                        : {},
                },
            };
        },
        mantineTableBodyCellProps: () => {
            return {
                h: 72,
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
                <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <Tooltip withinPortal label="Search by item name">
                        <TextInput
                            size="xs"
                            radius="md"
                            type="search"
                            variant="default"
                            placeholder="Search deleted items..."
                            value={search ?? ''}
                            leftSection={
                                <MantineIcon
                                    size="md"
                                    color="ldGray.6"
                                    icon={IconSearch}
                                />
                            }
                            onChange={(e) =>
                                setSearch(e.target.value || undefined)
                            }
                            rightSection={
                                search && (
                                    <ActionIcon
                                        onClick={() => setSearch(undefined)}
                                        variant="transparent"
                                        size="xs"
                                        color="ldGray.5"
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                )
                            }
                            style={{
                                minWidth: 200,
                                maxWidth: 350,
                                flexShrink: 1,
                            }}
                        />
                    </Tooltip>

                    <ContentTypeFilter
                        selectedContentType={selectedContentType}
                        setSelectedContentType={setSelectedContentType}
                    />

                    {isAdmin && (
                        <DeletedByFilter
                            projectUuid={projectUuid}
                            selectedUserUuids={selectedDeletedByUserUuids}
                            onSelectionChange={setSelectedDeletedByUserUuids}
                        />
                    )}
                </Group>
            </Group>
        ),
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { overscan: 10 },
        state: {
            isLoading,
            showAlertBanner: isError,
            showProgressBars: isFetching,
            density: 'md',
        },
    });

    if (isError) {
        return (
            <Card>
                <Callout variant="danger">
                    Failed to load deleted content. Please try again.
                </Callout>
            </Card>
        );
    }

    return (
        <>
            <Card>
                <Group justify="space-between">
                    <Box>
                        <Title order={5}>Recently Deleted</Title>
                        <Text size="sm" c="dimmed">
                            Items are permanently deleted after {retentionDays}{' '}
                            days
                        </Text>
                    </Box>
                    <Tooltip label="Click to refresh the list">
                        <ActionIcon
                            onClick={() => refetch()}
                            variant="subtle"
                            size="xs"
                        >
                            <MantineIcon
                                icon={IconRefresh}
                                color="ldGray.6"
                                stroke={2}
                            />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Card>

            <MantineReactTable table={table} />
        </>
    );
};

export default RecentlyDeletedPage;
