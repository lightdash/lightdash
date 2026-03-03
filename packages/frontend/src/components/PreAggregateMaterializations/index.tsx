import { type PreAggregateMaterializationSummary } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    LoadingOverlay,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconCalendarTime,
    IconClock,
    IconColumns,
    IconExternalLink,
    IconRefresh,
    IconRowInsertBottom,
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
import { useEffect, useMemo, useState, type FC } from 'react';
import { usePreAggregateMaterializations } from '../../hooks/usePreAggregateMaterializations';
import { useProject } from '../../hooks/useProject';
import MantineIcon from '../common/MantineIcon';

type Props = {
    projectUuid: string;
};

const formatRelativeTime = (date: Date | string | null): string => {
    if (!date) return 'Never';
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
};

const StatusBadge: FC<{
    summary: PreAggregateMaterializationSummary;
}> = ({ summary }) => {
    if (summary.definitionError) {
        return (
            <Tooltip label={summary.definitionError} multiline maw={300}>
                <Badge color="red" variant="light" size="sm">
                    Definition error
                </Badge>
            </Tooltip>
        );
    }

    if (!summary.materialization) {
        return (
            <Badge color="gray" variant="light" size="sm">
                Never materialized
            </Badge>
        );
    }

    const { status, errorMessage } = summary.materialization;

    switch (status) {
        case 'active':
            return (
                <Badge color="green" variant="light" size="sm">
                    Active
                </Badge>
            );
        case 'in_progress':
            return (
                <Badge color="blue" variant="light" size="sm">
                    In progress
                </Badge>
            );
        case 'failed':
            return (
                <Tooltip
                    label={errorMessage ?? 'Unknown error'}
                    multiline
                    maw={300}
                >
                    <Badge color="red" variant="light" size="sm">
                        Failed
                    </Badge>
                </Tooltip>
            );
        case 'superseded':
            return (
                <Badge color="gray" variant="light" size="sm">
                    Superseded
                </Badge>
            );
        default:
            return (
                <Badge color="gray" variant="light" size="sm">
                    {status}
                </Badge>
            );
    }
};

const PreAggregateMaterializations: FC<Props> = ({ projectUuid }) => {
    const { isLoading: isLoadingProject } = useProject(projectUuid);
    const queryClient = useQueryClient();
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

    const summary = useMemo(() => {
        const total = materializations.length;
        const active = materializations.filter(
            (m) => m.materialization?.status === 'active',
        ).length;

        return { total, active };
    }, [materializations]);

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
                        materialization.status === 'in_progress'
                    ) {
                        return (
                            <Text size="xs" c="ldGray.6">
                                {'\u2014'}
                            </Text>
                        );
                    }

                    return (
                        <Tooltip
                            label={
                                materializedAt
                                    ? new Date(materializedAt).toLocaleString()
                                    : 'Never materialized'
                            }
                        >
                            <Text size="xs" c="ldGray.6">
                                {formatRelativeTime(materializedAt ?? null)}
                            </Text>
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
        ],
        [],
    );

    const table = useMantineReactTable({
        columns,
        data: materializations,
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
                justify="flex-end"
                px="md"
                py="xs"
                style={{
                    borderBottom: '1px solid var(--mantine-color-ldGray-2)',
                }}
            >
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
                justifyContent: 'center',
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

                    <Button
                        component="a"
                        href="https://docs.lightdash.com/references/pre-aggregates"
                        target="_blank"
                        variant="default"
                        size="xs"
                        rightSection={
                            <MantineIcon icon={IconExternalLink} size="sm" />
                        }
                    >
                        Documentation
                    </Button>
                </Group>

                <MantineReactTable table={table} />
            </Stack>
        </>
    );
};

export default PreAggregateMaterializations;
