import {
    type PreAggregateMaterializationStatus,
    type PreAggregateMaterializationSummary,
    type PreAggregateMaterializationWarning,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Button,
    Group,
    LoadingOverlay,
    Popover,
    Radio,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useDisclosure, useLocalStorage } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconBolt,
    IconCalendarTime,
    IconClock,
    IconColumns,
    IconFile,
    IconFilter,
    IconFilterExclamation,
    IconFilterOff,
    IconHourglass,
    IconRefreshDot,
    IconRowInsertBottom,
    IconSearch,
    IconTable,
} from '@tabler/icons-react';
import cronstrue from 'cronstrue';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { usePreAggregateMaterializations } from '../../hooks/usePreAggregateMaterializations';
import {
    useRefreshAllPreAggregates,
    useRefreshPreAggregateByDefinitionName,
} from '../../hooks/usePreAggregateRefresh';
import { useProject } from '../../hooks/useProject';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import useSchedulerJobsContext from '../../providers/SchedulerJobs/useSchedulerJobsContext';
import { formatDuration, formatFileSize } from '../../utils/formatters';
import Callout from '../common/Callout';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
    type ContentTableSortingState,
} from '../common/ContentTable';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import { SettingsEmptyState } from '../common/Settings/SettingsEmptyState';
import {
    SettingsPage,
    SettingsPageActions,
    SettingsPageDocumentationLink,
} from '../common/Settings/SettingsPage';
import TruncatedText from '../common/TruncatedText';
import MaterializationDetailDrawer from './MaterializationDetailDrawer';
import classes from './PreAggregateMaterializations.module.css';
import { StatusBadge } from './StatusBadge';

type Props = {
    projectUuid: string;
};

const TimeAgoText: FC<{ date: Date | string }> = ({ date }) => {
    const timeAgo = useTimeAgo(date);
    return (
        <Text size="xs" c="dimmed">
            {timeAgo}
        </Text>
    );
};

type StatusType =
    | PreAggregateMaterializationStatus
    | 'external'
    | 'never_materialized';

const ALL_STATUSES: StatusType[] = [
    'active',
    'in_progress',
    'failed',
    'superseded',
    'external',
    'never_materialized',
];

const getStatusType = (
    summary: PreAggregateMaterializationSummary,
): StatusType => {
    if (summary.externalTable) return 'external';
    return summary.materialization?.status ?? 'never_materialized';
};

const StatusFilter: FC<{
    selected: StatusType | null;
    onChange: (value: StatusType | null) => void;
}> = ({ selected, onChange }) => {
    const { t } = useTranslation('app');
    const hasSelection = selected !== null;

    return (
        <Popover width={250} position="bottom-start">
            <Popover.Target>
                <Tooltip
                    label={t('preAggregateMaterializations.filterByStatus')}
                >
                    <Button
                        h={32}
                        c="foreground"
                        fz="sm"
                        variant="default"
                        px="sm"
                        className={
                            hasSelection
                                ? classes.filterButtonSelected
                                : classes.filterButton
                        }
                        rightSection={
                            hasSelection ? (
                                <Badge
                                    size="xs"
                                    variant="filled"
                                    color="indigo.6"
                                    circle
                                >
                                    1
                                </Badge>
                            ) : null
                        }
                    >
                        {t('preAggregateMaterializations.columns.status')}
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack gap={4}>
                    <Text fz="xs" c="dimmed" fw={600}>
                        {t('preAggregateMaterializations.filterByStatusLabel')}
                    </Text>
                    <ScrollArea.Autosize mah={200} type="always" scrollbars="y">
                        <Radio.Group
                            value={selected ?? ''}
                            onChange={(v) =>
                                onChange((v as StatusType) || null)
                            }
                        >
                            <Stack gap="xs">
                                {ALL_STATUSES.map((status) => (
                                    <Radio
                                        key={status}
                                        value={status}
                                        label={t(
                                            `preAggregateMaterializations.status.${status}`,
                                        )}
                                        size="xs"
                                    />
                                ))}
                            </Stack>
                        </Radio.Group>
                    </ScrollArea.Autosize>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

const PreAggregateMaterializations: FC<Props> = ({ projectUuid }) => {
    const { t } = useTranslation('app');
    const { data: project, isLoading: isLoadingProject } =
        useProject(projectUuid);
    const requiresUserCredentials =
        project?.warehouseConnection?.requireUserCredentials ?? false;
    const { hasActiveJobs } = useSchedulerJobsContext();
    const { mutate: refreshAll, isLoading: isRefreshingAll } =
        useRefreshAllPreAggregates(projectUuid, { showToast: true });
    const {
        mutate: refreshByName,
        isLoading: isRefreshingOne,
        variables: refreshingDefinitionName,
    } = useRefreshPreAggregateByDefinitionName(projectUuid, {
        showToast: false,
    });
    const [
        isRefreshModalOpen,
        { open: openRefreshModal, close: closeRefreshModal },
    ] = useDisclosure(false);
    const [hasConfirmedRefreshAll, setHasConfirmedRefreshAll] =
        useLocalStorage<boolean>({
            key: 'preAggregateRefreshAllConfirmed',
            defaultValue: false,
        });

    const handleRefreshAllClick = useCallback(() => {
        if (hasConfirmedRefreshAll) {
            refreshAll();
        } else {
            openRefreshModal();
        }
    }, [hasConfirmedRefreshAll, refreshAll, openRefreshModal]);

    const handleRefreshAllConfirm = useCallback(() => {
        setHasConfirmedRefreshAll(true);
        closeRefreshModal();
        refreshAll();
    }, [setHasConfirmedRefreshAll, refreshAll, closeRefreshModal]);
    const {
        data,
        isLoading,
        isError,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = usePreAggregateMaterializations(projectUuid);

    useEffect(() => {
        if (hasNextPage && !isFetchingNextPage) {
            void fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const materializations = useMemo(
        () => data?.pages.flatMap((page) => page.data.materializations) ?? [],
        [data],
    );
    const managedMaterializations = useMemo(
        () => materializations.filter((item) => !item.externalTable),
        [materializations],
    );

    const [sorting, setSorting] = useState<ContentTableSortingState>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatus, setSelectedStatus] = useState<StatusType | null>(
        null,
    );
    const [isDrawerOpen, { open: openDrawer, close: closeDrawer }] =
        useDisclosure(false);
    const [selectedSummary, setSelectedSummary] =
        useState<PreAggregateMaterializationSummary | null>(null);

    const handleRowClick = useCallback(
        (summary: PreAggregateMaterializationSummary) => {
            setSelectedSummary(summary);
            openDrawer();
        },
        [openDrawer],
    );

    const hasActiveFilters = selectedStatus !== null || searchQuery !== '';
    const resetFilters = useCallback(() => {
        setSelectedStatus(null);
        setSearchQuery('');
    }, []);

    const filteredMaterializations = useMemo(() => {
        let rows = materializations;
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            rows = rows.filter(
                (r) =>
                    r.preAggregateName.toLowerCase().includes(query) ||
                    r.externalTable?.toLowerCase().includes(query),
            );
        }
        if (selectedStatus) {
            rows = rows.filter((r) => getStatusType(r) === selectedStatus);
        }
        return rows;
    }, [materializations, searchQuery, selectedStatus]);

    const summary = useMemo(() => {
        const total = filteredMaterializations.length;
        const active = filteredMaterializations.filter(
            (m) => m.materialization?.status === 'active',
        ).length;
        const warningCount = filteredMaterializations.filter(
            (m) => m.warnings.length > 0,
        ).length;
        const external = filteredMaterializations.filter(
            (m) => m.externalTable !== null,
        ).length;

        return { total, active, external, warningCount };
    }, [filteredMaterializations]);

    const columns = useMemo<
        ContentTableColumnDef<PreAggregateMaterializationSummary>[]
    >(
        () => [
            {
                accessorKey: 'preAggregateName',
                header: t('preAggregateMaterializations.columns.name'),
                enableSorting: false,
                size: 180,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start" wrap="nowrap">
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <TruncatedText
                        maxWidth={180}
                        fz="xs"
                        fw={500}
                        ff="monospace"
                    >
                        {row.original.preAggregateName}
                    </TruncatedText>
                ),
            },
            {
                accessorKey: 'sourceExploreName',
                header: t('preAggregateMaterializations.columns.sourceExplore'),
                enableSorting: false,
                size: 160,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start" wrap="nowrap">
                        <MantineIcon icon={IconTable} color="dimmed" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text size="xs" fw={500} ff="monospace">
                        {row.original.sourceExploreName}
                    </Text>
                ),
            },
            {
                id: 'status',
                header: t('preAggregateMaterializations.columns.status'),
                enableSorting: false,
                size: 140,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => <StatusBadge summary={row.original} />,
            },
            {
                id: 'rowCount',
                header: t('preAggregateMaterializations.columns.rowCount'),
                enableSorting: true,
                size: 100,
                accessorFn: (row) => row.materialization?.rowCount ?? null,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start" wrap="nowrap">
                        <MantineIcon
                            icon={IconRowInsertBottom}
                            color="dimmed"
                        />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const rowCount = row.original.materialization?.rowCount;
                    const hasRowCountWarning = row.original.warnings.some(
                        (w: PreAggregateMaterializationWarning) =>
                            w.type === 'row_count_exceeded',
                    );
                    const hasRowLimitWarning = row.original.warnings.some(
                        (w: PreAggregateMaterializationWarning) =>
                            w.type === 'max_rows_applied',
                    );
                    return (
                        <Group gap={4} wrap="nowrap">
                            <Text size="xs" c="dimmed" ff="monospace">
                                {rowCount != null
                                    ? rowCount.toLocaleString()
                                    : '\u2014'}
                            </Text>
                            {hasRowLimitWarning && (
                                <Tooltip
                                    label={t(
                                        'preAggregateMaterializations.maxRowsApplied',
                                    )}
                                    position="top"
                                >
                                    <MantineIcon
                                        icon={IconFilterExclamation}
                                        size="sm"
                                        color="dimmed"
                                    />
                                </Tooltip>
                            )}
                            {hasRowCountWarning && (
                                <MantineIcon
                                    icon={IconAlertTriangle}
                                    size="sm"
                                    color="dimmed"
                                />
                            )}
                        </Group>
                    );
                },
                sortingFn: 'basic',
            },
            {
                id: 'columns',
                header: t('preAggregateMaterializations.columns.columns'),
                enableSorting: false,
                size: 90,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start" wrap="nowrap">
                        <MantineIcon icon={IconColumns} color="dimmed" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const cols = row.original.materialization?.columns;
                    const count = cols ? Object.keys(cols).length : null;
                    return (
                        <Text size="xs" c="dimmed" ff="monospace">
                            {count != null ? count : '\u2014'}
                        </Text>
                    );
                },
            },
            {
                id: 'fileSize',
                header: t('preAggregateMaterializations.columns.fileSize'),
                enableSorting: true,
                size: 100,
                accessorFn: (row) => row.materialization?.totalBytes ?? null,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start" wrap="nowrap">
                        <MantineIcon icon={IconFile} color="dimmed" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const bytes = row.original.materialization?.totalBytes;
                    return (
                        <Text size="xs" c="dimmed" ff="monospace">
                            {bytes != null ? formatFileSize(bytes) : '\u2014'}
                        </Text>
                    );
                },
                sortingFn: 'basic',
            },
            {
                id: 'buildTime',
                header: t('preAggregateMaterializations.columns.buildTime'),
                enableSorting: true,
                size: 100,
                accessorFn: (row) => row.materialization?.durationMs ?? null,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start" wrap="nowrap">
                        <MantineIcon icon={IconHourglass} color="dimmed" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const durationMs = row.original.materialization?.durationMs;
                    return (
                        <Text size="xs" c="dimmed" ff="monospace">
                            {durationMs != null
                                ? formatDuration(durationMs)
                                : '\u2014'}
                        </Text>
                    );
                },
                sortingFn: 'basic',
            },
            {
                id: 'materializedAt',
                header: t(
                    'preAggregateMaterializations.columns.lastMaterialized',
                ),
                enableSorting: true,
                size: 140,
                accessorFn: (row) =>
                    row.materialization?.materializedAt ?? null,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start" wrap="nowrap">
                        <MantineIcon icon={IconClock} color="dimmed" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const { materialization } = row.original;
                    const materializedAt = materialization?.materializedAt;

                    if (
                        !materialization ||
                        materialization.status === 'failed' ||
                        materialization.status === 'in_progress' ||
                        !materializedAt
                    ) {
                        return (
                            <Text size="xs" c="dimmed">
                                {'\u2014'}
                            </Text>
                        );
                    }

                    return (
                        <Tooltip
                            label={new Date(materializedAt).toLocaleString()}
                        >
                            <TimeAgoText date={materializedAt} />
                        </Tooltip>
                    );
                },
                sortingFn: 'datetime',
            },
            {
                accessorKey: 'refreshCron',
                header: t(
                    'preAggregateMaterializations.columns.refreshSchedule',
                ),
                enableSorting: false,
                size: 130,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start" wrap="nowrap">
                        <MantineIcon icon={IconCalendarTime} color="dimmed" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const { externalTable, refreshCron } = row.original;
                    if (externalTable) {
                        return (
                            <Tooltip
                                label={t(
                                    'preAggregateMaterializations.customerManagedTooltip',
                                )}
                            >
                                <Text size="xs" c="ldGray.7" fw={500}>
                                    {t(
                                        'preAggregateMaterializations.customerManaged',
                                    )}
                                </Text>
                            </Tooltip>
                        );
                    }
                    if (!refreshCron) {
                        return (
                            <Text size="xs" c="dimmed">
                                {t('preAggregateMaterializations.manual')}
                            </Text>
                        );
                    }
                    return (
                        <Tooltip
                            label={cronstrue.toString(refreshCron, {
                                throwExceptionOnParseError: false,
                            })}
                        >
                            <Text
                                size="xs"
                                c="dimmed"
                                ff="monospace"
                                style={{ cursor: 'help' }}
                            >
                                {refreshCron}
                            </Text>
                        </Tooltip>
                    );
                },
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 50,
                Cell: ({ row }) => {
                    if (row.original.externalTable) return null;

                    const isThisRowRefreshing =
                        isRefreshingOne &&
                        refreshingDefinitionName ===
                            row.original.preAggregateName;
                    return (
                        <Tooltip
                            label={t('preAggregateMaterializations.rebuildOne')}
                        >
                            <ActionIcon
                                size="sm"
                                loading={isThisRowRefreshing}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    refreshByName(
                                        row.original.preAggregateName,
                                    );
                                }}
                            >
                                <MantineIcon icon={IconRefreshDot} size="sm" />
                            </ActionIcon>
                        </Tooltip>
                    );
                },
            },
        ],
        [isRefreshingOne, refreshingDefinitionName, refreshByName, t],
    );

    const table = useContentTable({
        columns,
        data: filteredMaterializations,
        enableColumnResizing: false,
        enablePagination: true,
        initialState: {
            pagination: { pageIndex: 0, pageSize: 25 },
        },
        enableStickyHeader: true,
        enableSorting: true,
        enableMultiSort: false,
        enableTopToolbar: true,
        renderTopToolbar: () => (
            <Group
                justify="space-between"
                px="sm"
                py="xs"
                wrap="nowrap"
                style={{
                    borderBottom: '1px solid var(--mantine-color-ldGray-2)',
                }}
            >
                <Group gap="xs" wrap="nowrap">
                    <MantineIcon icon={IconFilter} color="ldGray" />
                    <TextInput
                        placeholder={t(
                            'preAggregateMaterializations.searchPlaceholder',
                        )}
                        leftSection={
                            <MantineIcon icon={IconSearch} size="sm" />
                        }
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.currentTarget.value)}
                        size="xs"
                        w={200}
                    />
                    <StatusFilter
                        selected={selectedStatus}
                        onChange={setSelectedStatus}
                    />
                    {hasActiveFilters && (
                        <Tooltip label={t('preAggregateAudit.resetFilters')}>
                            <ActionIcon size="sm" onClick={resetFilters}>
                                <MantineIcon icon={IconFilterOff} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
                <Group gap="xs" wrap="nowrap">
                    <Text size="xs" c="dimmed">
                        {t('preAggregateMaterializations.summary', {
                            active: summary.active,
                            total: summary.total,
                        })}
                        {summary.external > 0 &&
                            t('preAggregateMaterializations.summaryExternal', {
                                count: summary.external,
                            })}
                        {summary.warningCount > 0 &&
                            t('preAggregateMaterializations.summaryWarnings', {
                                count: summary.warningCount,
                            })}
                    </Text>
                </Group>
            </Group>
        ),
        enableBottomToolbar: true,
        enableRowActions: false,
        mantineTableContainerProps: {
            style: { maxHeight: 'calc(100dvh - 450px)' },
        },
        mantineTableBodyRowProps: ({ row }) => ({
            onClick: () => handleRowClick(row.original),
            className: classes.clickableRow,
        }),
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: false,
        },
        mantineTableHeadCellProps: {
            h: '3xl',
            pos: 'relative',
            style: {
                padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-md)',
                backgroundColor: 'var(--mantine-color-ldGray-0)',
                fontWeight: 600,
                fontSize: 'var(--mantine-font-size-xs)',
                verticalAlign: 'middle',
                whiteSpace: 'nowrap',
            },
        },
        mantineTableBodyCellProps: {
            style: {
                padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-md)',
                fontSize: 'var(--mantine-font-size-xs)',
                color: 'var(--mantine-color-ldGray-7)',
            },
        },
        state: {
            isLoading,
            showAlertBanner: isError,
            density: 'md',
            sorting,
        },
        onSortingChange: setSorting,
    });

    return (
        <>
            <LoadingOverlay visible={isLoadingProject} />

            <SettingsPage
                title={t('preAggregateMaterializations.title')}
                description={t('preAggregateMaterializations.description')}
                actions={
                    <SettingsPageActions>
                        <SettingsPageDocumentationLink href="https://docs.lightdash.com/references/pre-aggregates" />
                        {managedMaterializations.length > 0 && (
                            <Button
                                size="xs"
                                leftSection={
                                    <MantineIcon
                                        icon={IconRefreshDot}
                                        size="sm"
                                    />
                                }
                                loading={isRefreshingAll || hasActiveJobs}
                                onClick={handleRefreshAllClick}
                            >
                                {t(
                                    'preAggregateMaterializations.rebuildManaged',
                                )}
                            </Button>
                        )}
                    </SettingsPageActions>
                }
            >
                {requiresUserCredentials && (
                    <Callout variant="warning">
                        <Text fz="xs">
                            <Trans
                                t={t}
                                i18nKey="preAggregateMaterializations.personalConnectionsWarning"
                                components={{
                                    link: (
                                        <Anchor
                                            href="https://docs.lightdash.com/references/pre-aggregates/overview#personal-warehouse-connections"
                                            target="_blank"
                                            inherit
                                        />
                                    ),
                                }}
                            />
                        </Text>
                    </Callout>
                )}

                {!isLoading && materializations.length === 0 ? (
                    <SettingsEmptyState
                        icon={IconBolt}
                        title={t('preAggregateMaterializations.emptyTitle')}
                        description={t(
                            'preAggregateMaterializations.emptyDescription',
                        )}
                    />
                ) : (
                    <ContentTable table={table} />
                )}
            </SettingsPage>

            <MaterializationDetailDrawer
                summary={selectedSummary}
                opened={isDrawerOpen}
                onClose={closeDrawer}
                onRefresh={refreshByName}
                isRefreshing={
                    isRefreshingOne &&
                    refreshingDefinitionName ===
                        selectedSummary?.preAggregateName
                }
            />

            <MantineModal
                opened={isRefreshModalOpen}
                onClose={closeRefreshModal}
                title={t('preAggregateMaterializations.rebuildModal.title')}
                icon={IconRefreshDot}
                size="lg"
                onConfirm={handleRefreshAllConfirm}
                confirmLabel={t('preAggregateMaterializations.rebuildManaged')}
                confirmLoading={isRefreshingAll}
                description={t(
                    'preAggregateMaterializations.rebuildModal.description',
                    { count: managedMaterializations.length },
                )}
            >
                <Stack gap="sm">
                    <Text fz="xs" c="dimmed">
                        {t(
                            'preAggregateMaterializations.rebuildModal.duration',
                        )}
                    </Text>
                    {materializations.some((m) => m.warnings.length > 0) && (
                        <Callout
                            variant="warning"
                            title={t(
                                'preAggregateMaterializations.rebuildModal.largeTitle',
                            )}
                        >
                            <Text fz="xs">
                                {t(
                                    'preAggregateMaterializations.rebuildModal.largeDescription',
                                )}
                            </Text>
                        </Callout>
                    )}
                </Stack>
            </MantineModal>
        </>
    );
};

export default PreAggregateMaterializations;
