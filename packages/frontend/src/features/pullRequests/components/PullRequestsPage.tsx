import {
    formatTimestamp,
    PullRequestState,
    TimeFrames,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Center,
    Drawer,
    Group,
    SegmentedControl,
    Stack,
    Text,
    ThemeIcon,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconAlertCircle,
    IconExternalLink,
    IconGitPullRequest,
    IconMessageCircle,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type UIEvent,
} from 'react';
import { CategoryBadge } from '../../../components/common/CategoryBadge/CategoryBadge';
import {
    ContentTable,
    useContentTable,
    type MRT_ColumnDef,
} from '../../../components/common/ContentTable';
import MantineIcon from '../../../components/common/MantineIcon';
import { NAVBAR_HEIGHT } from '../../../components/common/Page/constants';
import { ThreadPreviewSidebar } from '../../../ee/features/aiCopilot/components/Admin/ThreadPreviewSidebar';
import { usePullRequestsTable } from '../hooks/usePullRequestsTable';
import { type PullRequestRow } from '../types';
import {
    EMPTY_VALUE,
    getProviderLabel,
    getSourceColor,
    getSourceLabel,
    getStateColor,
    getThreadPath,
} from '../utils';
import classes from './PullRequestsPage.module.css';

dayjs.extend(relativeTime);

type Props = { projectUuid: string };

/** State filter values, including a virtual "all" that applies no filter. */
type StateFilter = 'open' | 'merged' | 'closed' | 'all';

const STATE_FILTER_OPTIONS: { label: string; value: StateFilter }[] = [
    { label: 'Open', value: 'open' },
    { label: 'Merged', value: 'merged' },
    { label: 'Closed', value: 'closed' },
    { label: 'All', value: 'all' },
];

/** A PR's live state can be null (resolution failed); those show only under "all". */
const matchesStateFilter = (
    row: PullRequestRow,
    filter: StateFilter,
): boolean => {
    switch (filter) {
        case 'all':
            return true;
        case 'open':
            return row.state === PullRequestState.OPEN;
        case 'merged':
            return row.state === PullRequestState.MERGED;
        case 'closed':
            return row.state === PullRequestState.CLOSED;
        default:
            return true;
    }
};

const PullRequestsPage: FC<Props> = ({ projectUuid }) => {
    const theme = useMantineTheme();
    const {
        rows,
        totalResults,
        isLoading,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
        error,
    } = usePullRequestsTable(projectUuid);

    const [stateFilter, setStateFilter] = useState<StateFilter>('open');
    const [previewPr, setPreviewPr] = useState<PullRequestRow | null>(null);

    const filteredRows = useMemo(
        () => rows.filter((row) => matchesStateFilter(row, stateFilter)),
        [rows, stateFilter],
    );

    const tableContainerRef = useRef<HTMLDivElement>(null);

    // Fetch the next page once the user scrolls near the bottom of the table.
    const fetchMoreOnBottomReached = useCallback(
        (container?: HTMLDivElement | null) => {
            if (!container) return;
            const { scrollHeight, scrollTop, clientHeight } = container;
            if (
                scrollHeight - scrollTop - clientHeight < 400 &&
                !isFetchingNextPage &&
                hasNextPage
            ) {
                void fetchNextPage();
            }
        },
        [fetchNextPage, isFetchingNextPage, hasNextPage],
    );

    // The first page (or the filtered subset) may not fill the viewport — fetch
    // more on mount and whenever the filter changes.
    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached, stateFilter]);

    const columns = useMemo<MRT_ColumnDef<PullRequestRow>[]>(
        () => [
            {
                id: 'medallion',
                header: '',
                enableSorting: false,
                size: 56,
                Cell: ({ row }) => (
                    <ThemeIcon
                        variant="light"
                        color={getStateColor(row.original.state)}
                        radius="xl"
                        size={34}
                        className={classes.medallion}
                    >
                        <MantineIcon icon={IconGitPullRequest} size="md" />
                    </ThemeIcon>
                ),
            },
            {
                id: 'source',
                header: 'Source',
                enableSorting: false,
                size: 120,
                Cell: ({ row }) => (
                    <CategoryBadge
                        label={getSourceLabel(row.original.source)}
                        color={getSourceColor(row.original.source)}
                        variant="dot"
                    />
                ),
            },
            {
                accessorKey: 'title',
                header: 'Pull request',
                enableSorting: false,
                size: 520,
                Cell: ({ row }) => {
                    const pr = row.original;
                    return (
                        <Stack gap={2} className={classes.title}>
                            {pr.title ? (
                                <Tooltip
                                    label={pr.title}
                                    openDelay={400}
                                    multiline
                                    maw={420}
                                    withinPortal
                                >
                                    <Text size="sm" fw={500} truncate>
                                        {pr.title}
                                    </Text>
                                </Tooltip>
                            ) : (
                                <Text size="sm" fw={500} c="dimmed">
                                    {EMPTY_VALUE}
                                </Text>
                            )}
                            <Tooltip
                                label={formatTimestamp(
                                    pr.createdAt,
                                    TimeFrames.MINUTE,
                                )}
                                openDelay={300}
                                withinPortal
                            >
                                <Text fz="xs" c="dimmed" truncate span>
                                    opened {dayjs(pr.createdAt).fromNow()}
                                    {pr.author ? ` by ${pr.author.name}` : ''}
                                </Text>
                            </Tooltip>
                        </Stack>
                    );
                },
            },
        ],
        [],
    );

    const table = useContentTable({
        columns,
        data: filteredRows,
        enableSorting: false,
        enablePagination: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableColumnResizing: false,
        enableDensityToggle: false,
        enableFullScreenToggle: false,
        enableFilters: false,
        enableHiding: false,
        enableRowVirtualization: true,
        enableRowActions: true,
        positionActionsColumn: 'last',
        displayColumnDefOptions: {
            'mrt-row-actions': {
                header: '',
                size: 96,
            },
        },
        renderRowActions: ({ row }) => {
            const pr = row.original;
            const threadPath = getThreadPath(pr);
            return (
                <Group gap="two" wrap="nowrap" className={classes.rowActions}>
                    {threadPath !== null ? (
                        <Tooltip
                            label="Preview thread"
                            openDelay={300}
                            withinPortal
                        >
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label="Preview thread"
                                onClick={() => setPreviewPr(pr)}
                            >
                                <MantineIcon icon={IconMessageCircle} />
                            </ActionIcon>
                        </Tooltip>
                    ) : null}
                    <Tooltip
                        label={`View on ${getProviderLabel(pr.provider)}`}
                        openDelay={300}
                        withinPortal
                    >
                        <ActionIcon
                            component="a"
                            href={pr.prUrl}
                            target="_blank"
                            rel="noreferrer"
                            variant="subtle"
                            color="dark"
                            aria-label={`View pull request on ${getProviderLabel(
                                pr.provider,
                            )}`}
                        >
                            <MantineIcon icon={IconExternalLink} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            );
        },
        mantinePaperProps: {
            shadow: undefined,
            sx: {
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            },
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            sx: { maxHeight: 'calc(100dvh - 260px)' },
            onScroll: (event: UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.currentTarget),
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: false,
        },
        mantineTableBodyRowProps: { className: classes.bodyRow },
        renderTopToolbar: () => (
            <Group justify="space-between" align="center" px="md" py="sm">
                <Text fz="xs" c="dimmed">
                    {filteredRows.length}
                    {stateFilter === 'all' ? '' : ` ${stateFilter}`} shown
                </Text>
                <SegmentedControl
                    size="xs"
                    radius="md"
                    value={stateFilter}
                    onChange={(value) => setStateFilter(value as StateFilter)}
                    data={STATE_FILTER_OPTIONS}
                />
            </Group>
        ),
        renderBottomToolbar: () => (
            <Group justify="center" px="md" py="sm">
                {isFetchingNextPage ? (
                    <Text fz="xs" c="dimmed">
                        Loading more...
                    </Text>
                ) : (
                    <Text fz="xs" c="dimmed">
                        {hasNextPage
                            ? 'Scroll for more'
                            : `All ${totalResults} loaded`}
                    </Text>
                )}
            </Group>
        ),
        renderEmptyRowsFallback: () =>
            rows.length === 0 ? (
                <Center p="xl">
                    <Stack gap="xs" align="center">
                        <MantineIcon
                            icon={IconGitPullRequest}
                            size="xl"
                            color="ldGray.5"
                        />
                        <Text size="sm" c="dimmed">
                            No pull requests yet.
                        </Text>
                        <Text size="xs" c="dimmed" ta="center" maw={360}>
                            Changes proposed by AI agents and the in-app editors
                            will appear here once a pull request is opened.
                        </Text>
                    </Stack>
                </Center>
            ) : (
                <Center p="xl">
                    <Stack gap="xs" align="center">
                        <Text size="sm" c="dimmed">
                            No {stateFilter} pull requests in the loaded
                            results.
                        </Text>
                        <Text
                            size="xs"
                            c="blue"
                            className={classes.clearFilter}
                            onClick={() => setStateFilter('all')}
                        >
                            Show all
                        </Text>
                    </Stack>
                </Center>
            ),
        state: {
            showSkeletons: isLoading,
            density: 'md',
        },
    });

    return (
        <Stack gap="md">
            <Title order={5}>Pull requests</Title>

            {error ? (
                <Alert
                    icon={<MantineIcon icon={IconAlertCircle} />}
                    color="red"
                    title="Failed to load pull requests"
                >
                    {error.error.message}
                </Alert>
            ) : (
                <ContentTable table={table} />
            )}

            <Drawer
                opened={previewPr !== null}
                onClose={() => setPreviewPr(null)}
                position="right"
                size="lg"
                withCloseButton={false}
                padding={0}
                classNames={{
                    inner: classes.drawerInner,
                    overlay: classes.drawerOverlay,
                }}
                __vars={{ '--drawer-top-offset': `${NAVBAR_HEIGHT}px` }}
            >
                {previewPr?.aiAgentUuid && previewPr?.aiThreadUuid ? (
                    <ThreadPreviewSidebar
                        projectUuid={previewPr.projectUuid}
                        agentUuid={previewPr.aiAgentUuid}
                        threadUuid={previewPr.aiThreadUuid}
                        isOpen={previewPr !== null}
                        onClose={() => setPreviewPr(null)}
                    />
                ) : null}
            </Drawer>
        </Stack>
    );
};

export default PullRequestsPage;
