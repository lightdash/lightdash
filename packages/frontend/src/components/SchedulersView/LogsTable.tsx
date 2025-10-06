import { SchedulerJobStatus } from '@lightdash/common';
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
    IconSend,
    IconTextCaption,
} from '@tabler/icons-react';
import groupBy from 'lodash/groupBy';
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
    useSchedulerLogs,
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
    getSchedulerIcon,
    getSchedulerLink,
    type Log,
    type SchedulerItem,
} from './SchedulersViewUtils';

type LogsTableProps = {
    projectUuid: string;
};

type LogGroup = {
    type: 'group';
    jobGroup: string;
    scheduler: SchedulerItem;
    logs: Log[];
    subRows: LogRow[];
};

type LogRow = {
    type: 'log';
    log: Log;
    scheduler: SchedulerItem;
};

type TableRow = LogGroup | LogRow;

const isLogGroup = (row: TableRow): row is LogGroup => row.type === 'group';
const isLogRow = (row: TableRow): row is LogRow => row.type === 'log';

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
        useSchedulerLogs({
            projectUuid,
            paginateArgs: { page: 1, pageSize: fetchSize },
            searchQuery: debouncedSearchAndFilters.search,
            filters: debouncedSearchAndFilters.filters,
        });

    // Flatten paginated data
    const schedulerLogsData = useMemo(() => {
        if (!data?.pages) return undefined;

        const allLogs = data.pages.flatMap((page) => page.data.logs);
        const firstPage = data.pages[0];

        return {
            schedulers: firstPage?.data.schedulers || [],
            users: firstPage?.data.users || [],
            charts: firstPage?.data.charts || [],
            dashboards: firstPage?.data.dashboards || [],
            logs: allLogs,
        };
    }, [data]);

    const totalDBRowCount = data?.pages?.[0]?.pagination?.totalResults ?? 0;
    const totalFetched = schedulerLogsData?.logs.length ?? 0;

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

    const sendNowMutation = useSendNowSchedulerByUuid(
        selectedScheduler?.uuid ?? '',
    );

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

    // Compute available users from schedulers (only users who created schedulers)
    const availableUsers = useMemo(() => {
        const userMap = new Map<
            string,
            { userUuid: string; firstName: string; lastName: string }
        >();
        schedulerLogsData?.schedulers.forEach((scheduler) => {
            const user = schedulerLogsData?.users.find(
                (u) => u.userUuid === scheduler.createdBy,
            );
            if (user) {
                userMap.set(user.userUuid, {
                    userUuid: user.userUuid,
                    firstName: user.firstName,
                    lastName: user.lastName,
                });
            }
        });
        return Array.from(userMap.values()).sort((a, b) =>
            `${a.firstName} ${a.lastName}`.localeCompare(
                `${b.firstName} ${b.lastName}`,
            ),
        );
    }, [schedulerLogsData]);

    const groupedLogData = useMemo<LogGroup[]>(() => {
        // Logs are already filtered by the backend
        const logs = schedulerLogsData?.logs ?? [];

        const grouped = Object.entries(groupBy(logs, 'jobGroup'));
        return grouped
            .map(([jobGroup, schedulerLogs]): LogGroup | null => {
                const schedulerItem = schedulerLogsData?.schedulers.find(
                    (item) =>
                        item.schedulerUuid === schedulerLogs[0].schedulerUuid,
                );
                if (!schedulerItem) return null;

                // Create sub-rows for each log
                const subRows: LogRow[] = schedulerLogs.map((log) => ({
                    type: 'log',
                    log,
                    scheduler: schedulerItem,
                }));

                return {
                    type: 'group',
                    jobGroup,
                    scheduler: schedulerItem,
                    logs: schedulerLogs,
                    subRows,
                };
            })
            .filter((item): item is LogGroup => item !== null);
    }, [schedulerLogsData]);

    // Temporary workaround to resolve a memoization issue with react-mantine-table.
    // In certain scenarios, the content fails to render properly even when the data is updated.
    // This issue may be addressed in a future library update.
    const [tableData, setTableData] = useState<LogGroup[]>([]);
    useEffect(() => {
        setTableData(groupedLogData);
    }, [groupedLogData]);

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
                    if (isLogRow(rowData)) {
                        return null;
                    }

                    const { scheduler } = rowData;
                    const user = schedulerLogsData?.users.find(
                        (u) => u.userUuid === scheduler.createdBy,
                    );
                    const chartOrDashboard = scheduler.savedChartUuid
                        ? schedulerLogsData?.charts.find(
                              (chart) =>
                                  chart.savedChartUuid ===
                                  scheduler.savedChartUuid,
                          )
                        : schedulerLogsData?.dashboards.find(
                              (dashboard) =>
                                  dashboard.dashboardUuid ===
                                  scheduler.dashboardUuid,
                          );

                    return (
                        <Group wrap="nowrap">
                            {getSchedulerIcon(scheduler)}
                            <Stack gap="two">
                                <Anchor
                                    component={Link}
                                    to={getSchedulerLink(
                                        scheduler,
                                        projectUuid,
                                    )}
                                    target="_blank"
                                >
                                    <Tooltip
                                        label={
                                            <Stack gap="two" fz="xs">
                                                <Text c="gray.5" fz="xs">
                                                    Schedule type:{' '}
                                                    <Text
                                                        c="white"
                                                        span
                                                        fz="xs"
                                                    >
                                                        {scheduler.format ===
                                                        'csv'
                                                            ? 'CSV'
                                                            : 'Image'}
                                                    </Text>
                                                </Text>
                                                <Text c="gray.5" fz="xs">
                                                    Created by:{' '}
                                                    <Text
                                                        c="white"
                                                        span
                                                        fz="xs"
                                                    >
                                                        {user?.firstName}{' '}
                                                        {user?.lastName}
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
                                            {scheduler.name}
                                        </Text>
                                    </Tooltip>
                                </Anchor>
                                <Text fz="xs" c="gray.6" maw="190px" truncate>
                                    {chartOrDashboard?.name}
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

                    if (isLogGroup(rowData)) {
                        // Parent row: show "All jobs"
                        return (
                            <Text fz="xs" fw={500} c="gray.7">
                                All jobs
                            </Text>
                        );
                    } else {
                        // Child row: show task name
                        return (
                            <Text fz="xs" fw={400} c="gray.7">
                                {formatTaskName(rowData.log.task)}
                            </Text>
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

                    if (isLogGroup(rowData)) {
                        const firstLog = rowData.logs[0];
                        return (
                            <Text fz="xs" c="gray.6">
                                {firstLog
                                    ? formatTime(firstLog.scheduledTime)
                                    : '-'}
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

                    if (isLogGroup(rowData)) {
                        const firstLog = rowData.logs[0];
                        return (
                            <Text fz="xs" c="gray.6">
                                {firstLog
                                    ? formatTime(firstLog.createdAt)
                                    : '-'}
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
                    const { scheduler } = rowData;

                    return (
                        <Group>
                            {isLogGroup(rowData) ? (
                                rowData.logs[0] ? (
                                    getLogStatusIcon(rowData.logs[0], theme)
                                ) : (
                                    <Text fz="xs" c="gray.6">
                                        -
                                    </Text>
                                )
                            ) : (
                                getLogStatusIcon(rowData.log, theme)
                            )}

                            {isLogGroup(rowData) &&
                                rowData.logs[0]?.status ===
                                    SchedulerJobStatus.ERROR && (
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
                                                            uuid: scheduler.schedulerUuid,
                                                            name: scheduler.name,
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
        [schedulerLogsData, projectUuid, theme],
    );

    const table = useMantineReactTable({
        columns,
        data: tableData,
        enableExpanding: true,
        getSubRows: (row) => (isLogGroup(row) ? row.subRows : undefined),
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
            style: { maxHeight: 'calc(100dvh - 500px)' },
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
