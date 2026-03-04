import {
    type PreAggregateMaterializationStatus,
    type PreAggregateMaterializationSummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    LoadingOverlay,
    Paper,
    Popover,
    Radio,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure, useLocalStorage } from '@mantine-8/hooks';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconCalendarTime,
    IconClock,
    IconColumns,
    IconExternalLink,
    IconFilter,
    IconFilterOff,
    IconLayersIntersect,
    IconRefresh,
    IconRowInsertBottom,
    IconSearch,
    IconTable,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import cronstrue from 'cronstrue';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
    type MRT_SortingState,
} from 'mantine-react-table';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { usePreAggregateMaterializations } from '../../hooks/usePreAggregateMaterializations';
import {
    useRefreshAllPreAggregates,
    useRefreshPreAggregateByName,
} from '../../hooks/usePreAggregateRefresh';
import { useProject } from '../../hooks/useProject';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import MaterializationDetailDrawer from './MaterializationDetailDrawer';
import classes from './PreAggregateMaterializations.module.css';
import { StatusBadge } from './StatusBadge';

type Props = {
    projectUuid: string;
};

const TimeAgoText: FC<{ date: Date | string }> = ({ date }) => {
    const timeAgo = useTimeAgo(date);
    return (
        <Text size="xs" c="ldGray.6">
            {timeAgo}
        </Text>
    );
};

type StatusType = PreAggregateMaterializationStatus;

const STATUS_LABELS: Record<StatusType, string> = {
    active: 'Active',
    in_progress: 'In progress',
    failed: 'Failed',
    superseded: 'Superseded',
};

const ALL_STATUSES: StatusType[] = [
    'active',
    'in_progress',
    'failed',
    'superseded',
];

const StatusFilter: FC<{
    selected: StatusType | null;
    onChange: (value: StatusType | null) => void;
}> = ({ selected, onChange }) => {
    const hasSelection = selected !== null;

    return (
        <Popover width={250} position="bottom-start">
            <Popover.Target>
                <Tooltip withinPortal variant="xs" label="Filter by status">
                    <Button
                        h={32}
                        c="foreground"
                        fw={500}
                        fz="sm"
                        variant="default"
                        radius="md"
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
                        Status
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack gap={4}>
                    <Text fz="xs" c="ldGray.6" fw={600}>
                        Filter by status:
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
                                        label={STATUS_LABELS[status]}
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
    const { isLoading: isLoadingProject } = useProject(projectUuid);
    const queryClient = useQueryClient();
    const { mutate: refreshAll, isLoading: isRefreshingAll } =
        useRefreshAllPreAggregates(projectUuid);
    const {
        mutate: refreshByName,
        isLoading: isRefreshingOne,
        variables: refreshingExploreName,
    } = useRefreshPreAggregateByName(projectUuid);
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

    const handleRefresh = () => {
        void queryClient.invalidateQueries([
            'preAggregateMaterializations',
            projectUuid,
        ]);
    };

    useEffect(() => {
        if (hasNextPage && !isFetchingNextPage) {
            void fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const materializations = useMemo(
        () => data?.pages.flatMap((page) => page.data.materializations) ?? [],
        [data],
    );

    const [sorting, setSorting] = useState<MRT_SortingState>([]);
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
            rows = rows.filter((r) =>
                r.preAggregateName.toLowerCase().includes(query),
            );
        }
        if (selectedStatus) {
            rows = rows.filter(
                (r) => r.materialization?.status === selectedStatus,
            );
        }
        return rows;
    }, [materializations, searchQuery, selectedStatus]);

    const summary = useMemo(() => {
        const total = filteredMaterializations.length;
        const active = filteredMaterializations.filter(
            (m) => m.materialization?.status === 'active',
        ).length;

        return { total, active };
    }, [filteredMaterializations]);

    const columns = useMemo<
        MRT_ColumnDef<PreAggregateMaterializationSummary>[]
    >(
        () => [
            {
                accessorKey: 'preAggregateName',
                header: 'Name',
                enableSorting: false,
                size: 180,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start" wrap="nowrap">
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text size="xs" fw={500} ff="monospace">
                        {row.original.preAggregateName}
                    </Text>
                ),
            },
            {
                accessorKey: 'sourceExploreName',
                header: 'Source explore',
                enableSorting: false,
                size: 160,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start" wrap="nowrap">
                        <MantineIcon icon={IconTable} color="ldGray.6" />
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
                header: 'Status',
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
                header: 'Row count',
                enableSorting: true,
                size: 100,
                accessorFn: (row) => row.materialization?.rowCount ?? null,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start" wrap="nowrap">
                        <MantineIcon
                            icon={IconRowInsertBottom}
                            color="ldGray.6"
                        />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const rowCount = row.original.materialization?.rowCount;
                    return (
                        <Text size="xs" c="ldGray.6" ff="monospace">
                            {rowCount != null
                                ? rowCount.toLocaleString()
                                : '\u2014'}
                        </Text>
                    );
                },
                sortingFn: 'basic',
            },
            {
                id: 'columns',
                header: 'Columns',
                enableSorting: false,
                size: 90,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start" wrap="nowrap">
                        <MantineIcon icon={IconColumns} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const cols = row.original.materialization?.columns;
                    const count = cols ? Object.keys(cols).length : null;
                    return (
                        <Text size="xs" c="ldGray.6" ff="monospace">
                            {count != null ? count : '\u2014'}
                        </Text>
                    );
                },
            },
            {
                id: 'materializedAt',
                header: 'Last materialized',
                enableSorting: true,
                size: 140,
                accessorFn: (row) =>
                    row.materialization?.materializedAt ?? null,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start" wrap="nowrap">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
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
                            <Text size="xs" c="ldGray.6">
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
                header: 'Refresh schedule',
                enableSorting: false,
                size: 130,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start" wrap="nowrap">
                        <MantineIcon icon={IconCalendarTime} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const { refreshCron } = row.original;
                    if (!refreshCron) {
                        return (
                            <Text size="xs" c="ldGray.6">
                                Manual
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
                                c="ldGray.6"
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
                    const isThisRowRefreshing =
                        isRefreshingOne &&
                        refreshingExploreName ===
                            row.original.preAggExploreName;
                    return (
                        <Tooltip label="Refresh this pre-aggregate">
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                loading={isThisRowRefreshing}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    refreshByName(
                                        row.original.preAggExploreName,
                                    );
                                }}
                            >
                                <MantineIcon icon={IconRefresh} size="sm" />
                            </ActionIcon>
                        </Tooltip>
                    );
                },
            },
        ],
        [isRefreshingOne, refreshingExploreName, refreshByName],
    );

    const table = useMantineReactTable({
        columns,
        data: filteredMaterializations,
        enableColumnResizing: false,
        enableRowNumbers: false,
        enablePagination: true,
        paginationDisplayMode: 'pages',
        initialState: {
            pagination: { pageIndex: 0, pageSize: 25 },
        },
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableStickyHeader: true,
        enableGlobalFilterModes: false,
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
                        placeholder="Search by name..."
                        leftSection={
                            <MantineIcon icon={IconSearch} size="sm" />
                        }
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.currentTarget.value)}
                        size="xs"
                        radius="md"
                        w={200}
                    />
                    <StatusFilter
                        selected={selectedStatus}
                        onChange={setSelectedStatus}
                    />
                    {hasActiveFilters && (
                        <Tooltip label="Reset filters">
                            <ActionIcon
                                variant="subtle"
                                size="sm"
                                color="gray"
                                onClick={resetFilters}
                            >
                                <MantineIcon icon={IconFilterOff} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
                <Group gap="xs" wrap="nowrap">
                    <Text size="xs" c="dimmed">
                        {summary.active}/{summary.total} active
                    </Text>
                    <Tooltip label="Refresh">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            onClick={handleRefresh}
                        >
                            <MantineIcon icon={IconRefresh} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>
        ),
        enableBottomToolbar: true,
        enableRowActions: false,
        mantinePaperProps: {
            shadow: undefined,
            style: {
                border: '1px solid var(--mantine-color-ldGray-2)',
                borderRadius: 'var(--mantine-spacing-sm)',
                display: 'flex',
                flexDirection: 'column' as const,
            },
        },
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
        mantineTableHeadRowProps: {
            style: { boxShadow: 'none' },
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
            isLoading,
            showAlertBanner: isError,
            density: 'md',
            sorting,
        },
        mantinePaginationProps: {
            showRowsPerPage: false,
            color: 'dark',
            size: 'sm',
        },
        onSortingChange: setSorting,
    });

    return (
        <>
            <LoadingOverlay visible={isLoadingProject} />

            <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                    <Stack gap={2}>
                        <Title order={5}>Pre-Aggregate Materializations</Title>
                        <Text c="dimmed" size="xs">
                            Overview of all pre-aggregate definitions and their
                            current materialization status.
                        </Text>
                    </Stack>

                    <Group gap="xs">
                        <Button
                            component="a"
                            href="https://docs.lightdash.com/references/pre-aggregates"
                            target="_blank"
                            variant="default"
                            size="xs"
                            rightSection={
                                <MantineIcon
                                    icon={IconExternalLink}
                                    size="sm"
                                />
                            }
                        >
                            Documentation
                        </Button>
                        <Button
                            size="xs"
                            leftSection={
                                <MantineIcon icon={IconRefresh} size="sm" />
                            }
                            loading={isRefreshingAll}
                            onClick={handleRefreshAllClick}
                        >
                            Refresh all
                        </Button>
                    </Group>
                </Group>

                {!isLoading && materializations.length === 0 ? (
                    <Paper withBorder radius="md" p="xxl">
                        <SuboptimalState
                            icon={IconLayersIntersect}
                            title="No pre-aggregates defined yet"
                            description="Define pre-aggregates in your dbt YAML to serve queries from materialized results instead of hitting your warehouse."
                        />
                    </Paper>
                ) : (
                    <MantineReactTable table={table} />
                )}
            </Stack>

            <MaterializationDetailDrawer
                summary={selectedSummary}
                opened={isDrawerOpen}
                onClose={closeDrawer}
                onRefresh={refreshByName}
                isRefreshing={
                    isRefreshingOne &&
                    refreshingExploreName === selectedSummary?.preAggExploreName
                }
            />

            <MantineModal
                opened={isRefreshModalOpen}
                onClose={closeRefreshModal}
                title="Refresh all pre-aggregates"
                icon={IconRefresh}
                size="lg"
                onConfirm={handleRefreshAllConfirm}
                confirmLabel="Refresh all"
                confirmLoading={isRefreshingAll}
                description="This will refresh all pre-aggregate definitions in this project by re-running their warehouse queries to rebuild the cached data."
            >
                <Text fz="xs" c="ldGray.6">
                    Depending on the number of pre-aggregates and the size of
                    your data, this may take several minutes and will use
                    warehouse resources. You can track the progress in the table
                    below.
                </Text>
            </MantineModal>
        </>
    );
};

export default PreAggregateMaterializations;
