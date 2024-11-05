import { type CatalogField, type CatalogItem } from '@lightdash/common';
import { Box, Button, Highlight, HoverCard, Text } from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
    type MRT_Row,
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
import MantineIcon from '../../../components/common/MantineIcon';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { useMetricsCatalog } from '../hooks/useMetricsCatalog';
import { setActiveMetric } from '../store/metricsCatalogSlice';
import { ExploreMetricButton } from './ExploreMetricButton';

const MetricUsageButton = ({ row }: { row: MRT_Row<CatalogField> }) => {
    const hasChartsUsage = row.original.chartUsage ?? 0 > 0;
    const dispatch = useAppDispatch();
    const { track } = useTracking();

    const handleChartUsageClick = () => {
        if (hasChartsUsage) {
            track({
                name: EventName.METRICS_CATALOG_CHART_USAGE_CLICKED,
                properties: {
                    metricName: row.original.name,
                    chartCount: row.original.chartUsage ?? 0,
                    tableName: row.original.tableName,
                },
            });
            dispatch(setActiveMetric(row.original));
        }
    };

    return (
        <Button
            size="xs"
            compact
            color="gray.6"
            variant="default"
            disabled={!hasChartsUsage}
            onClick={handleChartUsageClick}
            leftIcon={
                <MantineIcon
                    display={hasChartsUsage ? 'block' : 'none'}
                    icon={IconChartBar}
                    color="gray.6"
                    size={12}
                    strokeWidth={1.2}
                    fill="gray.2"
                />
            }
            sx={{
                '&[data-disabled]': {
                    backgroundColor: 'transparent',
                    fontWeight: 400,
                },
            }}
            styles={{
                leftIcon: {
                    marginRight: 4,
                },
            }}
        >
            {hasChartsUsage ? `${row.original.chartUsage}` : 'No usage'}
        </Button>
    );
};

const columns: MRT_ColumnDef<CatalogField>[] = [
    {
        accessorKey: 'name',
        header: 'Metric Name',
        enableSorting: true,
        Cell: ({ row, table }) => (
            <Highlight highlight={table.getState().globalFilter || ''}>
                {row.original.label}
            </Highlight>
        ),
    },
    {
        accessorKey: 'description',
        header: 'Description',
        enableSorting: false,
        size: 400,
        Cell: ({ table, row }) => (
            <HoverCard
                withinPortal
                shadow="lg"
                position="right"
                disabled={!row.original.description}
            >
                <HoverCard.Target>
                    <Text lineClamp={2}>
                        <Highlight
                            highlight={table.getState().globalFilter || ''}
                        >
                            {row.original.description ?? ''}
                        </Highlight>
                    </Text>
                </HoverCard.Target>
                <HoverCard.Dropdown>
                    <MarkdownPreview
                        source={row.original.description}
                        style={{
                            fontSize: '12px',
                        }}
                    />
                </HoverCard.Dropdown>
            </HoverCard>
        ),
    },
    {
        accessorKey: 'directory',
        header: 'Table',
        enableSorting: false,
        size: 150,
        Cell: ({ row }) => <Text fw={500}>{row.original.tableName}</Text>,
    },
    {
        accessorKey: 'chartUsage',
        header: 'Popularity',
        enableSorting: true,
        size: 100,
        Cell: ({ row }) => <MetricUsageButton row={row} />,
    },
];

export const MetricsTable = () => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
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

    const table = useMantineReactTable({
        columns,
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
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            sx: { maxHeight: '600px', minHeight: '600px' },
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
        mantineSearchTextInputProps: {
            placeholder: 'Search by metric name or description',
            sx: { minWidth: '300px' },
            variant: 'default',
        },
        positionGlobalFilter: 'left',
        enableBottomToolbar: true,
        renderBottomToolbarCustomActions: () => (
            <Text>
                {isFetching
                    ? 'Loading more...'
                    : hasNextPage
                    ? `Scroll for more metrics (${flatData.length} loaded)`
                    : `All metrics loaded (${flatData.length})`}
            </Text>
        ),
        state: {
            sorting,
            showProgressBars: isFetching,
            density: 'md',
            globalFilter: search ?? '',
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
    });

    return <MantineReactTable table={table} />;
};
