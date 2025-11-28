import { Group, Text, Tooltip, useMantineTheme } from '@mantine-8/core';
import {
    IconAlertTriangleFilled,
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconCircleCheckFilled,
    IconClock,
    IconHash,
    IconProgress,
    IconRadar,
    IconUser,
} from '@tabler/icons-react';
import { format } from 'date-fns';
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
import { useProject } from '../../hooks/useProject';
import {
    useProjectCompileLogs,
    type ProjectCompileLog,
} from '../../hooks/useProjectCompileLogs';
import MantineIcon from '../common/MantineIcon';
import { CompilationHistoryTopToolbar } from './CompilationHistoryTopToolbar';
import { CompilationLogDrawer } from './CompilationLogDrawer';
import { CompilationSourceBadge } from './CompilationSourceBadge';

type CompilationSource = 'cli_deploy' | 'refresh_dbt' | 'create_project';

type CompilationHistoryTableProps = {
    projectUuid: string;
};

const fetchSize = 25;

const CompilationHistoryTable: FC<CompilationHistoryTableProps> = ({
    projectUuid,
}) => {
    const theme = useMantineTheme();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null);

    const { data: project } = useProject(projectUuid);

    const [sorting, setSorting] = useState<MRT_SortingState>([
        { id: 'createdAt', desc: true },
    ]);

    const [selectedSource, setSelectedSource] =
        useState<CompilationSource | null>(null);

    const [drawerOpened, setDrawerOpened] = useState(false);
    const [selectedLog, setSelectedLog] = useState<ProjectCompileLog | null>(
        null,
    );

    const handleRowClick = useCallback((log: ProjectCompileLog) => {
        setSelectedLog(log);
        setDrawerOpened(true);
    }, []);

    const handleDrawerClose = useCallback(() => {
        setDrawerOpened(false);
        setSelectedLog(null);
    }, []);

    const sortBy = useMemo(() => {
        if (sorting.length === 0) return undefined;
        const sortField = sorting[0].id;
        return sortField === 'createdAt' ? 'created_at' : undefined;
    }, [sorting]);

    const sortDirection = useMemo(() => {
        if (sorting.length === 0) return undefined;
        return sorting[0].desc ? 'desc' : 'asc';
    }, [sorting]);

    const hasActiveFilters = selectedSource !== null;

    const resetFilters = useCallback(() => {
        setSelectedSource(null);
    }, []);

    const { data, fetchNextPage, isError, isFetching, isLoading } =
        useProjectCompileLogs({
            projectUuid,
            paginateArgs: { page: 1, pageSize: fetchSize },
            sortBy,
            sortDirection,
            source: selectedSource ?? undefined,
        });

    const compileLogs = useMemo(() => {
        if (!data?.pages) return [];
        return data.pages.flatMap((page) => page.data || []);
    }, [data]);

    const totalDBRowCount = data?.pages?.[0]?.pagination?.totalResults ?? 0;
    const totalFetched = compileLogs.length;

    // Temporary workaround to resolve a memoization issue with react-mantine-table.
    // In certain scenarios, the content fails to render properly even when the data is updated.
    // This issue may be addressed in a future library update.
    const [tableData, setTableData] = useState<ProjectCompileLog[]>([]);
    useEffect(() => {
        setTableData(compileLogs);
    }, [compileLogs]);

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

    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const columns: MRT_ColumnDef<ProjectCompileLog>[] = useMemo(
        () => [
            {
                accessorKey: 'createdAt',
                header: 'Timestamp',
                enableSorting: true,
                size: 180,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text c="dimmed" size="xs">
                        {format(row.original.createdAt, 'yyyy/MM/dd hh:mm a')}
                    </Text>
                ),
            },
            {
                accessorKey: 'compilationSource',
                header: 'Source',
                enableSorting: false,
                size: 140,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconRadar} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <CompilationSourceBadge
                        source={row.original.compilationSource}
                    />
                ),
            },
            {
                accessorKey: 'userName',
                header: 'Triggered by user',
                enableSorting: false,
                size: 200,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconUser} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => row.original.userName,
            },
            {
                accessorKey: 'report',
                header: 'Explores',
                enableSorting: false,
                size: 100,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconHash} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) =>
                    row.original.report.successfulExploresCount ?? 0,
            },
            {
                accessorKey: 'report.metricsCount',
                header: 'Metrics',
                enableSorting: false,
                size: 100,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconHash} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => row.original.report.metricsCount ?? 0,
            },
            {
                accessorKey: 'report.dimensionsCount',
                header: 'Dimensions',
                enableSorting: false,
                size: 120,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconHash} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => row.original.report.dimensionsCount ?? 0,
            },
            {
                accessorKey: 'compilationStatus',
                header: 'Status',
                enableSorting: false,
                size: 100,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconProgress} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const { report } = row.original;
                    const { label, color, icon } = report.errorExploresCount
                        ? {
                              label: report.exploresWithErrors
                                  .map(
                                      (explore) =>
                                          `${explore.name} (${explore.errors
                                              .map((e) => e.message)
                                              .join(', ')})`,
                                  )
                                  .join('\n'),
                              color: theme.colors.red[6],
                              icon: IconAlertTriangleFilled,
                          }
                        : {
                              label: 'Compilation successful',
                              color: theme.colors.green[6],
                              icon: IconCircleCheckFilled,
                          };
                    return (
                        <Tooltip label={label}>
                            <MantineIcon icon={icon} style={{ color: color }} />
                        </Tooltip>
                    );
                },
            },
        ],
        [theme],
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
        enableMultiSort: false,
        manualSorting: true,
        enableRowVirtualization: true,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        enableRowActions: false,
        renderTopToolbar: () => (
            <CompilationHistoryTopToolbar
                selectedSource={selectedSource}
                setSelectedSource={setSelectedSource}
                isFetching={isFetching || isLoading}
                currentResultsCount={totalFetched}
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
            ref: tableContainerRef,
            style: { maxHeight: 'calc(100dvh - 370px)' },
            onScroll: (event: UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.target as HTMLDivElement),
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: false,
        },
        mantineTableBodyRowProps: ({ row }) => ({
            onClick: () => handleRowClick(row.original),
            style: { cursor: 'pointer' },
        }),
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
                // Removing mantine table borders for last cell
                '&:last-of-type': {
                    borderLeft: 'none!important',
                },
            },
        },
        mantineTableBodyCellProps: {
            sx: {
                // Removing mantine table borders for last cell
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
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { overscan: 10 },
        state: {
            isLoading,
            showAlertBanner: isError,
            showProgressBars: isFetching,
            density: 'md',
            sorting,
        },
        onSortingChange: setSorting,
    });

    if (!project) {
        return null;
    }

    return (
        <>
            <MantineReactTable table={table} />
            <CompilationLogDrawer
                opened={drawerOpened}
                onClose={handleDrawerClose}
                log={selectedLog}
            />
        </>
    );
};

export default CompilationHistoryTable;
