import { Anchor, Button, Text, Tooltip } from '@mantine/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import MarkdownPreview from '@uiw/react-markdown-preview';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
    type MRT_ColumnFiltersState,
    type MRT_SortingState,
    type MRT_Virtualizer,
} from 'mantine-react-table';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type UIEvent,
} from 'react';

type MetricData = {
    metricName: string;
    friendlyName: string;
    description: string;
    directory: string;
    tableName: string;
    groupName: string;
    usage: number;
    metricId: string; // for linking to explore view
};

type MetricApiResponse = {
    data: Array<MetricData>;
    meta: {
        totalRowCount: number;
    };
};

const generateMockData = (start: number, size: number): MetricApiResponse => {
    const mockMetrics: MetricData[] = Array.from({ length: size }).map(
        (_, index) => ({
            metricId: `metric-${start + index}`,
            metricName: `daily_active_users_${start + index}`,
            friendlyName: `Daily Active Users ${start + index}`,
            description: `# Daily Active Users\n\nThis metric tracks the number of unique users who performed any action in the last 24 hours.\n\n## Calculation\nCount of distinct user_ids where last_seen > now() - interval '1 day'`,
            directory: `user_metrics`,
            tableName: 'User Analytics',
            groupName: 'Engagement Metrics',
            usage: Math.floor(Math.random() * 100),
        }),
    );

    return {
        data: mockMetrics,
        meta: {
            totalRowCount: 1000, // Total mock records
        },
    };
};

const columns: MRT_ColumnDef<MetricData>[] = [
    {
        accessorKey: 'friendlyName',
        header: 'Metric Name',
        Cell: ({ row }) => (
            <Anchor
                href={`/explore?metric=${row.original.metricId}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
            >
                {row.original.friendlyName}
            </Anchor>
        ),
    },
    {
        accessorKey: 'description',
        header: 'Description',
        Cell: ({ row }) => (
            <Tooltip
                multiline
                variant="xs"
                withinPortal
                label={<MarkdownPreview source={row.original.description} />}
            >
                <Text lineClamp={2}>{row.original.description}</Text>
            </Tooltip>
        ),
    },
    {
        accessorKey: 'directory',
        header: 'Directory',
        Cell: ({ row }) => (
            <Text>
                {row.original.groupName
                    ? `${row.original.tableName} / ${row.original.groupName}`
                    : row.original.tableName}
            </Text>
        ),
    },
    {
        accessorKey: 'usage',
        header: 'Usage',
        Cell: ({ row }) => (
            <Tooltip
                label="Click to view saved charts"
                withinPortal
                variant="xs"
            >
                <Button
                    variant="subtle"
                    // onClick={() => showSavedCharts(row.original.metricId)}
                >
                    {row.original.usage} uses
                </Button>
            </Tooltip>
        ),
    },
];

const fetchSize = 25;

export const MetricsTable = () => {
    const tableContainerRef = useRef<HTMLDivElement>(null); //we can get access to the underlying TableContainer element and react to its scroll events
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null); //we can get access to the underlying Virtualizer instance and call its scrollToIndex method

    const [columnFilters, setColumnFilters] = useState<MRT_ColumnFiltersState>(
        [],
    );
    const [globalFilter, setGlobalFilter] = useState<string>();
    const [sorting, setSorting] = useState<MRT_SortingState>([]);

    const { data, fetchNextPage, isError, isFetching, isLoading } =
        useInfiniteQuery<MetricApiResponse>({
            queryKey: ['table-data', columnFilters, globalFilter, sorting],
            queryFn: async ({ pageParam = 0 }) => {
                // Simulate network delay
                await new Promise((resolve) => setTimeout(resolve, 500));
                return generateMockData(pageParam * fetchSize, fetchSize);
            },
            getNextPageParam: (_lastGroup, groups) => groups.length,
            keepPreviousData: true,
            refetchOnWindowFocus: false,
        });

    const flatData = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data],
    );

    const totalDBRowCount = data?.pages?.[0]?.meta?.totalRowCount ?? 0;
    const totalFetched = flatData.length;

    //called on scroll and possibly on mount to fetch more data as the user scrolls and reaches bottom of table
    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (containerRefElement) {
                const { scrollHeight, scrollTop, clientHeight } =
                    containerRefElement;
                //once the user has scrolled within 400px of the bottom of the table, fetch more data if we can
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

    //scroll to top of table when sorting or filters change
    useEffect(() => {
        if (rowVirtualizerInstanceRef.current) {
            try {
                rowVirtualizerInstanceRef.current.scrollToIndex(0);
            } catch (e) {
                console.error(e);
            }
        }
    }, [sorting, columnFilters, globalFilter]);

    //a check on mount to see if the table is already scrolled to the bottom and immediately needs to fetch more data
    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const table = useMantineReactTable({
        columns,
        data: flatData,
        enablePagination: false,
        enableRowNumbers: true,
        enableRowVirtualization: true, //optional, but recommended if it is likely going to be more than 100 rows
        manualFiltering: true,
        manualSorting: true,
        mantineTableContainerProps: {
            ref: tableContainerRef, //get access to the table container element
            sx: { maxHeight: '600px' }, //give the table a max height
            onScroll: (
                event: UIEvent<HTMLDivElement>, //add an event listener to the table container element
            ) => fetchMoreOnBottomReached(event.target as HTMLDivElement),
        },
        mantineToolbarAlertBannerProps: {
            color: 'red',
            children: 'Error loading data',
        },
        onColumnFiltersChange: setColumnFilters,
        onGlobalFilterChange: setGlobalFilter,
        onSortingChange: setSorting,
        renderBottomToolbarCustomActions: () => (
            <Text>
                Fetched {totalFetched} of {totalDBRowCount} total rows.
            </Text>
        ),
        state: {
            columnFilters,
            globalFilter,
            isLoading,
            showAlertBanner: isError,
            showProgressBars: isFetching,
            sorting,
        },
        rowVirtualizerInstanceRef, //get access to the virtualizer instance
        rowVirtualizerProps: { overscan: 10 },
    });

    return <MantineReactTable table={table} />;
};
