import { type CatalogItem } from '@lightdash/common';
import { Box, Group, Text, useMantineTheme } from '@mantine/core';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_SortingState,
    type MRT_Virtualizer,
} from 'mantine-react-table';
import {
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
    type UIEvent,
} from 'react';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useMetricsCatalog } from '../hooks/useMetricsCatalog';
import { ExploreMetricButton } from './ExploreMetricButton';
import { MetricsCatalogColumns } from './MetricsCatalogColumns';
import { MetricsTableTopToolbar } from './MetricsTableTopToolbar';

export const MetricsTable = () => {
    const theme = useMantineTheme();
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const categoryFilters = useAppSelector(
        (state) => state.metricsCatalog.categoryFilters,
    );

    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null);

    const [search, setSearch] = useState<string | undefined>(undefined);
    const deferredSearch = useDeferredValue(search);

    // Enable sorting by highest popularity(how many charts use the metric) by default
    const initialSorting = [
        {
            id: 'chartUsage',
            desc: true,
        },
    ];

    const [sorting, setSorting] = useState<MRT_SortingState>(initialSorting);

    const { data, fetchNextPage, hasNextPage, isFetching } = useMetricsCatalog({
        projectUuid,
        pageSize: 20,
        search: deferredSearch,
        categories: categoryFilters,
        // TODO: Handle multiple sorting - this needs to be enabled and handled later in the backend
        ...(sorting.length > 0 && {
            sortBy: sorting[0].id as keyof CatalogItem,
            sortDirection: sorting[0].desc ? 'desc' : 'asc',
        }),
    });

    const flatData = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data],
    );

    //called on scroll and possibly on mount to fetch more data as the user scrolls and reaches bottom of table
    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (containerRefElement) {
                const { scrollHeight, scrollTop, clientHeight } =
                    containerRefElement;
                //once the user has scrolled within 200px of the bottom of the table, fetch more data if we can
                if (
                    scrollHeight - scrollTop - clientHeight < 200 &&
                    !isFetching &&
                    hasNextPage
                ) {
                    void fetchNextPage();
                }
            }
        },
        [fetchNextPage, isFetching, hasNextPage],
    );

    // Check if we need to fetch more data on mount
    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const totalResults = useMemo(() => {
        if (!data) return 0;
        // Return total results from the last page, this should be the same but still we want to have the latest value
        const lastPage = data.pages[data.pages.length - 1];
        return lastPage.pagination?.totalResults ?? 0;
    }, [data]);

    const table = useMantineReactTable({
        columns: MetricsCatalogColumns,
        data: flatData,
        enableColumnResizing: true,
        enableRowNumbers: false,
        enableRowActions: true,
        positionActionsColumn: 'last',
        enableRowVirtualization: true,
        enablePagination: false,
        enableFilters: true,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableGlobalFilterModes: false,
        onGlobalFilterChange: (s: string) => {
            setSearch(s);
        },
        enableSorting: true,
        manualSorting: true,
        onSortingChange: setSorting,
        enableTopToolbar: true,
        mantinePaperProps: {
            shadow: undefined,
            sx: {
                border: `1px solid ${theme.colors.gray[2]}`,
                borderRadius: theme.spacing.sm, // ! radius doesn't have rem(12) -> 0.75rem
                boxShadow: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)',
            },
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            sx: {
                maxHeight: '600px',
                minHeight: '600px',
            },
            onScroll: (event: UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.target as HTMLDivElement),
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: true,
        },
        mantineTableHeadRowProps: {
            sx: {
                boxShadow: 'none',
                // Each head row has a divider when resizing columns is enabled
                'th > div > div:last-child': {
                    width: '0.5px',
                    padding: '0px',
                },
            },
        },
        renderTopToolbar: () => (
            <MetricsTableTopToolbar
                search={search}
                setSearch={setSearch}
                totalResults={totalResults}
                position="apart"
                p={`${theme.spacing.lg} ${theme.spacing.xl}`}
            />
        ),
        positionGlobalFilter: 'left',
        renderBottomToolbar: () => (
            <Box
                p={`${theme.spacing.sm} ${theme.spacing.xl} ${theme.spacing.md} ${theme.spacing.xl}`}
                fz="xs"
                fw={500}
                color="gray.8"
            >
                {isFetching ? (
                    <Text>Loading more...</Text>
                ) : (
                    <Group spacing="two">
                        <Text>
                            {hasNextPage
                                ? 'Scroll for more metrics'
                                : 'All metrics loaded'}
                        </Text>
                        <Text fw={400} color="gray.6">
                            {hasNextPage
                                ? `(${flatData.length} loaded)`
                                : `(${flatData.length})`}
                        </Text>
                    </Group>
                )}
            </Box>
        ),
        state: {
            sorting,
            isLoading: isFetching,
            density: 'md',
            globalFilter: search ?? '',
        },
        mantineLoadingOverlayProps: {
            loaderProps: {
                color: 'violet',
            },
        },
        initialState: {
            showGlobalFilter: true, // Show search input by default
        },
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { overscan: 40 },
        displayColumnDefOptions: {
            'mrt-row-actions': {
                header: '',
            },
        },
        renderRowActions: ({ row }) => (
            <Box>
                <ExploreMetricButton row={row} />
            </Box>
        ),
        enableFilterMatchHighlighting: true,
        enableEditing: true,
        editDisplayMode: 'cell',
    });

    return <MantineReactTable table={table} />;
};
