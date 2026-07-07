import {
    type McpActivityItem,
    type McpActivitySortField,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Group,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconBox,
    IconClock,
    IconDeviceLaptop,
    IconHourglass,
    IconPlugConnected,
    IconRobotFace,
    IconTool,
    IconUser,
} from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type UIEvent,
} from 'react';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
    type ContentTableSortingState,
    type ContentTableVirtualizer,
} from '../../../../../components/common/ContentTable';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../../../hooks/useIsTruncated';
import { useInfiniteMcpActivity } from '../../hooks/useMcpActivity';
import { useMcpActivityFilters } from '../../hooks/useMcpActivityFilters';
import { AgentNamePill } from '../AgentNamePill';
import { McpActivityTopToolbar } from './McpActivityTopToolbar';

type McpActivityTableProps = {
    onCallSelect?: (toolCall: McpActivityItem) => void;
    selectedCall?: McpActivityItem | null;
};

const McpActivityTable = ({
    onCallSelect,
    selectedCall,
}: McpActivityTableProps) => {
    const theme = useMantineTheme();

    const {
        selectedProjectUuids,
        selectedAgentUuids,
        selectedStatus,
        sortField,
        sortDirection,
        apiFilters,
        setSelectedProjectUuids,
        setSelectedAgentUuids,
        setSelectedStatus,
        setSorting,
        hasActiveFilters,
        resetFilters,
    } = useMcpActivityFilters();

    const sorting = useMemo<ContentTableSortingState>(
        () => [{ id: sortField, desc: sortDirection === 'desc' }],
        [sortField, sortDirection],
    );

    const handleSortingChange = useCallback(
        (
            updaterOrValue:
                | ContentTableSortingState
                | ((old: ContentTableSortingState) => ContentTableSortingState),
        ) => {
            const newSorting =
                typeof updaterOrValue === 'function'
                    ? updaterOrValue(sorting)
                    : updaterOrValue;

            if (newSorting.length > 0) {
                const { id, desc } = newSorting[0];
                const newSortField: McpActivitySortField =
                    id === 'durationMs' ? 'durationMs' : 'createdAt';
                setSorting(newSortField, desc ? 'desc' : 'asc');
            }
        },
        [sorting, setSorting],
    );

    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<ContentTableVirtualizer<HTMLDivElement, HTMLTableRowElement>>(
            null,
        );

    const { data, isInitialLoading, isFetching, hasNextPage, fetchNextPage } =
        useInfiniteMcpActivity(
            {
                pagination: {},
                filters: apiFilters,
                sort: {
                    field: sortField,
                    direction: sortDirection,
                },
            },
            { keepPreviousData: true },
        );

    const flatData = useMemo(() => {
        if (!data) return [];
        return data.pages.flatMap((page) => page.data.toolCalls);
    }, [data]);

    // Temporary workaround to resolve a memoization issue with react-mantine-table
    const [tableData, setTableData] = useState<McpActivityItem[]>([]);
    useEffect(() => {
        setTableData(flatData);
    }, [flatData]);

    const totalResults = useMemo(() => {
        if (!data) return 0;
        const lastPage = data.pages[data.pages.length - 1];
        return lastPage.pagination?.totalResults ?? 0;
    }, [data]);

    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (containerRefElement) {
                const { scrollHeight, scrollTop, clientHeight } =
                    containerRefElement;
                if (
                    scrollHeight - scrollTop - clientHeight < 200 &&
                    !isFetching &&
                    hasNextPage
                ) {
                    void fetchNextPage();
                }
            }
        },
        [fetchNextPage, isFetching, hasNextPage],
    );

    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const columns: ContentTableColumnDef<McpActivityItem>[] = [
        {
            accessorKey: 'createdAt',
            header: 'Time',
            enableSorting: true,
            enableEditing: false,
            size: 170,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconClock} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => (
                <Text fz="sm" c="ldGray.7">
                    {new Date(row.original.createdAt).toLocaleString()}
                </Text>
            ),
        },
        {
            accessorKey: 'toolName',
            header: 'Tool',
            enableSorting: false,
            enableEditing: false,
            size: 190,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconTool} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => (
                <Badge variant="light" color="indigo" tt="none">
                    {row.original.toolName}
                </Badge>
            ),
        },
        {
            accessorKey: 'user.name',
            header: 'User',
            enableSorting: false,
            enableEditing: false,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconUser} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => (
                <Tooltip
                    withinPortal
                    variant="xs"
                    label={row.original.user.email}
                >
                    <Text c="ldGray.9" fz="sm" fw={400}>
                        {row.original.user.name}
                    </Text>
                </Tooltip>
            ),
        },
        {
            accessorKey: 'project.name',
            header: 'Project',
            enableSorting: false,
            enableEditing: false,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconBox} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => (
                <Text c="ldGray.9" fz="sm" fw={400}>
                    {row.original.project?.name ?? '—'}
                </Text>
            ),
        },
        {
            accessorKey: 'agent.name',
            header: 'Agent',
            enableSorting: false,
            enableEditing: false,
            size: 150,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconRobotFace} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) =>
                row.original.agent ? (
                    <AgentNamePill
                        name={row.original.agent.name}
                        imageUrl={null}
                    />
                ) : (
                    <Text c="ldGray.5" fz="sm">
                        —
                    </Text>
                ),
        },
        {
            accessorKey: 'clientName',
            header: 'Client',
            enableSorting: false,
            enableEditing: false,
            size: 180,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconDeviceLaptop} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const isTruncated = useIsTruncated<HTMLDivElement>();
                const { clientName, clientVersion, userAgent } = row.original;
                const label = clientName
                    ? `${clientName}${clientVersion ? ` ${clientVersion}` : ''}`
                    : (userAgent ?? 'Unknown');
                return (
                    <Tooltip
                        withinPortal
                        variant="xs"
                        label={userAgent ?? label}
                        disabled={!isTruncated.isTruncated && !userAgent}
                        multiline
                        maw={300}
                    >
                        <Text
                            c="ldGray.9"
                            fz="sm"
                            fw={400}
                            truncate
                            ref={isTruncated.ref}
                        >
                            {label}
                        </Text>
                    </Tooltip>
                );
            },
        },
        {
            accessorKey: 'status',
            header: 'Status',
            enableSorting: false,
            enableEditing: false,
            size: 110,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconPlugConnected} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => (
                <Badge
                    variant="light"
                    color={row.original.status === 'error' ? 'red' : 'green'}
                >
                    {row.original.status}
                </Badge>
            ),
        },
        {
            accessorKey: 'durationMs',
            header: 'Duration',
            enableSorting: true,
            enableEditing: false,
            size: 120,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconHourglass} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const { durationMs } = row.original;
                const label =
                    durationMs >= 1000
                        ? `${(durationMs / 1000).toFixed(1)}s`
                        : `${durationMs}ms`;
                return (
                    <Text fz="sm" c="ldGray.7">
                        {label}
                    </Text>
                );
            },
        },
    ];

    const table = useContentTable({
        columns,
        data: tableData,
        enableColumnResizing: true,
        enableRowNumbers: false,
        enableRowVirtualization: true,
        enablePagination: false,
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableGlobalFilterModes: false,
        enableSorting: true,
        manualSorting: true,
        onSortingChange: handleSortingChange,
        enableTopToolbar: true,
        mantinePaperProps: {
            shadow: undefined,
            sx: {
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            sx: {
                maxHeight: 'calc(100dvh - 420px)',
                minHeight: '400px',
                display: 'flex',
                flexDirection: 'column',
            },
            onScroll: (event: UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.target as HTMLDivElement),
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(flatData.length),
            sx: {
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        mantineTableBodyRowProps: ({ row, table: mantineTable }) => {
            if (mantineTable.getState().showSkeletons) {
                return {};
            }
            const toolCall = row.original;
            const isSelected = selectedCall?.uuid === toolCall.uuid;
            return {
                style: {
                    cursor: 'pointer',
                    backgroundColor: isSelected
                        ? theme.colors.ldGray[1]
                        : undefined,
                },
                onClick: () => onCallSelect?.(toolCall),
            };
        },
        renderTopToolbar: () => (
            <McpActivityTopToolbar
                selectedProjectUuids={selectedProjectUuids}
                setSelectedProjectUuids={setSelectedProjectUuids}
                selectedAgentUuids={selectedAgentUuids}
                setSelectedAgentUuids={setSelectedAgentUuids}
                selectedStatus={selectedStatus}
                setSelectedStatus={setSelectedStatus}
                totalResults={totalResults}
                isFetching={isFetching}
                hasNextPage={hasNextPage ?? false}
                currentResultsCount={flatData.length}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={resetFilters}
            />
        ),
        renderBottomToolbar: () => (
            <Box
                p={`${theme.spacing.sm} ${theme.spacing.xl} ${theme.spacing.md} ${theme.spacing.xl}`}
                fz="xs"
                fw={500}
                color="ldGray.8"
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
                                ? 'Scroll for more results'
                                : 'All results loaded'}
                        </Text>
                        <Text fz="xs" fw={400} c="ldGray.6">
                            {hasNextPage
                                ? `(${flatData.length} of ${totalResults} loaded)`
                                : `(${flatData.length})`}
                        </Text>
                    </Group>
                )}
            </Box>
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
            sorting,
            showProgressBars: false,
            showSkeletons: isInitialLoading,
            density: 'md',
        },
        mantineLoadingOverlayProps: {
            loaderProps: {
                color: 'violet',
            },
        },
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { estimateSize: () => 56, overscan: 40 },
        enableRowActions: false,
    });

    return <ContentTable table={table} />;
};

export default McpActivityTable;
