import {
    assertUnreachable,
    getHumanReadableCronExpression,
    isMsTeamsTarget,
    isSchedulerGsheetsOptions,
    isSlackTarget,
    SchedulerFormat,
    SchedulerRunStatus,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Group,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconChartBar,
    IconCheck,
    IconClock,
    IconLayoutDashboard,
    IconMail,
    IconRadar,
    IconRun,
    IconTextCaption,
} from '@tabler/icons-react';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
    type MRT_SortingState,
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
import { Link, useSearchParams } from 'react-router';
import { usePaginatedSchedulers } from '../../features/scheduler/hooks/useScheduler';
import {
    useSchedulerFilters,
    type DestinationType,
} from '../../features/scheduler/hooks/useSchedulerFilters';
import useHealth from '../../hooks/health/useHealth';
import { useGetSlack } from '../../hooks/slack/useSlack';
import { useIsTruncated } from '../../hooks/useIsTruncated';
import { useProject } from '../../hooks/useProject';
import GSheetsSvg from '../../svgs/google-sheets.svg?react';
import SlackSvg from '../../svgs/slack.svg?react';
import MantineIcon from '../common/MantineIcon';
import { SchedulerTopToolbar } from './SchedulerTopToolbar';
import SchedulersViewActionMenu from './SchedulersViewActionMenu';
import {
    getSchedulerIcon,
    getSchedulerLink,
    type SchedulerItem,
} from './SchedulersViewUtils';

interface SchedulersTableProps {
    projectUuid: string;
    getSlackChannelName: (channelId: string) => string | null;
    onSlackChannelIdsChange?: (channelIds: string[]) => void;
}

const fetchSize = 50;

const getRunStatusConfig = (status: SchedulerRunStatus) => {
    switch (status) {
        case SchedulerRunStatus.COMPLETED:
            return { color: 'green', icon: IconCheck, label: 'Completed' };
        case SchedulerRunStatus.PARTIAL_FAILURE:
            return {
                color: 'yellow',
                icon: IconAlertCircle,
                label: 'Partial failure',
            };
        case SchedulerRunStatus.FAILED:
            return { color: 'red', icon: IconAlertCircle, label: 'Failed' };
        case SchedulerRunStatus.RUNNING:
            return { color: 'blue', icon: IconRun, label: 'Running' };
        case SchedulerRunStatus.SCHEDULED:
            return { color: 'gray', icon: IconClock, label: 'Scheduled' };
        default:
            return assertUnreachable(status, 'Unknown scheduler run status');
    }
};

const SchedulersTable: FC<SchedulersTableProps> = ({
    projectUuid,
    getSlackChannelName,
    onSlackChannelIdsChange,
}) => {
    const theme = useMantineTheme();
    const { data: project } = useProject(projectUuid);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null);
    const [, setSearchParams] = useSearchParams();

    const {
        search,
        selectedFormats,
        selectedResourceType,
        selectedCreatedByUserUuids,
        selectedDestinations,
        sortField,
        sortDirection,
        setSearch,
        setSelectedFormats,
        setSelectedResourceType,
        setSelectedCreatedByUserUuids,
        setSelectedDestinations,
        setSorting,
        hasActiveFilters,
        resetFilters,
        apiFilters,
    } = useSchedulerFilters();

    // Debounce filters to avoid too many API calls
    const debouncedFilters = useMemo(() => {
        return { search, apiFilters, sortField, sortDirection };
    }, [search, apiFilters, sortField, sortDirection]);

    const [debouncedSearchAndFilters] = useDebouncedValue(
        debouncedFilters,
        300,
    );

    // Use infinite query for pagination
    const { data, fetchNextPage, isError, isFetching, isLoading } =
        usePaginatedSchedulers({
            projectUuid,
            paginateArgs: { page: 1, pageSize: fetchSize },
            searchQuery: debouncedSearchAndFilters.search,
            sortBy: debouncedSearchAndFilters.sortField,
            sortDirection: debouncedSearchAndFilters.sortDirection,
            filters: debouncedSearchAndFilters.apiFilters,
            includeLatestRun: true,
        });

    const flatData = useMemo<SchedulerItem[]>(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data],
    );

    const totalDBRowCount = data?.pages?.[0]?.pagination?.totalResults ?? 0;
    const totalFetched = flatData.length;

    // Temporary workaround to resolve a memoization issue with react-mantine-table.
    // In certain scenarios, the content fails to render properly even when the data is updated.
    // This issue may be addressed in a future library update.
    const [tableData, setTableData] = useState<SchedulerItem[]>([]);
    useEffect(() => {
        setTableData(flatData);
    }, [flatData]);

    // Compute available users from loaded schedulers
    const availableUsers = useMemo(() => {
        const userMap = new Map<string, { userUuid: string; name: string }>();
        flatData.forEach((scheduler) => {
            if (scheduler.createdBy && scheduler.createdByName) {
                userMap.set(scheduler.createdBy, {
                    userUuid: scheduler.createdBy,
                    name: scheduler.createdByName,
                });
            }
        });
        return Array.from(userMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name),
        );
    }, [flatData]);

    // Extract unique Slack channel IDs from loaded schedulers and report them
    useEffect(() => {
        if (!onSlackChannelIdsChange) return;

        const channelIds = new Set<string>();
        flatData.forEach((scheduler) => {
            scheduler.targets.forEach((target) => {
                if (isSlackTarget(target)) {
                    channelIds.add(target.channel);
                }
            });
        });
        onSlackChannelIdsChange(Array.from(channelIds));
    }, [flatData, onSlackChannelIdsChange]);

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

    // Scroll to top when sorting or filters change
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

    const sorting = useMemo<MRT_SortingState>(
        () => [{ id: sortField, desc: sortDirection === 'desc' }],
        [sortField, sortDirection],
    );

    const handleSortingChange = useCallback(
        (
            updaterOrValue:
                | MRT_SortingState
                | ((old: MRT_SortingState) => MRT_SortingState),
        ) => {
            const newSorting =
                typeof updaterOrValue === 'function'
                    ? updaterOrValue(sorting)
                    : updaterOrValue;

            if (newSorting.length > 0) {
                const { id, desc } = newSorting[0];
                setSorting(id as 'name' | 'createdAt', desc ? 'desc' : 'asc');
            }
        },
        [sorting, setSorting],
    );

    const columns: MRT_ColumnDef<SchedulerItem>[] = useMemo(
        () => [
            {
                accessorKey: 'name',
                header: 'Name',
                enableSorting: true,
                size: 300,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconTextCaption} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const isTruncated = useIsTruncated<HTMLDivElement>();
                    const item = row.original;
                    const format = () => {
                        switch (item.format) {
                            case SchedulerFormat.CSV:
                                return 'CSV';
                            case SchedulerFormat.XLSX:
                                return 'XLSX';
                            case SchedulerFormat.IMAGE:
                                return 'Image';
                            case SchedulerFormat.GSHEETS:
                                return 'Google Sheets';
                            default:
                                return assertUnreachable(
                                    item.format,
                                    'Unknown scheduler format',
                                );
                        }
                    };

                    return (
                        <Group wrap="nowrap">
                            {getSchedulerIcon(item)}
                            <Stack gap="two">
                                <Anchor
                                    component={Link}
                                    to={getSchedulerLink(item, projectUuid)}
                                    target="_blank"
                                >
                                    <Tooltip
                                        fz="xs"
                                        label={
                                            <Stack gap="one" fz="xs">
                                                <Text c="ldGray.5" fz="xs">
                                                    Schedule type:{' '}
                                                    <Text
                                                        c="white"
                                                        span
                                                        fz="xs"
                                                    >
                                                        {format()}
                                                    </Text>
                                                </Text>
                                                <Text c="ldGray.5" fz="xs">
                                                    Created by:{' '}
                                                    <Text
                                                        c="white"
                                                        span
                                                        fz="xs"
                                                    >
                                                        {item.createdByName ||
                                                            'n/a'}
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
                                            ref={isTruncated.ref}
                                        >
                                            {item.name}
                                        </Text>
                                    </Tooltip>
                                </Anchor>
                                {item.savedChartName ? (
                                    <Group gap="two">
                                        <MantineIcon
                                            icon={IconChartBar}
                                            color="ldGray.6"
                                            size={12}
                                            strokeWidth={1.5}
                                        />
                                        <Text fz="xs" c="ldGray.6">
                                            {item.savedChartName}
                                        </Text>
                                    </Group>
                                ) : item.dashboardName ? (
                                    <Group gap="two">
                                        <MantineIcon
                                            icon={IconLayoutDashboard}
                                            color="ldGray.6"
                                            strokeWidth={1.5}
                                            size={12}
                                        />
                                        <Text fz="xs" c="ldGray.6">
                                            {item.dashboardName}
                                        </Text>
                                    </Group>
                                ) : null}
                            </Stack>
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'lastRunStatus',
                header: 'Last Run Status',
                enableSorting: false,
                size: 160,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconRun} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const item = row.original;
                    const latestRun = item.latestRun;

                    if (!latestRun) {
                        return (
                            <Text fz="xs" c="ldGray.6">
                                No runs yet
                            </Text>
                        );
                    }

                    const statusConfig = getRunStatusConfig(
                        latestRun.runStatus,
                    );

                    return (
                        <Tooltip
                            label={
                                <Stack gap="xxs">
                                    <Text fz="xs">
                                        Last run:{' '}
                                        {new Date(
                                            latestRun.scheduledTime,
                                        ).toLocaleString()}
                                    </Text>
                                    {latestRun.logCounts && (
                                        <Text fz="xs" c="ldGray.5">
                                            {latestRun.logCounts.completed}{' '}
                                            completed,{' '}
                                            {latestRun.logCounts.error} failed
                                        </Text>
                                    )}
                                    <Text fz="xs" c="ldGray.4" fs="italic">
                                        Click to view run history
                                    </Text>
                                </Stack>
                            }
                        >
                            <Badge
                                size="sm"
                                color={statusConfig.color}
                                leftSection={
                                    <MantineIcon
                                        icon={statusConfig.icon}
                                        size="xs"
                                    />
                                }
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                    setSearchParams({
                                        tab: 'run-history',
                                        schedulerUuid: item.schedulerUuid,
                                    });
                                }}
                            >
                                {statusConfig.label}
                            </Badge>
                        </Tooltip>
                    );
                },
            },
            {
                accessorKey: 'destinations',
                header: 'Destinations',
                enableSorting: false,
                size: 140,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconRadar} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const item = row.original;
                    const currentTargets = item.targets.filter(
                        (target) => target.schedulerUuid === item.schedulerUuid,
                    );
                    let emails: string[] = [];
                    let slackChannels: string[] = [];
                    let msTeamsTargets: string[] = [];
                    currentTargets.map((t) => {
                        if (isSlackTarget(t)) {
                            return slackChannels.push(
                                getSlackChannelName(t.channel) || t.channel,
                            );
                        } else if (isMsTeamsTarget(t)) {
                            return msTeamsTargets.push(t.webhook);
                        } else {
                            return emails.push(t.recipient);
                        }
                    });

                    return (
                        <Group gap="xxs">
                            {emails.length > 0 && (
                                <Tooltip
                                    label={emails.map((email, i) => (
                                        <Text fz="xs" key={i}>
                                            {email}
                                        </Text>
                                    ))}
                                >
                                    <Group gap="two">
                                        <MantineIcon
                                            icon={IconMail}
                                            color="ldGray.6"
                                        />
                                        <Text fz="xs" c="ldGray.6">
                                            {slackChannels.length > 0
                                                ? 'Email,'
                                                : 'Email'}
                                        </Text>
                                    </Group>
                                </Tooltip>
                            )}
                            {slackChannels.length > 0 && (
                                <Tooltip
                                    label={slackChannels.map((channel, i) => (
                                        <Text fz="xs" key={i}>
                                            {channel}
                                        </Text>
                                    ))}
                                >
                                    <Group gap="two">
                                        <SlackSvg
                                            style={{
                                                margin: '5px 2px',
                                                width: '12px',
                                                height: '12px',
                                                filter: 'grayscale(100%)',
                                            }}
                                        />
                                        <Text fz="xs" c="ldGray.6">
                                            Slack
                                        </Text>
                                    </Group>
                                </Tooltip>
                            )}
                            {item.format === SchedulerFormat.GSHEETS &&
                                isSchedulerGsheetsOptions(item.options) && (
                                    <Tooltip label={item.options.gdriveName}>
                                        <Group gap="two">
                                            <GSheetsSvg
                                                style={{
                                                    margin: '5px 2px',
                                                    width: '12px',
                                                    height: '12px',
                                                    filter: 'grayscale(100%)',
                                                }}
                                            />
                                            <Anchor
                                                fz="xs"
                                                c="ldGray.6"
                                                href={item.options.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                style={{
                                                    textDecoration: 'underline',
                                                }}
                                            >
                                                Google Sheets
                                            </Anchor>
                                        </Group>
                                    </Tooltip>
                                )}
                            {item.format !== SchedulerFormat.GSHEETS &&
                                slackChannels.length === 0 &&
                                emails.length === 0 && (
                                    <Text fz="xs" c="ldGray.6">
                                        No destinations
                                    </Text>
                                )}
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'frequency',
                header: 'Frequency',
                enableSorting: false,
                size: 150,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const item = row.original;
                    return (
                        <Text fz="xs" c="ldGray.6">
                            {project &&
                                getHumanReadableCronExpression(
                                    item.cron,
                                    item.timezone || project.schedulerTimezone,
                                )}
                        </Text>
                    );
                },
            },

            {
                accessorKey: 'createdAt',
                header: 'Created',
                enableSorting: true,
                size: 130,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const item = row.original;
                    return (
                        <Text fz="sm" c="ldGray.7">
                            {new Date(item.createdAt).toLocaleDateString()}
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
                    const item = row.original;
                    return (
                        <Box
                            component="div"
                            onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                                e.stopPropagation();
                                e.preventDefault();
                            }}
                        >
                            <SchedulersViewActionMenu
                                item={item}
                                projectUuid={projectUuid}
                            />
                        </Box>
                    );
                },
            },
        ],
        [project, projectUuid, getSlackChannelName, setSearchParams],
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
        enableSorting: true,
        enableRowVirtualization: true,
        manualSorting: true,
        onSortingChange: handleSortingChange,
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
            <SchedulerTopToolbar
                search={search}
                setSearch={setSearch}
                selectedFormats={selectedFormats}
                setSelectedFormats={setSelectedFormats}
                selectedResourceType={selectedResourceType}
                setSelectedResourceType={setSelectedResourceType}
                selectedCreatedByUserUuids={selectedCreatedByUserUuids}
                setSelectedCreatedByUserUuids={setSelectedCreatedByUserUuids}
                selectedDestinations={selectedDestinations}
                setSelectedDestinations={setSelectedDestinations}
                isFetching={isFetching || isLoading}
                currentResultsCount={totalFetched}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={resetFilters}
                availableUsers={availableUsers}
                availableDestinations={availableDestinations}
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
            sorting,
            isLoading,
            showAlertBanner: isError,
            showProgressBars: isFetching,
            density: 'md',
        },
    });

    return <MantineReactTable table={table} />;
};

export default SchedulersTable;
