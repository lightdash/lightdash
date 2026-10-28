import { Group, Text, Tooltip, useMantineTheme } from '@mantine/core';
import {
    IconAlertTriangleFilled,
    IconCircleCheckFilled,
    IconClock,
    IconHash,
    IconProgress,
    IconRadar,
    IconUser,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { useProject } from '../../hooks/useProject';
import {
    useProjectCompileLogs,
    type ProjectCompileLog,
} from '../../hooks/useProjectCompileLogs';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
    type ContentTableSortingState,
    type ContentTableVirtualizer,
} from '../common/ContentTable';
import MantineIcon from '../common/MantineIcon';
import { CompilationHistoryTopToolbar } from './CompilationHistoryTopToolbar';
import { CompilationLogDrawer } from './CompilationLogDrawer';
import { CompilationSourceBadge } from './CompilationSourceBadge';
import { type CompilationSource } from './types';

type CompilationHistoryTableProps = {
    projectUuid: string;
};

const fetchSize = 25;

const CompilationHistoryTable: FC<CompilationHistoryTableProps> = ({
    projectUuid,
}) => {
    const theme = useMantineTheme();
    const rowVirtualizerInstanceRef =
        useRef<ContentTableVirtualizer<HTMLDivElement, HTMLTableRowElement>>(
            null,
        );

    const { data: project } = useProject(projectUuid);

    const [sorting, setSorting] = useState<ContentTableSortingState>([
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

    const { containerRef: tableContainerRef, onScroll } = useInfiniteScroll({
        fetchNextPage,
        isFetching,
        hasMore: totalFetched < totalDBRowCount,
        threshold: 400,
    });

    const columns: ContentTableColumnDef<ProjectCompileLog>[] = useMemo(
        () => [
            {
                accessorKey: 'createdAt',
                header: 'Timestamp',
                enableSorting: true,
                size: 180,
                Header: ({ column }) => (
                    <Group gap="two" align="flex-start">
                        <MantineIcon icon={IconClock} color="dimmed" />
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
                        <MantineIcon icon={IconRadar} color="dimmed" />
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
                        <MantineIcon icon={IconUser} color="dimmed" />
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
                        <MantineIcon icon={IconHash} color="dimmed" />
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
                        <MantineIcon icon={IconHash} color="dimmed" />
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
                        <MantineIcon icon={IconHash} color="dimmed" />
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
                        <MantineIcon icon={IconProgress} color="dimmed" />
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

    const table = useContentTable({
        columns,
        data: compileLogs,
        enableColumnResizing: false,
        enablePagination: false,
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
            />
        ),
        mantineTableContainerProps: {
            ref: tableContainerRef,
            mah: 'calc(100dvh - 370px)',
            onScroll,
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: false,
        },
        mantineTableBodyRowProps: ({ row }) => ({
            onClick: () => handleRowClick(row.original),
        }),
        mantineTableBodyCellProps: { fz: 'xs' },

        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { estimateSize: () => 40, overscan: 10 },
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
            <ContentTable table={table} />
            <CompilationLogDrawer
                opened={drawerOpened}
                onClose={handleDrawerClose}
                log={selectedLog}
            />
        </>
    );
};

export default CompilationHistoryTable;
