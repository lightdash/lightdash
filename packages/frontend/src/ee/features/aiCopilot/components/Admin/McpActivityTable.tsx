import {
    type McpActivityItem,
    type McpActivitySortField,
} from '@lightdash/common';
import { Box, Group, Text, Tooltip, useMantineTheme } from '@mantine-8/core';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconBox,
    IconChevronDown,
    IconChevronRight,
    IconClock,
    IconDeviceLaptop,
    IconHourglass,
    IconLink,
    IconPlugConnected,
    IconRobotFace,
    IconTool,
    IconUnlink,
    IconUser,
} from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
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
import { ToolCallStatusIndicator, ToolNamePill } from './McpActivityDisplay';
import {
    formatToolCallDuration,
    formatToolCallTime,
    formatToolCallTimeFull,
} from './mcpActivityFormat';
import {
    buildFlatRows,
    buildSessionRows,
    type McpActivityRow,
    type McpSessionHeaderRow,
} from './mcpActivitySessionRows';
import styles from './McpActivityTable.module.css';
import { McpActivityTopToolbar } from './McpActivityTopToolbar';

type McpActivityTableProps = {
    onCallSelect?: (toolCall: McpActivityItem) => void;
    selectedCall?: McpActivityItem | null;
};

const SessionHeaderLabel: FC<{
    session: McpSessionHeaderRow;
    isCollapsed: boolean;
}> = ({ session, isCollapsed }) => (
    <Group gap="xs" wrap="nowrap">
        <MantineIcon
            icon={isCollapsed ? IconChevronRight : IconChevronDown}
            color="ldGray.6"
        />
        <MantineIcon
            icon={session.sessionId ? IconLink : IconUnlink}
            color="ldGray.6"
        />
        {session.sessionId ? (
            <Tooltip withinPortal label={session.sessionId}>
                <Text fz="xs" ff="monospace" fw={600} c="ldGray.9">
                    {session.sessionId.slice(0, 8)}
                </Text>
            </Tooltip>
        ) : (
            <Text fz="sm" fs="italic" c="ldGray.6">
                No session ID
            </Text>
        )}
    </Group>
);

// Extracted so the useIsTruncated hook isn't called conditionally from a
// Cell that also renders session-header rows
const ClientCellContent: FC<{ call: McpActivityItem }> = ({ call }) => {
    const isTruncated = useIsTruncated<HTMLDivElement>();
    const { clientName, clientVersion, userAgent } = call;
    const label = clientName
        ? `${clientName}${clientVersion ? ` ${clientVersion}` : ''}`
        : (userAgent ?? 'Unknown');
    return (
        <Tooltip
            withinPortal
            label={userAgent ?? label}
            disabled={!isTruncated.isTruncated && !userAgent}
            multiline
            maw={300}
        >
            <Text c="ldGray.9" fz="sm" fw={400} truncate ref={isTruncated.ref}>
                {label}
            </Text>
        </Tooltip>
    );
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

    const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
        new Set(),
    );
    const toggleGroup = useCallback((groupKey: string) => {
        setCollapsedGroups((previous) => {
            const next = new Set(previous);
            if (next.has(groupKey)) {
                next.delete(groupKey);
            } else {
                next.add(groupKey);
            }
            return next;
        });
    }, []);

    // Session grouping relies on calls being time-ordered, so it's disabled
    // when sorting by duration
    const isSessionGroupingEnabled = sortField === 'createdAt';
    const rows = useMemo(
        () =>
            isSessionGroupingEnabled
                ? buildSessionRows(flatData, collapsedGroups)
                : buildFlatRows(flatData),
        [flatData, collapsedGroups, isSessionGroupingEnabled],
    );

    // Temporary workaround to resolve a memoization issue with react-mantine-table
    const [tableData, setTableData] = useState<McpActivityRow[]>([]);
    useEffect(() => {
        setTableData(rows);
    }, [rows]);

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

    const columns: ContentTableColumnDef<McpActivityRow>[] = [
        {
            id: 'createdAt',
            accessorFn: (row) =>
                row.type === 'call' ? row.call.createdAt : row.latestCallAt,
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
            Cell: ({ row }) =>
                row.original.type === 'session' ? (
                    <SessionHeaderLabel
                        session={row.original}
                        isCollapsed={collapsedGroups.has(row.original.groupKey)}
                    />
                ) : (
                    <Tooltip
                        withinPortal
                        label={formatToolCallTimeFull(
                            row.original.call.createdAt,
                        )}
                    >
                        <Text
                            fz="xs"
                            ff="monospace"
                            c="ldGray.7"
                            display="inline-block"
                        >
                            {formatToolCallTime(row.original.call.createdAt)}
                        </Text>
                    </Tooltip>
                ),
        },
        {
            id: 'toolName',
            accessorFn: (row) =>
                row.type === 'call' ? row.call.toolName : null,
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
            Cell: ({ row }) =>
                row.original.type === 'session' ? (
                    <Text fz="sm" fw={500} c="ldGray.7">
                        {row.original.callCount}{' '}
                        {row.original.callCount === 1 ? 'call' : 'calls'}
                    </Text>
                ) : (
                    <ToolNamePill name={row.original.call.toolName} />
                ),
        },
        {
            id: 'user.name',
            accessorFn: (row) =>
                row.type === 'call' ? row.call.user.name : null,
            header: 'User',
            enableSorting: false,
            enableEditing: false,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconUser} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) =>
                row.original.type === 'session' ? null : (
                    <Tooltip withinPortal label={row.original.call.user.email}>
                        <Text c="ldGray.9" fz="sm" fw={400}>
                            {row.original.call.user.name}
                        </Text>
                    </Tooltip>
                ),
        },
        {
            id: 'project.name',
            accessorFn: (row) =>
                row.type === 'call' ? row.call.project?.name : null,
            header: 'Project',
            enableSorting: false,
            enableEditing: false,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconBox} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) =>
                row.original.type === 'session' ? null : (
                    <Text c="ldGray.9" fz="sm" fw={400}>
                        {row.original.call.project?.name ?? '—'}
                    </Text>
                ),
        },
        {
            id: 'agent.name',
            accessorFn: (row) =>
                row.type === 'call' ? row.call.agent?.name : null,
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
            Cell: ({ row }) => {
                if (row.original.type === 'session') return null;
                return row.original.call.agent ? (
                    <AgentNamePill
                        name={row.original.call.agent.name}
                        imageUrl={null}
                    />
                ) : (
                    <Text c="ldGray.5" fz="sm">
                        —
                    </Text>
                );
            },
        },
        {
            id: 'clientName',
            accessorFn: (row) =>
                row.type === 'call' ? row.call.clientName : row.clientName,
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
                if (row.original.type === 'session') {
                    const { clientName, clientVersion, sessionId } =
                        row.original;
                    const label = clientName
                        ? `${clientName}${
                              clientVersion ? ` ${clientVersion}` : ''
                          }`
                        : '—';
                    return (
                        <Group gap="xs" wrap="nowrap">
                            <Text c="ldGray.7" fz="sm" fw={500} truncate>
                                {label}
                            </Text>
                            {!sessionId && (
                                <Text fz="xs" c="ldGray.5" flex="0 0 auto">
                                    not reported
                                </Text>
                            )}
                        </Group>
                    );
                }
                return <ClientCellContent call={row.original.call} />;
            },
        },
        {
            id: 'status',
            accessorFn: (row) => (row.type === 'call' ? row.call.status : null),
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
            Cell: ({ row }) =>
                row.original.type === 'session' ? (
                    row.original.errorCount > 0 ? (
                        <Text fz="sm" fw={500} c="ldGray.7">
                            {row.original.errorCount}{' '}
                            {row.original.errorCount === 1 ? 'error' : 'errors'}
                        </Text>
                    ) : null
                ) : (
                    <ToolCallStatusIndicator
                        status={row.original.call.status}
                    />
                ),
        },
        {
            id: 'durationMs',
            accessorFn: (row) =>
                row.type === 'call' ? row.call.durationMs : null,
            header: 'Duration',
            enableSorting: true,
            enableEditing: false,
            size: 120,
            mantineTableHeadCellProps: {
                className: styles.durationHeadCell,
            },
            mantineTableBodyCellProps: { ta: 'right' },
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconHourglass} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                if (row.original.type === 'session') {
                    return (
                        <Text fz="xs" ff="monospace" c="ldGray.7">
                            {formatToolCallTime(row.original.latestCallAt)}
                        </Text>
                    );
                }
                const { durationMs } = row.original.call;
                const isSlow = durationMs >= 1000;
                return (
                    <Text
                        fz="xs"
                        ff="monospace"
                        fw={isSlow ? 600 : 400}
                        c={isSlow ? 'ldGray.9' : 'ldGray.7'}
                    >
                        {formatToolCallDuration(durationMs)}
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
        getRowId: (row) =>
            row.type === 'session' ? `session:${row.groupKey}` : row.call.uuid,
        mantineTableBodyRowProps: ({ row, table: mantineTable }) => {
            if (mantineTable.getState().showSkeletons) {
                return {};
            }
            if (row.original.type === 'session') {
                const { groupKey } = row.original;
                return {
                    style: {
                        cursor: 'pointer',
                        backgroundColor: theme.colors.ldGray[0],
                    },
                    onClick: () => toggleGroup(groupKey),
                };
            }
            const toolCall = row.original.call;
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
