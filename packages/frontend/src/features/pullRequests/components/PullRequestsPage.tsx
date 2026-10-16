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
} from '@mantine/core';
import {
    IconAlertCircle,
    IconExternalLink,
    IconGitPullRequest,
    IconMessageCircle,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useMemo, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
import { useInfiniteScroll } from '../../../hooks/useInfiniteScroll';
import { getDayjsLocale } from '../../../i18n/dateLocale';
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

const STATE_FILTERS: StateFilter[] = ['open', 'merged', 'closed', 'all'];

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
    const { t } = useTranslation('app');
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

    const {
        containerRef: tableContainerRef,
        onScroll,
        checkNow,
    } = useInfiniteScroll({
        fetchNextPage,
        isFetching: isFetchingNextPage,
        hasMore: hasNextPage ?? false,
        threshold: 400,
    });

    // The filtered subset may not fill the viewport even though the hook's own
    // inputs did not change.
    useEffect(() => {
        checkNow();
    }, [checkNow, stateFilter]);

    const columns = useMemo<ContentTableColumnDef<PullRequestRow>[]>(
        () => [
            {
                accessorKey: 'title',
                header: t('pullRequests.columns.pullRequest'),
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
                                        label={t(
                                            'pullRequests.loadFailedTooltip',
                                            {
                                                provider: getProviderLabel(
                                                    pr.provider,
                                                ),
                                            },
                                        )}
                                        openDelay={300}
                                        maw={420}
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
                                                {t('pullRequests.loadFailed')}
                                            </Text>
                                        </Group>
                                    </Tooltip>
                                ) : (
                                    <Tooltip
                                        label={pr.title}
                                        openDelay={400}
                                        maw={420}
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
                                >
                                    <Text fz="xs" c="dimmed" truncate span>
                                        {pr.author ? (
                                            <Trans
                                                t={t}
                                                i18nKey="pullRequests.openedBy"
                                                values={{
                                                    time: dayjs(pr.createdAt)
                                                        .locale(
                                                            getDayjsLocale(),
                                                        )
                                                        .fromNow(),
                                                    name: pr.author.name,
                                                }}
                                                components={{
                                                    author: (
                                                        <Text
                                                            span
                                                            fw={600}
                                                            fz="xs"
                                                        />
                                                    ),
                                                }}
                                            />
                                        ) : (
                                            t('pullRequests.opened', {
                                                time: dayjs(pr.createdAt)
                                                    .locale(getDayjsLocale())
                                                    .fromNow(),
                                            })
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
                                            <Text fz="xs" fw={600} c="dimmed">
                                                {t('pullRequests.fixesReview')}
                                            </Text>
                                            <Tooltip
                                                label={
                                                    pr.reviewContext.reviewTitle
                                                }
                                                openDelay={300}
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
                                                    {t(
                                                        'pullRequests.viewIssue',
                                                    )}
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
                                                    {t(
                                                        'pullRequests.viewThread',
                                                    )}
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
                                                {t('pullRequests.viewPr')}
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
                header: t('pullRequests.columns.source'),
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
        [t],
    );

    const table = useContentTable({
        columns,
        data: filteredRows,
        enableSorting: false,
        enablePagination: false,
        enableColumnResizing: false,
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
                            label={t('pullRequests.previewThread')}
                            openDelay={300}
                        >
                            <ActionIcon
                                aria-label={t('pullRequests.previewThread')}
                                onClick={() => setPreviewTarget(threadTarget)}
                            >
                                <MantineIcon icon={IconMessageCircle} />
                            </ActionIcon>
                        </Tooltip>
                    ) : null}
                    <Tooltip
                        label={t('pullRequests.viewOn', {
                            provider: getProviderLabel(pr.provider),
                        })}
                        openDelay={300}
                    >
                        <ActionIcon
                            component="a"
                            href={pr.prUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={t('pullRequests.viewPrOn', {
                                provider: getProviderLabel(pr.provider),
                            })}
                        >
                            <MantineIcon icon={IconExternalLink} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            );
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            sx: { maxHeight: 'calc(100dvh - 260px)' },
            onScroll,
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: false,
        },
        mantineTableBodyRowProps: { className: classes.bodyRow },
        renderTopToolbar: () => (
            <Group justify="space-between" align="center" px="md" py="sm">
                <Text fz="xs" c="dimmed">
                    {t(`pullRequests.shown.${stateFilter}`, {
                        count: filteredRows.length,
                    })}
                </Text>
                <SegmentedControl
                    size="xs"
                    value={stateFilter}
                    onChange={(value) => setStateFilter(value as StateFilter)}
                    data={STATE_FILTERS.map((value) => ({
                        value,
                        label: t(`pullRequests.filters.${value}`),
                    }))}
                />
            </Group>
        ),
        renderBottomToolbar: () => (
            <Group justify="center" px="md" py="sm">
                {isFetchingNextPage ? (
                    <Text fz="xs" c="dimmed">
                        {t('pullRequests.loadingMore')}
                    </Text>
                ) : (
                    <Text fz="xs" c="dimmed">
                        {hasNextPage
                            ? t('pullRequests.scrollForMore')
                            : t('pullRequests.allLoaded', {
                                  count: totalResults,
                              })}
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
                            {t('pullRequests.empty')}
                        </Text>
                        <Text size="xs" c="dimmed" ta="center" maw={360}>
                            {t('pullRequests.emptyDescription')}
                        </Text>
                    </Stack>
                </Center>
            ) : (
                <Center p="xl">
                    <Stack gap="xs" align="center">
                        <Text size="sm" c="dimmed">
                            {t(`pullRequests.noneForFilter.${stateFilter}`)}
                        </Text>
                        <Text
                            size="xs"
                            c="blue"
                            className={classes.clearFilter}
                            onClick={() => setStateFilter('all')}
                        >
                            {t('pullRequests.showAll')}
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
            <Title order={5}>{t('pullRequests.title')}</Title>

            {error ? (
                <Alert
                    icon={<MantineIcon icon={IconAlertCircle} />}
                    color="red"
                    title={t('pullRequests.loadListFailed')}
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
