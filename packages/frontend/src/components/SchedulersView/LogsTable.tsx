import {
    SchedulerJobStatus,
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
    IconAlertTriangleFilled,
    IconClock,
    IconDots,
    IconSend,
    IconTextCaption,
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
import LoadingState from '../common/LoadingState';
import MantineIcon from '../common/MantineIcon';
import ResourceEmptyState from '../common/ResourceView/ResourceEmptyState';
import { LogsTopToolbar } from './LogsTopToolbar';
import RunDetailsModal from './RunDetailsModal';
import {
    formatTime,
    getLogStatusIconWithoutTooltip,
    getSchedulerIcon,
    getSchedulerLink,
} from './SchedulersViewUtils';

type LogsTableProps = {
    projectUuid: string;
    getSlackChannelName: (channelId: string) => string | null;
};

type TableRow = {
    run: SchedulerRun;
};

const fetchSize = 50;

const LogsTable: FC<LogsTableProps> = ({
    projectUuid,
    getSlackChannelName,
}) => {
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
        selectedSchedulerUuid,
        setSelectedSchedulerUuid,
        hasActiveFilters,
        resetFilters,
    } = useLogsFilters();

    // Debounce filters to avoid too many API calls
    const debouncedFilters = useMemo(() => {
        return {
            search,
            filters: {
                schedulerUuid: selectedSchedulerUuid,
                statuses: selectedStatuses,
                createdByUserUuids: selectedCreatedByUserUuids,
                destinations: selectedDestinations,
            },
        };
    }, [
        search,
        selectedSchedulerUuid,
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
                schedulerUuid: debouncedSearchAndFilters.filters.schedulerUuid,
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
    const [selectedRun, setSelectedRun] = useState<SchedulerRun | null>(null);
    const [childLogsMap, setChildLogsMap] = useState<
        Map<string, SchedulerRunLog[]>
    >(new Map());

    const sendNowMutation = useSendNowSchedulerByUuid(
        selectedScheduler?.uuid ?? '',
    );

    const fetchRunLogsMutation = useFetchRunLogs();

    // Handle row click to open modal and fetch child logs
    const handleRowClick = useCallback(
        (run: SchedulerRun) => {
            setSelectedRun(run);

            // Fetch logs if not already in cache
            if (!childLogsMap.has(run.runId)) {
                void fetchRunLogsMutation
                    .mutateAsync(run.runId)
                    .then((childLogs) => {
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
        },
        [childLogsMap, fetchRunLogsMutation],
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

    // Compute available schedulers from runs (unique schedulers)
    const availableSchedulers = useMemo(() => {
        const schedulerMap = new Map<
            string,
            { schedulerUuid: string; name: string }
        >();
        schedulerRunsData?.forEach((run) => {
            if (!schedulerMap.has(run.schedulerUuid)) {
                schedulerMap.set(run.schedulerUuid, {
                    schedulerUuid: run.schedulerUuid,
                    name: run.schedulerName,
                });
            }
        });
        return Array.from(schedulerMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name),
        );
    }, [schedulerRunsData]);

    const tableData = useMemo<TableRow[]>(() => {
        // Runs are already filtered and sorted by the backend
        const runs = schedulerRunsData ?? [];

        return runs.map(
            (run): TableRow => ({
                run,
            }),
        );
    }, [schedulerRunsData]);

    const columns: MRT_ColumnDef<TableRow>[] = useMemo(
        () => [
            {
                accessorKey: 'scheduler.name',
                header: 'Name',
                enableSorting: false,
                size: 250,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconTextCaption} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const { run } = row.original;

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
                                                <Text c="ldGray.5" fz="xs">
                                                    Scheduler:{' '}
                                                    <Text
                                                        c="white"
                                                        span
                                                        fz="xs"
                                                    >
                                                        {run.schedulerName}
                                                    </Text>
                                                </Text>
                                                <Text c="ldGray.5" fz="xs">
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
                                <Text fz="xs" c="ldGray.6" maw="190px" truncate>
                                    {run.resourceName}
                                </Text>
                            </Stack>
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'status',
                header: 'Status',
                enableSorting: false,
                size: 220,
                Cell: ({ row }) => {
                    const { run } = row.original;
                    return (
                        <Group gap="xs">
                            {run.runStatus === SchedulerRunStatus.COMPLETED ? (
                                <>
                                    {getLogStatusIconWithoutTooltip(
                                        SchedulerJobStatus.COMPLETED,
                                        theme,
                                    )}
                                    <Text fz="xs" c="gray.7">
                                        Completed successfully
                                    </Text>
                                </>
                            ) : run.runStatus === SchedulerRunStatus.FAILED ? (
                                <>
                                    {getLogStatusIconWithoutTooltip(
                                        SchedulerJobStatus.ERROR,
                                        theme,
                                    )}
                                    <Text fz="xs" c="gray.7">
                                        Failed
                                    </Text>
                                </>
                            ) : run.runStatus ===
                              SchedulerRunStatus.PARTIAL_FAILURE ? (
                                <>
                                    <MantineIcon
                                        icon={IconAlertTriangleFilled}
                                        color="orange.6"
                                        style={{
                                            color: theme.colors.orange[6],
                                        }}
                                    />
                                    <Text fz="xs" c="gray.7">
                                        Partial failure
                                    </Text>
                                </>
                            ) : run.runStatus === SchedulerRunStatus.RUNNING ? (
                                <>
                                    {getLogStatusIconWithoutTooltip(
                                        SchedulerJobStatus.STARTED,
                                        theme,
                                    )}
                                    <Text fz="xs" c="gray.7">
                                        Running
                                    </Text>
                                </>
                            ) : (
                                <>
                                    {getLogStatusIconWithoutTooltip(
                                        SchedulerJobStatus.SCHEDULED,
                                        theme,
                                    )}
                                    <Text fz="xs" c="gray.7">
                                        Scheduled
                                    </Text>
                                </>
                            )}
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'scheduledTime',
                header: 'Scheduled',
                enableSorting: false,
                size: 140,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const { run } = row.original;
                    return (
                        <Text fz="xs" c="gray.6">
                            {formatTime(run.scheduledTime)}
                        </Text>
                    );
                },
            },
            {
                accessorKey: 'createdAt',
                header: 'Start',
                enableSorting: false,
                size: 140,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const { run } = row.original;
                    return (
                        <Text fz="xs" c="gray.6">
                            {formatTime(run.createdAt)}
                        </Text>
                    );
                },
            },
            {
                accessorKey: 'actions',
                header: '',
                enableSorting: false,
                size: 60,
                Cell: ({ row }) => {
                    const { run } = row.original;

                    return (
                        <Group justify="center">
                            {(run.runStatus === SchedulerRunStatus.FAILED ||
                                run.runStatus ===
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
                                                        uuid: run.schedulerUuid,
                                                        name: run.schedulerName,
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
        [projectUuid, theme, setSelectedScheduler, setIsConfirmOpen],
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
                selectedSchedulerUuid={selectedSchedulerUuid}
                setSelectedSchedulerUuid={setSelectedSchedulerUuid}
                isFetching={isFetching || isLoading}
                currentResultsCount={totalFetched}
                hasActiveFilters={hasActiveFilters}
                resetFilters={resetFilters}
                availableUsers={availableUsers}
                availableDestinations={availableDestinations}
                availableSchedulers={availableSchedulers}
            />
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
                              isLastColumn || isFirstColumn
                                  ? 'transparent'
                                  : theme.colors.ldGray[2]
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
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                    borderTop: 'none',
                },
            };
        },
        mantineTableBodyRowProps: ({ row }) => ({
            onClick: () => handleRowClick(row.original.run),
            style: {
                cursor: 'pointer',
            },
        }),
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { overscan: 10 },
        state: {
            isLoading,
            showAlertBanner: isError,
            showProgressBars: isFetching,
        },
    });

    if (isLoading) {
        return <LoadingState title="Loading run history" />;
    }

    if (totalDBRowCount === 0) {
        return (
            <ResourceEmptyState
                title="No scheduled delivery runs yet"
                description="Scheduled deliveries will appear here once they run. Check back later or hit the refresh button."
            />
        );
    }

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
            {!!selectedRun && (
                <RunDetailsModal
                    opened={!!selectedRun}
                    onClose={() => setSelectedRun(null)}
                    run={selectedRun}
                    childLogs={
                        selectedRun
                            ? childLogsMap.get(selectedRun.runId)
                            : undefined
                    }
                    isLoading={
                        !!selectedRun &&
                        !childLogsMap.has(selectedRun.runId) &&
                        fetchRunLogsMutation.isLoading
                    }
                    getSlackChannelName={getSlackChannelName}
                />
            )}
        </>
    );
};

export default LogsTable;
