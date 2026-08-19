import {
    type AiAgentAdminSortField,
    type AiAgentAdminThreadSummary,
    type AiThreadCreatedFrom,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Box,
    Group,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import {
    IconBox,
    IconCircleDotted,
    IconClick,
    IconClock,
    IconFileDownload,
    IconMessageCircleStar,
    IconMessages,
    IconRadar,
    IconRobotFace,
    IconTextCaption,
    IconThumbDown,
    IconThumbUp,
    IconTilde,
    IconUser,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { CategoryBadge } from '../../../../../components/common/CategoryBadge';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
    type ContentTableSortingState,
    type ContentTableVirtualizer,
} from '../../../../../components/common/ContentTable';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import useHealth from '../../../../../hooks/health/useHealth';
import { useGetSlack } from '../../../../../hooks/slack/useSlack';
import { useInfiniteScroll } from '../../../../../hooks/useInfiniteScroll';
import { useIsTruncated } from '../../../../../hooks/useIsTruncated';
import SlackSvg from '../../../../../svgs/slack.svg?react';
import {
    useAiAgentAdminReviewItems,
    useDownloadAiAgentAdminThreadDump,
    useInfiniteAiAgentAdminThreads,
} from '../../hooks/useAiAgentAdmin';
import { useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';
import { AgentNamePill } from '../AgentNamePill';
import { AiAgentAdminTopToolbar } from './AiAgentAdminTopToolbar';
import {
    getThreadReviewHeadline,
    summarizeThreadReviewItems,
    THREAD_REVIEW_ITEM_STATUSES,
    threadReviewRootCauseColors,
    threadReviewRootCauseLabels,
    threadReviewStatusColors,
} from './threadReviewContext';

const CREATED_FROM_LABELS: Record<AiThreadCreatedFrom, string> = {
    slack: 'Slack',
    web_app: 'Web',
    evals: 'Evals',
    scheduler: 'Scheduler',
};

type AiAgentAdminThreadsTableProps = {
    onThreadSelect?: (thread: AiAgentAdminThreadSummary) => void;
    selectedThread?: AiAgentAdminThreadSummary | null;
    setSelectedThread?: (thread: AiAgentAdminThreadSummary) => void;
};

const AiAgentAdminThreadsTable = ({
    onThreadSelect,
    setSelectedThread,
    selectedThread,
}: AiAgentAdminThreadsTableProps) => {
    const theme = useMantineTheme();
    const navigate = useNavigate();
    const slack = useGetSlack();
    const health = useHealth();
    const isThreadDumpEnabled = health.data?.ai.threadDumpEnabled ?? false;
    const {
        mutate: downloadThreadDump,
        isLoading: isDownloadingThreadDump,
        variables: downloadingThreadUuid,
    } = useDownloadAiAgentAdminThreadDump();
    const [hasAcceptedThreadDumpNotice, setHasAcceptedThreadDumpNotice] =
        useLocalStorage<boolean>({
            key: 'ld.aiThreads.dumpNoticeAccepted',
            defaultValue: false,
        });
    const [pendingDumpThreadUuid, setPendingDumpThreadUuid] = useState<
        string | null
    >(null);
    const handleDownloadThreadDump = useCallback(
        (threadUuid: string) => {
            if (hasAcceptedThreadDumpNotice) {
                downloadThreadDump(threadUuid);
            } else {
                setPendingDumpThreadUuid(threadUuid);
            }
        },
        [hasAcceptedThreadDumpNotice, downloadThreadDump],
    );

    const {
        search,
        selectedProjectUuids,
        selectedAgentUuids,
        selectedUserUuids,
        selectedSource,
        selectedFeedback,
        sortField,
        sortDirection,
        apiFilters,
        setSearch,
        setSelectedProjectUuids,
        setSelectedAgentUuids,
        setSelectedUserUuids,
        setSelectedSource,
        setSelectedFeedback,
        setSorting,
        hasActiveFilters,
        resetFilters,
    } = useAiAgentAdminFilters();

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
                let newSortField: AiAgentAdminSortField = 'createdAt';

                if (id === 'title') {
                    newSortField = 'title';
                } else if (id === 'createdAt') {
                    newSortField = 'createdAt';
                }

                setSorting(newSortField, desc ? 'desc' : 'asc');
            }
        },
        [sorting, setSorting],
    );

    const rowVirtualizerInstanceRef =
        useRef<ContentTableVirtualizer<HTMLDivElement, HTMLTableRowElement>>(
            null,
        );

    const { data, isInitialLoading, isFetching, hasNextPage, fetchNextPage } =
        useInfiniteAiAgentAdminThreads(
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
    const { data: reviewItems = [] } = useAiAgentAdminReviewItems(
        { statuses: THREAD_REVIEW_ITEM_STATUSES },
        { enabled: true },
    );

    const flatData = useMemo(() => {
        if (!data) return [];
        return data.pages.flatMap((page) => page.data.threads);
    }, [data]);

    const reviewSummaryByThreadUuid = useMemo(
        () =>
            new Map(
                flatData.map((thread) => [
                    thread.uuid,
                    summarizeThreadReviewItems(reviewItems, thread.uuid),
                ]),
            ),
        [flatData, reviewItems],
    );

    // Temporary workaround to resolve a memoization issue with react-mantine-table
    const [tableData, setTableData] = useState<AiAgentAdminThreadSummary[]>([]);
    useEffect(() => {
        setTableData(flatData);
    }, [flatData]);

    const totalResults = useMemo(() => {
        if (!data) return 0;
        const lastPage = data.pages[data.pages.length - 1];
        return lastPage.pagination?.totalResults ?? 0;
    }, [data]);

    const { containerRef: tableContainerRef, onScroll } = useInfiniteScroll({
        fetchNextPage,
        isFetching,
        hasMore: hasNextPage ?? false,
    });

    const columns: ContentTableColumnDef<AiAgentAdminThreadSummary>[] = [
        {
            accessorKey: 'title',
            header: 'Thread',
            enableSorting: false,
            enableEditing: false,
            size: 300,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconTextCaption} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const isTruncated = useIsTruncated<HTMLDivElement>();
                const thread = row.original;
                return (
                    <Tooltip
                        withinPortal
                        label={thread.title || 'Untitled Thread'}
                        disabled={!isTruncated.isTruncated}
                        multiline
                        maw={300}
                    >
                        <Text fw={500} fz="sm" truncate ref={isTruncated.ref}>
                            {thread.title || 'Untitled Thread'}
                        </Text>
                    </Tooltip>
                );
            },
        },
        {
            accessorKey: 'agent.name',
            header: 'Agent',
            enableSorting: false,
            enableEditing: false,
            size: 170,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconRobotFace} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const thread = row.original;
                return (
                    <AgentNamePill
                        name={thread.agent.name}
                        imageUrl={thread.agent.imageUrl}
                    />
                );
            },
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
            Cell: ({ row }) => {
                const thread = row.original;

                return (
                    <Text c="ldGray.9" fz="sm" fw={400}>
                        {thread.project.name}
                    </Text>
                );
            },
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
            Cell: ({ row }) => {
                const thread = row.original;
                return (
                    <Tooltip withinPortal label={thread.user.email}>
                        <Text c="ldGray.9" fz="sm" fw={400}>
                            {thread.user.name}
                        </Text>
                    </Tooltip>
                );
            },
        },
        {
            accessorKey: 'createdFrom',
            header: 'Source',
            enableSorting: false,
            enableEditing: false,
            size: 120,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconRadar} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const thread = row.original;
                const isSlack = thread.createdFrom === 'slack';
                const label = CREATED_FROM_LABELS[thread.createdFrom];

                const slackUrl =
                    thread.slackChannelId &&
                    thread.slackThreadTs &&
                    slack.data?.slackTeamName
                        ? `https://${
                              slack.data.slackTeamName
                          }.slack.com/archives/${
                              thread.slackChannelId
                          }/p${thread.slackThreadTs.replace('.', '')}`
                        : null;

                return (
                    <Group gap="two">
                        {isSlack ? (
                            <SlackSvg
                                style={{
                                    width: '12px',
                                    height: '12px',
                                }}
                            />
                        ) : (
                            <MantineIcon
                                icon={IconMessageCircleStar}
                                size="md"
                                color={'indigo.8'}
                                stroke={1.6}
                            />
                        )}
                        {slackUrl ? (
                            <Anchor
                                href={slackUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                fz="xs"
                                c="blue.7"
                                fw={500}
                            >
                                {label}
                            </Anchor>
                        ) : (
                            <Text fz="xs" c="ldGray.7" fw={500}>
                                {label}
                            </Text>
                        )}
                    </Group>
                );
            },
        },
        {
            accessorKey: 'promptCount',
            header: 'Prompts',
            enableSorting: false,
            enableEditing: false,
            size: 125,
            Header: ({ column }) => (
                <Group gap="two" wrap="nowrap">
                    <MantineIcon icon={IconMessages} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const thread = row.original;
                return <Badge variant="default">{thread.promptCount}</Badge>;
            },
        },
        {
            accessorKey: 'feedbackSummary',
            header: 'Feedback',
            enableSorting: false,
            enableEditing: false,
            size: 140,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconClick} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const { feedbackSummary } = row.original;
                return (
                    <Group gap="xs">
                        {feedbackSummary.neutral === 0 &&
                        feedbackSummary.upvotes === 0 &&
                        feedbackSummary.downvotes === 0 ? (
                            <MantineIcon
                                icon={IconCircleDotted}
                                color="ldGray.6"
                            />
                        ) : (
                            <Group gap="sm">
                                {feedbackSummary.neutral > 0 && (
                                    <Group gap="two">
                                        <MantineIcon
                                            icon={IconTilde}
                                            color="yellow.8"
                                        />
                                        <Text fz="xs" c="yellow.8" fw={500}>
                                            {String(feedbackSummary.neutral)}
                                        </Text>
                                    </Group>
                                )}
                                {feedbackSummary.upvotes > 0 && (
                                    <Group gap="two">
                                        <MantineIcon
                                            icon={IconThumbUp}
                                            color="green.9"
                                        />
                                        <Text fz="xs" c="green.9" fw={500}>
                                            {String(feedbackSummary.upvotes)}
                                        </Text>
                                    </Group>
                                )}
                                {feedbackSummary.downvotes > 0 && (
                                    <Group gap="two">
                                        <MantineIcon
                                            icon={IconThumbDown}
                                            color="red.9"
                                        />
                                        <Text fz="xs" c="red.9" fw={500}>
                                            {String(feedbackSummary.downvotes)}
                                        </Text>
                                    </Group>
                                )}
                            </Group>
                        )}
                    </Group>
                );
            },
        },
        {
            accessorKey: 'reviewWarnings',
            header: 'Warnings',
            enableSorting: false,
            enableEditing: false,
            size: 240,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon
                        icon={IconMessageCircleStar}
                        color="ldGray.6"
                    />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const thread = row.original;
                const summary = reviewSummaryByThreadUuid.get(thread.uuid);
                const latestReviewItem = summary?.latestReviewItem ?? null;

                if (
                    !summary ||
                    summary.findingCount === 0 ||
                    !latestReviewItem
                ) {
                    return (
                        <Text fz="xs" c="ldGray.5" fw={500}>
                            Clean
                        </Text>
                    );
                }

                const headline =
                    getThreadReviewHeadline(latestReviewItem) ??
                    latestReviewItem.title;
                const activeCount =
                    summary.openFindingCount + summary.inProgressFindingCount;

                return (
                    <Stack gap={4} miw={0}>
                        <Group gap={6} wrap="nowrap">
                            <Badge variant="light" color="violet">
                                {summary.findingCount}{' '}
                                {summary.findingCount === 1
                                    ? 'finding'
                                    : 'findings'}
                            </Badge>
                            <Badge
                                variant="light"
                                color={
                                    threadReviewStatusColors[
                                        latestReviewItem.status
                                    ]
                                }
                            >
                                {activeCount > 0
                                    ? `${activeCount} active`
                                    : latestReviewItem.status.replaceAll(
                                          '_',
                                          ' ',
                                      )}
                            </Badge>
                        </Group>
                        <Group gap={6} wrap="nowrap" miw={0}>
                            <CategoryBadge
                                variant="dot"
                                label={
                                    threadReviewRootCauseLabels[
                                        latestReviewItem.primaryRootCause
                                    ]
                                }
                                color={
                                    threadReviewRootCauseColors[
                                        latestReviewItem.primaryRootCause
                                    ]
                                }
                            />
                            <Text fz="xs" c="ldGray.6" lineClamp={1}>
                                {headline}
                            </Text>
                        </Group>
                    </Stack>
                );
            },
        },
        {
            accessorKey: 'createdAt',
            header: 'Created',
            enableSorting: true,
            enableEditing: false,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconClock} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const thread = row.original;
                return (
                    <Text fz="sm" c="ldGray.7">
                        {new Date(thread.createdAt).toLocaleDateString()}
                    </Text>
                );
            },
        },
    ];

    const table = useContentTable({
        columns,
        data: tableData,
        enableColumnResizing: true,
        enableRowVirtualization: true,
        enablePagination: false,
        onGlobalFilterChange: (s: string) => {
            setSearch(s);
        },
        enableSorting: true,
        manualSorting: true,
        onSortingChange: handleSortingChange,
        enableTopToolbar: true,
        mantineTableContainerProps: {
            ref: tableContainerRef,
            sx: {
                maxHeight: 'calc(100dvh - 350px)',
                minHeight: '600px',
                display: 'flex',
                flexDirection: 'column',
            },
            onScroll,
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
        mantineTableHeadCellProps: (props) => {
            const isAnyColumnResizing = props.table
                .getAllColumns()
                .some((c) => c.getIsResizing());

            const isLastColumn =
                props.table.getAllColumns().indexOf(props.column) ===
                props.table.getAllColumns().length - 1;

            const canResize = props.column.getCanResize();

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
                sx: {
                    justifyContent: 'center',
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
        mantineTableBodyProps: {
            sx: {
                flexGrow: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                'tr:last-of-type > td': {
                    borderBottom: 'none',
                    borderLeft: 'none !important',
                },
            },
        },
        mantineTableBodyRowProps: ({ row, table: mantineTable }) => {
            // Don't apply custom styling during skeleton loading
            if (mantineTable.getState().showSkeletons) {
                return {};
            }

            const thread = row.original;
            const isSelected = selectedThread?.uuid === thread.uuid;

            return {
                style: {
                    cursor: 'pointer',
                    backgroundColor: isSelected
                        ? theme.colors.ldGray[1]
                        : undefined,
                },
                onClick: () => {
                    setSelectedThread?.(thread);
                    if (onThreadSelect) {
                        onThreadSelect(thread);
                    } else {
                        void navigate(
                            `/projects/${thread.project.uuid}/ai-agents/${thread.agent.uuid}/threads/${thread.uuid}`,
                        );
                    }
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
                sx: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    flexShrink: 0,
                },
            };
        },
        renderTopToolbar: () => (
            <AiAgentAdminTopToolbar
                search={search}
                setSearch={setSearch}
                selectedProjectUuids={selectedProjectUuids}
                setSelectedProjectUuids={setSelectedProjectUuids}
                selectedAgentUuids={selectedAgentUuids}
                setSelectedAgentUuids={setSelectedAgentUuids}
                selectedUserUuids={selectedUserUuids}
                setSelectedUserUuids={setSelectedUserUuids}
                selectedSource={selectedSource}
                setSelectedSource={setSelectedSource}
                selectedFeedback={selectedFeedback}
                setSelectedFeedback={setSelectedFeedback}
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
        state: {
            sorting,
            showProgressBars: false,
            showSkeletons: isInitialLoading,
            density: 'md',
            globalFilter: search ?? '',
        },
        mantineLoadingOverlayProps: {
            loaderProps: {
                color: 'violet',
            },
        },
        initialState: {
            showGlobalFilter: true,
        },
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { estimateSize: () => 72, overscan: 40 },
        enableRowActions: isThreadDumpEnabled,
        positionActionsColumn: 'last',
        renderRowActions: ({ row }) => {
            const thread = row.original;
            return (
                <Tooltip
                    label="Download debug dump"
                    openDelay={300}
                    withinPortal
                >
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Download debug dump"
                        loading={
                            isDownloadingThreadDump &&
                            downloadingThreadUuid === thread.uuid
                        }
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadThreadDump(thread.uuid);
                        }}
                    >
                        <MantineIcon icon={IconFileDownload} />
                    </ActionIcon>
                </Tooltip>
            );
        },
    });

    return (
        <>
            <ContentTable table={table} />
            <MantineModal
                opened={pendingDumpThreadUuid !== null}
                onClose={() => setPendingDumpThreadUuid(null)}
                role="alertdialog"
                title="Download thread debug dump"
                icon={IconFileDownload}
                size="lg"
                confirmLabel="Download"
                onConfirm={() => {
                    if (pendingDumpThreadUuid) {
                        downloadThreadDump(pendingDumpThreadUuid);
                    }
                    setHasAcceptedThreadDumpNotice(true);
                    setPendingDumpThreadUuid(null);
                }}
            >
                <Stack gap="xs">
                    <Text fz="sm">
                        The dump includes prompts, agent responses and agent
                        configuration. Query results and sensitive tool outputs
                        are redacted, but responses may still quote data.
                    </Text>
                    <Text fz="sm" fw={500}>
                        Before sharing: review the file and confirm you are
                        comfortable with its contents.
                    </Text>
                </Stack>
            </MantineModal>
        </>
    );
};

export default AiAgentAdminThreadsTable;
