import {
    formatTimestamp,
    PullRequestState,
    TimeFrames,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Button,
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
import { Link } from 'react-router';
import { CategoryBadge } from '../../../components/common/CategoryBadge/CategoryBadge';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../../../components/common/ContentTable';
import MantineIcon from '../../../components/common/MantineIcon';
import { NAVBAR_HEIGHT } from '../../../components/common/Page/constants';
import { ThreadPreviewSidebar } from '../../../ee/features/aiCopilot/components/Admin/ThreadPreviewSidebar';
import {
    threadReviewRootCauseColors,
    threadReviewRootCauseLabels,
} from '../../../ee/features/aiCopilot/components/Admin/threadReviewContext';
import { usePullRequestsTable } from '../hooks/usePullRequestsTable';
import { type PullRequestRow } from '../types';
import {
    getProviderLabel,
    getReviewPath,
    getSourceColor,
    getSourceLabel,
    getStateColor,
    getThreadPath,
    getThreadPreviewTarget,
    type PullRequestThreadPreviewTarget,
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
    const [previewTarget, setPreviewTarget] =
        useState<PullRequestThreadPreviewTarget | null>(null);

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

    const columns = useMemo<ContentTableColumnDef<PullRequestRow>[]>(
        () => [
            {
                accessorKey: 'title',
                header: 'Pull request',
                enableSorting: false,
                size: 620,
                Cell: ({ row }) => {
                    const pr = row.original;
                    const reviewPath = getReviewPath(pr);
                    const threadPreviewTarget = getThreadPreviewTarget(pr);
                    // title/state are both null when the live lookup from the
                    // provider failed (PR deleted, access revoked, API down).
                    const liveLookupFailed =
                        pr.title === null && pr.state === null;
                    return (
                        <Group
                            gap="sm"
                            wrap="nowrap"
                            className={classes.titleCell}
                        >
                            <ThemeIcon
                                variant="light"
                                color={getStateColor(pr.state)}
                                radius="md"
                                size={32}
                                className={classes.medallion}
                            >
                                <MantineIcon
                                    icon={IconGitPullRequest}
                                    size="md"
                                />
                            </ThemeIcon>
                            <Stack gap={2} className={classes.title}>
                                {liveLookupFailed ? (
                                    <Tooltip
                                        label={`Couldn't load this pull request from ${getProviderLabel(
                                            pr.provider,
                                        )}. It may have been deleted, or access was revoked.`}
                                        openDelay={300}
                                        multiline
                                        maw={420}
                                        withinPortal
                                    >
                                        <Group gap="two" wrap="nowrap">
                                            <MantineIcon
                                                icon={IconAlertCircle}
                                                color="red"
                                                size="sm"
                                            />
                                            <Text
                                                fz="sm"
                                                fw={600}
                                                c="red"
                                                truncate
                                            >
                                                Couldn't load pull request
                                            </Text>
                                        </Group>
                                    </Tooltip>
                                ) : (
                                    <Tooltip
                                        label={pr.title}
                                        openDelay={400}
                                        multiline
                                        maw={420}
                                        withinPortal
                                    >
                                        <Text fz="sm" fw={600} truncate>
                                            {pr.title}
                                        </Text>
                                    </Tooltip>
                                )}
                                <Tooltip
                                    label={formatTimestamp(
                                        pr.createdAt,
                                        TimeFrames.MINUTE,
                                    )}
                                    openDelay={300}
                                    withinPortal
                                >
                                    <Text fz="xs" c="ldGray.6" truncate span>
                                        opened {dayjs(pr.createdAt).fromNow()}
                                        {pr.author ? (
                                            <>
                                                {' by '}
                                                <Text span fw={700} fz="xs">
                                                    {pr.author.name}
                                                </Text>
                                            </>
                                        ) : (
                                            ''
                                        )}
                                    </Text>
                                </Tooltip>

                                {pr.reviewContext && (
                                    <Stack
                                        gap={6}
                                        mt={4}
                                        className={classes.reviewContext}
                                    >
                                        <Group gap="xs" wrap="wrap">
                                            <Text fz="xs" fw={600} c="ldGray.6">
                                                Fixes review:
                                            </Text>
                                            <Tooltip
                                                label={
                                                    pr.reviewContext.reviewTitle
                                                }
                                                openDelay={300}
                                                withinPortal
                                            >
                                                <Text
                                                    fz="xs"
                                                    fw={600}
                                                    truncate
                                                    className={
                                                        classes.reviewTitle
                                                    }
                                                >
                                                    {
                                                        pr.reviewContext
                                                            .reviewTitle
                                                    }
                                                </Text>
                                            </Tooltip>
                                            <CategoryBadge
                                                variant="token"
                                                label={
                                                    threadReviewRootCauseLabels[
                                                        pr.reviewContext
                                                            .primaryRootCause
                                                    ]
                                                }
                                                color={
                                                    threadReviewRootCauseColors[
                                                        pr.reviewContext
                                                            .primaryRootCause
                                                    ]
                                                }
                                            />
                                        </Group>

                                        <Group gap="xs" wrap="wrap">
                                            {reviewPath && (
                                                <Button
                                                    component={Link}
                                                    to={reviewPath}
                                                    size="compact-xs"
                                                    variant="subtle"
                                                    color="gray"
                                                >
                                                    View issue
                                                </Button>
                                            )}
                                            {threadPreviewTarget && (
                                                <Button
                                                    size="compact-xs"
                                                    variant="subtle"
                                                    color="gray"
                                                    onClick={() =>
                                                        setPreviewTarget(
                                                            threadPreviewTarget,
                                                        )
                                                    }
                                                >
                                                    View thread
                                                </Button>
                                            )}
                                            <Button
                                                component="a"
                                                href={pr.prUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                size="compact-xs"
                                                variant="subtle"
                                                color="gray"
                                            >
                                                View PR
                                            </Button>
                                        </Group>
                                    </Stack>
                                )}
                            </Stack>
                        </Group>
                    );
                },
            },
            {
                id: 'source',
                header: 'Source',
                enableSorting: false,
                size: 140,
                Cell: ({ row }) => (
                    <CategoryBadge
                        label={getSourceLabel(row.original.source)}
                        color={getSourceColor(row.original.source)}
                        variant="dot"
                    />
                ),
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
            'content-table-row-actions': {
                header: '',
                size: 96,
            },
        },
        renderRowActions: ({ row }) => {
            const pr = row.original;
            const threadPath = getThreadPath(pr);
            const threadTarget = getThreadPreviewTarget(pr);
            return (
                <Group gap="two" wrap="nowrap" className={classes.rowActions}>
                    {threadPath !== null && threadTarget ? (
                        <Tooltip
                            label="Preview thread"
                            openDelay={300}
                            withinPortal
                        >
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label="Preview thread"
                                onClick={() => setPreviewTarget(threadTarget)}
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
                opened={previewTarget !== null}
                onClose={() => setPreviewTarget(null)}
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
                {previewTarget ? (
                    <ThreadPreviewSidebar
                        projectUuid={previewTarget.projectUuid}
                        agentUuid={previewTarget.agentUuid}
                        threadUuid={previewTarget.threadUuid}
                        selectedReviewItemUuid={
                            previewTarget.reviewItemUuid ?? undefined
                        }
                        isOpen={previewTarget !== null}
                        onClose={() => setPreviewTarget(null)}
                    />
                ) : null}
            </Drawer>
        </Stack>
    );
};

export default PullRequestsPage;
