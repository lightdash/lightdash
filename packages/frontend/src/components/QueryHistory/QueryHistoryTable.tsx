import {
    QueryHistoryStatus,
    type AuthType,
    type ProjectQueryHistoryItem,
    type QueryExecutionContext,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    CopyButton,
    Divider,
    Drawer,
    Group,
    Paper,
    ScrollArea,
    SimpleGrid,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconCheck,
    IconClock,
    IconCopy,
    IconDatabase,
    IconHash,
    IconInfoCircle,
    IconPlayerPlay,
    IconStatusChange,
    IconUser,
} from '@tabler/icons-react';
import { format } from 'date-fns';
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
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import { formatDuration } from '../PreAggregateMaterializations/formatters';

type QueryHistoryTableProps = {
    queryHistory: ProjectQueryHistoryItem[];
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    fetchNextPage: () => Promise<unknown>;
    totalRowCount: number;
};

const STATUS_META: Record<
    QueryHistoryStatus,
    { label: string; color: string }
> = {
    [QueryHistoryStatus.PENDING]: {
        label: 'Pending',
        color: 'yellow',
    },
    [QueryHistoryStatus.READY]: {
        label: 'Ready',
        color: 'green',
    },
    [QueryHistoryStatus.ERROR]: {
        label: 'Error',
        color: 'red',
    },
    [QueryHistoryStatus.CANCELLED]: {
        label: 'Cancelled',
        color: 'gray',
    },
};

const formatContextLabel = (context: QueryExecutionContext): string =>
    context
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (char) => char.toUpperCase());

const formatActorTypeLabel = (actorType: AuthType | null): string => {
    switch (actorType) {
        case 'session':
            return 'Session';
        case 'pat':
            return 'Personal access token';
        case 'service-account':
            return 'Service account';
        case 'jwt':
            return 'JWT';
        case 'oauth':
            return 'OAuth';
        default:
            return 'Unknown';
    }
};

const formatQueryWaitTime = (query: ProjectQueryHistoryItem): string => {
    if (query.processingStartedAt) {
        return formatDuration(
            Math.max(
                0,
                new Date(query.processingStartedAt).getTime() -
                    new Date(query.createdAt).getTime(),
            ),
        );
    }

    if (query.status === QueryHistoryStatus.PENDING) {
        return formatDuration(
            Math.max(0, Date.now() - new Date(query.createdAt).getTime()),
        );
    }

    return '\u2014';
};

const QueryStatusBadge: FC<{ status: QueryHistoryStatus }> = ({ status }) => (
    <Badge
        size="sm"
        radius="sm"
        variant="light"
        color={STATUS_META[status].color}
    >
        {STATUS_META[status].label}
    </Badge>
);

const CopyableCodeBlock: FC<{ label: string; value: string }> = ({
    label,
    value,
}) => (
    <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
            <Text size="sm" fw={600}>
                {label}
            </Text>
            <CopyButton value={value} timeout={2000}>
                {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Copied' : 'Copy'} variant="xs">
                        <ActionIcon
                            variant="subtle"
                            color={copied ? 'teal' : 'gray'}
                            onClick={copy}
                        >
                            <MantineIcon
                                icon={copied ? IconCheck : IconCopy}
                                size="sm"
                            />
                        </ActionIcon>
                    </Tooltip>
                )}
            </CopyButton>
        </Group>
        <Box
            component="pre"
            p="sm"
            m={0}
            style={{
                borderRadius: 'var(--mantine-radius-sm)',
                border: '1px solid var(--mantine-color-ldGray-2)',
                background: 'var(--mantine-color-ldGray-0)',
                fontFamily: 'var(--mantine-font-family-monospace)',
                fontSize: 'var(--mantine-font-size-xs)',
                lineHeight: 1.5,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 280,
            }}
        >
            {value}
        </Box>
    </Stack>
);

const QueryHistoryDetailDrawer: FC<{
    opened: boolean;
    onClose: () => void;
    query: ProjectQueryHistoryItem | null;
}> = ({ opened, onClose, query }) => (
    <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size="xl"
        title={
            <Group justify="space-between" w="100%" wrap="nowrap">
                <Text fw={600} fz="lg">
                    Query details
                </Text>
                {query && (
                    <CopyButton
                        value={JSON.stringify(query, null, 2)}
                        timeout={2000}
                    >
                        {({ copied, copy }) => (
                            <Tooltip
                                label={copied ? 'Copied' : 'Copy JSON'}
                                variant="xs"
                            >
                                <ActionIcon
                                    variant="subtle"
                                    color={copied ? 'teal' : 'gray'}
                                    onClick={copy}
                                >
                                    <MantineIcon
                                        icon={copied ? IconCheck : IconCopy}
                                    />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </CopyButton>
                )}
            </Group>
        }
    >
        <ScrollArea h="calc(100vh - 80px)">
            {query && (
                <Stack gap="lg" pr="sm">
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                        <Paper withBorder p="sm">
                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                Query UUID
                            </Text>
                            <Text size="sm" ff="monospace">
                                {query.queryUuid}
                            </Text>
                        </Paper>
                        <Paper withBorder p="sm">
                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                Status
                            </Text>
                            <QueryStatusBadge status={query.status} />
                        </Paper>
                        <Paper withBorder p="sm">
                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                Created at
                            </Text>
                            <Text size="sm">
                                {format(
                                    new Date(query.createdAt),
                                    'yyyy/MM/dd hh:mm:ss a',
                                )}
                            </Text>
                        </Paper>
                        <Paper withBorder p="sm">
                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                Context
                            </Text>
                            <Text size="sm">
                                {formatContextLabel(query.context)}
                            </Text>
                        </Paper>
                        <Paper withBorder p="sm">
                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                Triggered by
                            </Text>
                            <Text size="sm">
                                {query.createdByName ||
                                    query.createdByAccount ||
                                    'Unknown'}
                            </Text>
                            <Text size="xs" c="dimmed">
                                {formatActorTypeLabel(query.createdByActorType)}
                            </Text>
                        </Paper>
                        <Paper withBorder p="sm">
                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                Warehouse query ID
                            </Text>
                            <Text size="sm" ff="monospace">
                                {query.warehouseQueryId || '\u2014'}
                            </Text>
                        </Paper>
                        <Paper withBorder p="sm">
                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                Queue time
                            </Text>
                            <Text size="sm">{formatQueryWaitTime(query)}</Text>
                        </Paper>
                        <Paper withBorder p="sm">
                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                Execution time
                            </Text>
                            <Text size="sm">
                                {query.warehouseExecutionTimeMs != null
                                    ? formatDuration(
                                          query.warehouseExecutionTimeMs,
                                      )
                                    : '\u2014'}
                            </Text>
                        </Paper>
                    </SimpleGrid>

                    {query.error && (
                        <Paper withBorder p="sm">
                            <Text size="sm" fw={600} c="red.7" mb={6}>
                                Error
                            </Text>
                            <Text size="sm">{query.error}</Text>
                        </Paper>
                    )}

                    <Divider />

                    <CopyableCodeBlock
                        label="Compiled SQL"
                        value={query.compiledSql}
                    />

                    {query.preAggregateCompiledSql && (
                        <CopyableCodeBlock
                            label="Pre-aggregate SQL"
                            value={query.preAggregateCompiledSql}
                        />
                    )}
                </Stack>
            )}
        </ScrollArea>
    </Drawer>
);

const QueryHistoryTable: FC<QueryHistoryTableProps> = ({
    queryHistory,
    isLoading,
    isFetching,
    isError,
    fetchNextPage,
    totalRowCount,
}) => {
    const theme = useMantineTheme();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null);
    const [selectedQuery, setSelectedQuery] =
        useState<ProjectQueryHistoryItem | null>(null);
    const [drawerOpened, setDrawerOpened] = useState(false);

    const totalFetched = queryHistory.length;

    const [tableData, setTableData] = useState<ProjectQueryHistoryItem[]>([]);
    useEffect(() => {
        setTableData(queryHistory);
    }, [queryHistory]);

    const handleRowClick = useCallback((query: ProjectQueryHistoryItem) => {
        setSelectedQuery(query);
        setDrawerOpened(true);
    }, []);

    const handleDrawerClose = useCallback(() => {
        setDrawerOpened(false);
        setSelectedQuery(null);
    }, []);

    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (!containerRefElement) {
                return;
            }

            const { scrollHeight, scrollTop, clientHeight } =
                containerRefElement;

            if (
                scrollHeight - scrollTop - clientHeight < 400 &&
                !isFetching &&
                totalFetched < totalRowCount
            ) {
                void fetchNextPage();
            }
        },
        [fetchNextPage, isFetching, totalFetched, totalRowCount],
    );

    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const columns = useMemo<MRT_ColumnDef<ProjectQueryHistoryItem>[]>(
        () => [
            {
                accessorKey: 'createdAt',
                header: 'Timestamp',
                size: 180,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text c="dimmed" size="xs">
                        {format(
                            new Date(row.original.createdAt),
                            'yyyy/MM/dd hh:mm a',
                        )}
                    </Text>
                ),
            },
            {
                accessorKey: 'status',
                header: 'Status',
                size: 120,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconStatusChange} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <QueryStatusBadge status={row.original.status} />
                ),
            },
            {
                accessorKey: 'context',
                header: 'Context',
                size: 180,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconInfoCircle} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text size="xs">
                        {formatContextLabel(row.original.context)}
                    </Text>
                ),
            },
            {
                id: 'actor',
                header: 'Triggered by',
                size: 200,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconUser} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Stack gap={0}>
                        <Text size="xs" fw={500}>
                            {row.original.createdByName ||
                                row.original.createdByAccount ||
                                'Unknown'}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {formatActorTypeLabel(
                                row.original.createdByActorType,
                            )}
                        </Text>
                    </Stack>
                ),
            },
            {
                id: 'queueTime',
                header: 'Queue time',
                size: 110,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconPlayerPlay} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text size="xs">{formatQueryWaitTime(row.original)}</Text>
                ),
            },
            {
                accessorKey: 'warehouseExecutionTimeMs',
                header: 'Execution',
                size: 110,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconDatabase} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text size="xs">
                        {row.original.warehouseExecutionTimeMs != null
                            ? formatDuration(
                                  row.original.warehouseExecutionTimeMs,
                              )
                            : '\u2014'}
                    </Text>
                ),
            },
            {
                accessorKey: 'totalRowCount',
                header: 'Rows',
                size: 90,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconHash} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text size="xs" ff="monospace">
                        {row.original.totalRowCount != null
                            ? row.original.totalRowCount.toLocaleString()
                            : '\u2014'}
                    </Text>
                ),
            },
            {
                accessorKey: 'queryUuid',
                header: 'Query UUID',
                size: 200,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconHash} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Tooltip label={row.original.queryUuid} variant="xs">
                        <Text size="xs" ff="monospace" truncate>
                            {row.original.queryUuid}
                        </Text>
                    </Tooltip>
                ),
            },
        ],
        [],
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
        enableSorting: false,
        enableGlobalFilterModes: false,
        enableRowVirtualization: true,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        enableRowActions: false,
        renderTopToolbar: () => (
            <Group
                justify="space-between"
                px="sm"
                py="xs"
                wrap="nowrap"
                style={{
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                }}
            >
                <Text size="xs" c="dimmed">
                    Newest queries first
                </Text>
                <Text size="xs" c="dimmed">
                    Showing {totalFetched} of {totalRowCount}
                </Text>
            </Group>
        ),
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
        mantineTableContainerProps: {
            ref: tableContainerRef,
            style: { maxHeight: 'calc(100dvh - 430px)' },
            onScroll: (event: UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.target as HTMLDivElement),
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: false,
        },
        mantineTableBodyRowProps: ({ row }) => ({
            onClick: () => handleRowClick(row.original),
            style: { cursor: 'pointer' },
        }),
        mantineTableHeadRowProps: {
            sx: {
                boxShadow: 'none',
            },
        },
        mantineTableHeadCellProps: {
            h: '3xl',
            pos: 'relative',
            style: {
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                backgroundColor: theme.colors.ldGray[0],
                fontWeight: 600,
                fontSize: theme.fontSizes.xs,
                justifyContent: 'center',
                whiteSpace: 'nowrap',
            },
            sx: {
                '&:last-of-type': {
                    borderLeft: 'none!important',
                },
            },
        },
        mantineTableBodyCellProps: {
            sx: {
                '&:last-of-type': {
                    borderLeft: 'none!important',
                },
            },
            style: {
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                fontSize: theme.fontSizes.xs,
                color: theme.colors.ldGray[7],
            },
        },
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

    if (!isLoading && totalRowCount === 0) {
        return (
            <Paper withBorder radius="md" p="xxl">
                <SuboptimalState
                    title="No query history yet"
                    description="Queries will appear here after they have been executed for this project."
                />
            </Paper>
        );
    }

    return (
        <>
            <MantineReactTable table={table} />
            <QueryHistoryDetailDrawer
                opened={drawerOpened}
                onClose={handleDrawerClose}
                query={selectedQuery}
            />
        </>
    );
};

export default QueryHistoryTable;
