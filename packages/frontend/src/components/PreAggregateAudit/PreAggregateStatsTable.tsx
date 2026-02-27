import { type PreAggregateDailyStatResult } from '@lightdash/common';
import { Anchor, Group, Text, useMantineTheme } from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconChartBar,
    IconClock,
    IconCube,
    IconLayoutDashboard,
    IconTable,
    IconTarget,
} from '@tabler/icons-react';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
    type MRT_SortingState,
} from 'mantine-react-table';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import {
    aggregateStats,
    formatMissReason,
    type AggregatedRow,
    type QueryType,
} from './preAggregateHelpers';
import PreAggregateTopToolbar from './PreAggregateTopToolbar';

type Props = {
    stats: PreAggregateDailyStatResult[];
    isLoading: boolean;
    isError: boolean;
    projectUuid: string;
};

const PreAggregateStatsTable: FC<Props> = ({
    stats,
    isLoading,
    isError,
    projectUuid,
}) => {
    const theme = useMantineTheme();

    const [sorting, setSorting] = useState<MRT_SortingState>([
        { id: 'queries', desc: true },
    ]);
    const [selectedQueryType, setSelectedQueryType] =
        useState<QueryType | null>(null);
    const [selectedExplore, setSelectedExplore] = useState<string | null>(null);
    const [selectedMissReason, setSelectedMissReason] = useState<string | null>(
        null,
    );
    const [selectedPreAggregate, setSelectedPreAggregate] = useState<
        string | null
    >(null);

    const hasActiveFilters =
        selectedQueryType !== null ||
        selectedExplore !== null ||
        selectedMissReason !== null ||
        selectedPreAggregate !== null;
    const resetFilters = useCallback(() => {
        setSelectedQueryType(null);
        setSelectedExplore(null);
        setSelectedMissReason(null);
        setSelectedPreAggregate(null);
    }, []);

    const allRows = useMemo(() => aggregateStats(stats), [stats]);

    const explores = useMemo(
        () => [...new Set(allRows.map((r) => r.exploreName))].sort(),
        [allRows],
    );

    const missReasons = useMemo(
        () =>
            [
                ...new Set(
                    allRows
                        .map((r) => r.topMissReason)
                        .filter((r): r is string => r !== null),
                ),
            ].sort(),
        [allRows],
    );

    const preAggregateNames = useMemo(
        () =>
            [
                ...new Set(
                    allRows
                        .map((r) => r.preAggregateName)
                        .filter((r): r is string => r !== null),
                ),
            ].sort(),
        [allRows],
    );

    const filteredRows = useMemo(() => {
        let rows = allRows;
        if (selectedExplore) {
            rows = rows.filter((r) => r.exploreName === selectedExplore);
        }
        if (selectedPreAggregate) {
            rows = rows.filter(
                (r) => r.preAggregateName === selectedPreAggregate,
            );
        }
        if (selectedQueryType) {
            rows = rows.filter((r) => r.queryType === selectedQueryType);
        }
        if (selectedMissReason) {
            rows = rows.filter((r) => r.topMissReason === selectedMissReason);
        }
        return rows;
    }, [
        allRows,
        selectedExplore,
        selectedPreAggregate,
        selectedQueryType,
        selectedMissReason,
    ]);

    const columns = useMemo<MRT_ColumnDef<AggregatedRow>[]>(
        () => [
            {
                accessorKey: 'exploreName',
                header: 'Explore',
                enableSorting: false,
                size: 160,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconTable} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text size="xs" fw={500} ff="monospace">
                        {row.original.exploreName}
                    </Text>
                ),
            },
            {
                accessorKey: 'preAggregateName',
                header: 'Pre-aggregate',
                enableSorting: false,
                size: 160,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconCube} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) =>
                    row.original.preAggregateName ? (
                        <Text size="xs" fw={500} ff="monospace">
                            {row.original.preAggregateName}
                        </Text>
                    ) : (
                        <Text size="xs" c="dimmed">
                            {'\u2014'}
                        </Text>
                    ),
            },
            {
                accessorKey: 'chartName',
                header: 'Chart',
                enableSorting: false,
                size: 200,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconChartBar} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) =>
                    row.original.chartUuid ? (
                        <Anchor
                            href={`/projects/${projectUuid}/saved/${row.original.chartUuid}`}
                            target="_blank"
                            size="xs"
                        >
                            {row.original.chartName}
                        </Anchor>
                    ) : (
                        <Text size="xs" c="dimmed" fs="italic">
                            Ad-hoc query
                        </Text>
                    ),
            },
            {
                accessorKey: 'dashboardName',
                header: 'Dashboard',
                enableSorting: false,
                size: 180,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon
                            icon={IconLayoutDashboard}
                            color="ldGray.6"
                        />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) =>
                    row.original.dashboardUuid ? (
                        <Anchor
                            href={`/projects/${projectUuid}/dashboards/${row.original.dashboardUuid}`}
                            target="_blank"
                            size="xs"
                        >
                            {row.original.dashboardName}
                        </Anchor>
                    ) : (
                        <Text size="xs" c="dimmed">
                            {'\u2014'}
                        </Text>
                    ),
            },
            {
                id: 'queries',
                header: 'Queries',
                enableSorting: true,
                size: 160,
                accessorFn: (row) => row.hitCount + row.missCount,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconTarget} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const { hitCount, missCount } = row.original;
                    return (
                        <Group gap={8} wrap="nowrap">
                            <Text size="xs" c="ldGray.6" ff="monospace">
                                {hitCount} hit{hitCount !== 1 ? 's' : ''}
                            </Text>
                            <Text size="xs" c="ldGray.4" ff="monospace">
                                /
                            </Text>
                            <Text
                                size="xs"
                                ff="monospace"
                                c={missCount > 0 ? 'ldGray.8' : 'ldGray.4'}
                                fw={missCount > 0 ? 500 : 400}
                            >
                                {missCount} miss{missCount !== 1 ? 'es' : ''}
                            </Text>
                        </Group>
                    );
                },
                sortingFn: 'basic',
            },
            {
                accessorKey: 'topMissReason',
                header: 'Miss Reason',
                enableSorting: false,
                size: 200,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon
                            icon={IconAlertTriangle}
                            color="ldGray.6"
                        />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const reason = row.original.topMissReason;
                    return (
                        <Text size="xs" c={reason ? 'ldGray.6' : 'ldGray.3'}>
                            {formatMissReason(reason)}
                        </Text>
                    );
                },
            },
            {
                accessorKey: 'updatedAt',
                header: 'Last Seen',
                enableSorting: true,
                size: 150,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text size="xs" c="ldGray.6">
                        {new Date(row.original.updatedAt).toLocaleString()}
                    </Text>
                ),
                sortingFn: 'datetime',
            },
        ],
        [projectUuid],
    );

    const table = useMantineReactTable({
        columns,
        data: filteredRows,
        enableColumnResizing: false,
        enableRowNumbers: false,
        enablePagination: true,
        paginationDisplayMode: 'pages',
        initialState: {
            pagination: { pageIndex: 0, pageSize: 20 },
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
        enableBottomToolbar: true,
        enableRowActions: false,
        renderTopToolbar: () => (
            <PreAggregateTopToolbar
                explores={explores}
                preAggregateNames={preAggregateNames}
                missReasons={missReasons}
                selectedExplore={selectedExplore}
                setSelectedExplore={setSelectedExplore}
                selectedPreAggregate={selectedPreAggregate}
                setSelectedPreAggregate={setSelectedPreAggregate}
                selectedQueryType={selectedQueryType}
                setSelectedQueryType={setSelectedQueryType}
                selectedMissReason={selectedMissReason}
                setSelectedMissReason={setSelectedMissReason}
                hasActiveFilters={hasActiveFilters}
                resetFilters={resetFilters}
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
        mantineTableHeadRowProps: {
            sx: {
                boxShadow: 'none',
            },
        },
        mantineTableContainerProps: {
            style: { maxHeight: 'calc(100dvh - 450px)' },
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: false,
        },
        mantineTableHeadCellProps: {
            h: '3xl',
            pos: 'relative',
            style: {
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                backgroundColor: theme.colors.ldGray[0],
                fontWeight: 600,
                fontSize: theme.fontSizes.xs,
                justifyContent: 'center',
            },
            sx: {
                '&:last-of-type': {
                    borderLeft: 'none!important',
                },
            },
        },
        mantineTableBodyCellProps: {
            sx: {
                '&:last-of-type': {
                    borderLeft: 'none!important',
                },
            },
            style: {
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                fontSize: theme.fontSizes.xs,
                color: theme.colors.ldGray[7],
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

    return <MantineReactTable table={table} />;
};

export default PreAggregateStatsTable;
