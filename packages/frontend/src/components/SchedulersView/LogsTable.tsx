import {
    SchedulerRunStatus,
    type SchedulerRun,
    type SchedulerRunLog,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Group,
    Menu,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronUp,
    IconClock,
    IconDots,
    IconInfoCircle,
    IconSend,
    IconTextCaption,
} from '@tabler/icons-react';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
    type MRT_ExpandedState,
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
import { Link } from 'react-router';
import ConfirmSendNowModal from '../../features/scheduler/components/ConfirmSendNowModal';
import {
    useLogsFilters,
    type DestinationType,
} from '../../features/scheduler/hooks/useLogsFilters';
import {
    useFetchRunLogs,
    useSchedulerRuns,
    useSendNowSchedulerByUuid,
} from '../../features/scheduler/hooks/useScheduler';
import useHealth from '../../hooks/health/useHealth';
import { useGetSlack } from '../../hooks/slack/useSlack';
import MantineIcon from '../common/MantineIcon';
import { LogsTopToolbar } from './LogsTopToolbar';
import {
    formatTaskName,
    formatTime,
    getLogStatusIcon,
    getRunStatusIcon,
    getSchedulerIcon,
    getSchedulerLink,
} from './SchedulersViewUtils';

type LogsTableProps = {
    projectUuid: string;
};

type RunGroup = {
    type: 'group';
    run: SchedulerRun;
    subRows?: RunLogRow[];
    childLogs?: SchedulerRunLog[];
};

type RunLogRow = {
    type: 'log';
    log: SchedulerRunLog;
    run: SchedulerRun;
};

type TableRow = RunGroup | RunLogRow;

const isRunGroup = (row: TableRow): row is RunGroup => row.type === 'group';
const isRunLogRow = (row: TableRow): row is RunLogRow => row.type === 'log';

const fetchSize = 50;

const LogsTable: FC<LogsTableProps> = ({ projectUuid }) => {
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null);
    const {
        search,
        setSearch,
        selectedStatuses,
        setSelectedStatuses,
        selectedCreatedByUserUuids,
        setSelectedCreatedByUserUuids,
        selectedDestinations,
        setSelectedDestinations,
        hasActiveFilters,
        resetFilters,
    } = useLogsFilters();

    // Debounce filters to avoid too many API calls
    const debouncedFilters = useMemo(() => {
        return {
            search,
            filters: {
                statuses: selectedStatuses,
                createdByUserUuids: selectedCreatedByUserUuids,
                destinations: selectedDestinations,
            },
        };
    }, [
        search,
        selectedStatuses,
        selectedCreatedByUserUuids,
        selectedDestinations,
    ]);

    const [debouncedSearchAndFilters] = useDebouncedValue(
        debouncedFilters,
        300,
    );

    const { data, fetchNextPage, isError, isFetching, isLoading } =
        useSchedulerRuns({
            projectUuid,
            paginateArgs: { page: 1, pageSize: fetchSize },
            searchQuery: debouncedSearchAndFilters.search,
            sortBy: 'scheduledTime',
            sortDirection: 'desc',
            filters: {
                statuses: debouncedSearchAndFilters.filters.statuses,
                createdByUserUuids:
                    debouncedSearchAndFilters.filters.createdByUserUuids,
                destinations: debouncedSearchAndFilters.filters.destinations,
            },
        });

    // Flatten paginated data
    const schedulerRunsData = useMemo(() => {
        if (!data?.pages) return undefined;

        const allRuns = data.pages.flatMap((page) => page.data);

        return allRuns;
    }, [data]);

    const totalDBRowCount = data?.pages?.[0]?.pagination?.totalResults ?? 0;
    const totalFetched = schedulerRunsData?.length ?? 0;

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

    // Scroll to top when filters change
    useEffect(() => {
        if (rowVirtualizerInstanceRef.current) {
            try {
                rowVirtualizerInstanceRef.current.scrollToIndex(0);
            } catch (e) {
                console.error(e);
            }
        }
    }, [debouncedSearchAndFilters]);

    // Check on mount if table needs initial fetch
    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const theme = useMantineTheme();
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [selectedScheduler, setSelectedScheduler] = useState<{
        uuid: string;
        name: string;
    } | null>(null);
    const [expanded, setExpanded] = useState<MRT_ExpandedState>({});
    const [childLogsMap, setChildLogsMap] = useState<
        Map<string, SchedulerRunLog[]>
    >(new Map());

    const sendNowMutation = useSendNowSchedulerByUuid(
        selectedScheduler?.uuid ?? '',
    );

    const fetchRunLogsMutation = useFetchRunLogs();

    // Fetch child logs when rows are expanded
    useEffect(() => {
        const expandedRowIds = Object.keys(expanded).filter(
            (key) => expanded[key as keyof typeof expanded],
        );

        expandedRowIds.forEach((rowId) => {
            const rowIndex = parseInt(rowId, 10);
            const run = schedulerRunsData?.[rowIndex];

            if (run && !childLogsMap.has(run.runId)) {
                // Fetch child logs for this run using the hook
                void fetchRunLogsMutation
                    .mutateAsync(run.runId)
                    .then((childLogs) => {
                        console.log(
                            `Fetched ${childLogs.length} logs for run ${run.runId}:`,
                            childLogs.map((l) => ({
                                task: l.task,
                                isParent: l.isParent,
                                status: l.status,
                                createdAt: l.createdAt,
                            })),
                        );
                        setChildLogsMap((prev) => {
                            const newMap = new Map(prev);
                            newMap.set(run.runId, childLogs);
                            return newMap;
                        });
                    })
                    .catch((error) => {
                        console.error('Error fetching child logs:', error);
                    });
            }
        });
    }, [expanded, schedulerRunsData, childLogsMap, fetchRunLogsMutation]);

    const health = useHealth();
    const slack = useGetSlack();
    const organizationHasSlack = !!slack.data?.organizationUuid;

    // Compute available destinations based on integrations
    const availableDestinations = useMemo<DestinationType[]>(() => {
        const destinations: DestinationType[] = [];
        if (health.data?.hasEmailClient) {
            destinations.push('email');
        }
        if (organizationHasSlack) {
            destinations.push('slack');
        }
        if (health.data?.hasMicrosoftTeams) {
            destinations.push('msteams');
        }
        return destinations;
    }, [health.data, organizationHasSlack]);

    // Compute available users from runs (only users who created schedulers)
    const availableUsers = useMemo(() => {
        const userMap = new Map<string, { userUuid: string; name: string }>();
        schedulerRunsData?.forEach((run) => {
            userMap.set(run.createdByUserUuid, {
                userUuid: run.createdByUserUuid,
                name: run.createdByUserName,
            });
        });
        return Array.from(userMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name),
        );
    }, [schedulerRunsData]);

    const runGroupData = useMemo<RunGroup[]>(() => {
        // Runs are already filtered and sorted by the backend
        const runs = schedulerRunsData ?? [];

        return runs.map((run): RunGroup => {
            const childLogs = childLogsMap.get(run.runId);
            const subRows = childLogs?.map(
                (log): RunLogRow => ({
                    type: 'log',
                    log,
                    run,
                }),
            );

            return {
                type: 'group',
                run,
                subRows,
                childLogs,
            };
        });
    }, [schedulerRunsData, childLogsMap]);

    // Temporary workaround to resolve a memoization issue with react-mantine-table.
    // In certain scenarios, the content fails to render properly even when the data is updated.
    // This issue may be addressed in a future library update.
    const [tableData, setTableData] = useState<RunGroup[]>([]);
    useEffect(() => {
        setTableData(runGroupData);
    }, [runGroupData]);

    const columns: MRT_ColumnDef<TableRow>[] = useMemo(
        () => [
            {
                accessorKey: 'scheduler.name',
                header: 'Name',
                enableSorting: false,
                size: 250,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconTextCaption} color="gray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const rowData = row.original;

                    // Only show name for parent rows
                    if (isRunLogRow(rowData)) {
                        return null;
                    }

                    const { run } = rowData;

                    return (
                        <Group wrap="nowrap">
                            {getSchedulerIcon(run)}
                            <Stack gap="two">
                                <Anchor
                                    component={Link}
                                    to={getSchedulerLink(run, projectUuid)}
                                    target="_blank"
                                >
                                    <Tooltip
                                        label={
                                            <Stack gap="two" fz="xs">
                                                <Text c="gray.5" fz="xs">
                                                    Scheduler:{' '}
                                                    <Text
                                                        c="white"
                                                        span
                                                        fz="xs"
                                                    >
                                                        {run.schedulerName}
                                                    </Text>
                                                </Text>
                                                <Text c="gray.5" fz="xs">
                                                    Created by:{' '}
                                                    <Text
                                                        c="white"
                                                        span
                                                        fz="xs"
                                                    >
                                                        {run.createdByUserName}
                                                    </Text>
                                                </Text>
                                            </Stack>
                                        }
                                    >
                                        <Text
                                            fw={600}
                                            fz="xs"
                                            lineClamp={1}
                                            style={{
                                                overflowWrap: 'anywhere',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {run.schedulerName}
                                        </Text>
                                    </Tooltip>
                                </Anchor>
                                <Text fz="xs" c="gray.6" maw="190px" truncate>
                                    {run.resourceName}
                                </Text>
                            </Stack>
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'logs',
                header: 'Job',
                enableSorting: false,
                size: 140,
                Cell: ({ row }) => {
                    const rowData = row.original;

                    if (isRunGroup(rowData)) {
                        // Parent row: show aggregated counts
                        const { logCounts } = rowData.run;
                        return (
                            <Text fz="xs" fw={500} c="gray.7">
                                {logCounts.total}{' '}
                                {logCounts.total === 1 ? 'job' : 'jobs'}
                            </Text>
                        );
                    } else {
                        // Child row: show task name
                        return (
                            <Group gap="two">
                                <Text fz="xs" fw={400} c="gray.7">
                                    {formatTaskName(rowData.log.task)}
                                </Text>
                                {rowData.log.targetType === 'email' && (
                                    <Tooltip
                                        variant="xs"
                                        disabled={
                                            rowData.log.targetType !== 'email'
                                        }
                                        label={rowData.log.target}
                                    >
                                        <MantineIcon
                                            icon={IconInfoCircle}
                                            color="gray.6"
                                            size="sm"
                                        />
                                    </Tooltip>
                                )}
                            </Group>
                        );
                    }
                },
            },
            {
                accessorKey: 'scheduledTime',
                header: 'Scheduled',
                enableSorting: false,
                size: 140,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconClock} color="gray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const rowData = row.original;

                    if (isRunGroup(rowData)) {
                        return (
                            <Text fz="xs" c="gray.6">
                                {formatTime(rowData.run.scheduledTime)}
                            </Text>
                        );
                    } else {
                        return (
                            <Text fz="xs" c="gray.6">
                                {formatTime(rowData.log.scheduledTime)}
                            </Text>
                        );
                    }
                },
            },
            {
                accessorKey: 'createdAt',
                header: 'Start',
                enableSorting: false,
                size: 140,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconClock} color="gray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const rowData = row.original;

                    if (isRunGroup(rowData)) {
                        return (
                            <Text fz="xs" c="gray.6">
                                {formatTime(rowData.run.createdAt)}
                            </Text>
                        );
                    } else {
                        return (
                            <Text fz="xs" c="gray.6">
                                {formatTime(rowData.log.createdAt)}
                            </Text>
                        );
                    }
                },
            },
            {
                accessorKey: 'status',
                header: 'Status',
                enableSorting: false,
                size: 90,
                Cell: ({ row }) => {
                    const rowData = row.original;

                    return (
                        <Group>
                            {isRunGroup(rowData)
                                ? getRunStatusIcon(rowData.run.runStatus, theme)
                                : getLogStatusIcon(rowData.log, theme)}

                            {isRunGroup(rowData) &&
                                (rowData.run.runStatus ===
                                    SchedulerRunStatus.FAILED ||
                                    rowData.run.runStatus ===
                                        SchedulerRunStatus.PARTIAL_FAILURE) && (
                                    <Box
                                        component="div"
                                        onClick={(
                                            e: React.MouseEvent<HTMLDivElement>,
                                        ) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                        }}
                                    >
                                        <Menu
                                            withinPortal
                                            position="bottom-start"
                                            withArrow
                                            arrowPosition="center"
                                            shadow="md"
                                            offset={-4}
                                            closeOnItemClick
                                            closeOnClickOutside
                                        >
                                            <Menu.Target>
                                                <ActionIcon
                                                    variant="subtle"
                                                    style={{
                                                        ':hover': {
                                                            backgroundColor:
                                                                theme.colors
                                                                    .gray[1],
                                                        },
                                                    }}
                                                >
                                                    <IconDots size={16} />
                                                </ActionIcon>
                                            </Menu.Target>
                                            <Menu.Dropdown maw={280}>
                                                <Menu.Item
                                                    component="button"
                                                    role="menuitem"
                                                    leftSection={
                                                        <IconSend size={18} />
                                                    }
                                                    onClick={() => {
                                                        setSelectedScheduler({
                                                            uuid: rowData.run
                                                                .schedulerUuid,
                                                            name: rowData.run
                                                                .schedulerName,
                                                        });
                                                        setIsConfirmOpen(true);
                                                    }}
                                                >
                                                    Send now
                                                </Menu.Item>
                                            </Menu.Dropdown>
                                        </Menu>
                                    </Box>
                                )}
                        </Group>
                    );
                },
            },
        ],
        [projectUuid, theme],
    );

    const table = useMantineReactTable({
        columns,
        data: tableData,
        enableExpanding: true,
        enableExpandAll: false,
        getSubRows: (row) => (isRunGroup(row) ? row.subRows : undefined),
        getRowCanExpand: (row) => isRunGroup(row.original),
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
        renderTopToolbar: () => (
            <LogsTopToolbar
                search={search}
                setSearch={setSearch}
                selectedStatuses={selectedStatuses}
                setSelectedStatuses={setSelectedStatuses}
                selectedCreatedByUserUuids={selectedCreatedByUserUuids}
                setSelectedCreatedByUserUuids={setSelectedCreatedByUserUuids}
                selectedDestinations={selectedDestinations}
                setSelectedDestinations={setSelectedDestinations}
                isFetching={isFetching || isLoading}
                currentResultsCount={totalFetched}
                hasActiveFilters={hasActiveFilters}
                resetFilters={resetFilters}
                availableUsers={availableUsers}
                availableDestinations={availableDestinations}
            />
        ),
        mantinePaperProps: {
            shadow: undefined,
            style: {
                border: `1px solid ${theme.colors.gray[2]}`,
                borderRadius: theme.spacing.sm,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
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
            const isFirstColumn =
                props.table.getAllColumns().indexOf(props.column) === 0;
            const isLastColumn =
                props.table.getAllColumns().indexOf(props.column) ===
                props.table.getAllColumns().length - 1;

            return {
                bg: 'gray.0',
                h: '3xl',
                pos: 'relative',
                style: {
                    userSelect: 'none',
                    padding: `${theme.spacing.xs} ${theme.spacing.xl}`,
                    borderBottom: `1px solid ${theme.colors.gray[2]}`,
                    borderRight: props.column.getIsResizing()
                        ? `2px solid ${theme.colors.blue[3]}`
                        : `1px solid ${
                              isLastColumn || isFirstColumn
                                  ? 'transparent'
                                  : theme.colors.gray[2]
                          }`,
                    borderTop: 'none',
                    borderLeft: 'none',
                },
            };
        },
        mantineTableHeadRowProps: {
            sx: {
                boxShadow: 'none',
            },
        },
        mantineTableBodyCellProps: () => {
            return {
                h: 48,
                style: {
                    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                    borderRight: 'none',
                    borderLeft: 'none',
                    borderBottom: `1px solid ${theme.colors.gray[2]}`,
                    borderTop: 'none',
                },
            };
        },
        mantineExpandButtonProps: ({ row }) => ({
            children: row.getIsExpanded() ? (
                <MantineIcon icon={IconChevronUp} size="sm" />
            ) : (
                <MantineIcon icon={IconChevronDown} size="sm" />
            ),
            style: {
                transform: 'none',
            },
        }),
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { overscan: 10 },
        state: {
            expanded,
            isLoading,
            showAlertBanner: isError,
            showProgressBars: isFetching,
        },
        onExpandedChange: setExpanded,
        displayColumnDefOptions: {
            'mrt-row-expand': {
                size: 40,
                header: '',
            },
        },
    });

    return (
        <>
            <MantineReactTable table={table} />
            <ConfirmSendNowModal
                opened={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                schedulerName={selectedScheduler?.name || ''}
                loading={sendNowMutation.isLoading}
                onConfirm={() => {
                    sendNowMutation.mutate();
                    setIsConfirmOpen(false);
                }}
            />
        </>
    );
};

export default LogsTable;
