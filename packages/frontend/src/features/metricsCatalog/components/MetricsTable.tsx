import { type CatalogFieldWithAnalytics } from '@lightdash/common';
import { Button, HoverCard, Text } from '@mantine/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
    type MRT_Row,
    type MRT_Virtualizer,
} from 'mantine-react-table';
import { useCallback, useEffect, useMemo, useRef, type UIEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { useMetricsCatalog } from '../hooks/useMetricsCatalog';
import { setActiveMetric } from '../store/metricsCatalogSlice';

const MetricUsageButton = ({
    row,
}: {
    row: MRT_Row<CatalogFieldWithAnalytics>;
}) => {
    const hasChartsUsage = row.original.analytics?.charts.length > 0;
    const dispatch = useAppDispatch();
    return (
        <Button
            size="xs"
            compact
            color="indigo"
            variant="subtle"
            disabled={!hasChartsUsage}
            onClick={() =>
                hasChartsUsage && dispatch(setActiveMetric(row.original))
            }
            sx={{
                '&[data-disabled]': {
                    backgroundColor: 'transparent',
                    fontWeight: 400,
                },
            }}
        >
            {hasChartsUsage
                ? `${row.original.analytics?.charts.length} uses`
                : 'No usage'}
        </Button>
    );
};

const columns: MRT_ColumnDef<CatalogFieldWithAnalytics>[] = [
    {
        accessorKey: 'name',
        header: 'Metric Name',
        Cell: ({ row }) => <Text fw={500}>{row.original.label}</Text>,
    },
    {
        accessorKey: 'description',
        header: 'Description',
        Cell: ({ row }) => (
            <HoverCard withinPortal>
                <HoverCard.Target>
                    <Text lineClamp={2}>{row.original.description}</Text>
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
        header: 'Directory',
        Cell: ({ row }) => <Text fw={500}>{row.original.tableName}</Text>,
    },
    {
        accessorKey: 'usage',
        header: 'Usage',
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

    const { data, fetchNextPage, hasNextPage, isFetching } = useMetricsCatalog({
        projectUuid,
        pageSize: 20, // TODO: turn into constant
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
                //once the user has scrolled within 100px of the bottom of the table, fetch more data if we can
                if (
                    scrollHeight - scrollTop - clientHeight < 100 &&
                    !isFetching &&
                    hasNextPage
                ) {
                    void fetchNextPage();
                }
            }
        },
        [fetchNextPage, isFetching, hasNextPage],
    );
    // // Check if we need to fetch more data on mount
    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const table = useMantineReactTable({
        columns,
        data: flatData,
        enableColumnResizing: true,
        enableRowNumbers: true,
        enableRowVirtualization: true,
        enablePagination: false,
        enableSorting: false,
        enableFilters: false,
        enableGlobalFilter: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
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
        enableTopToolbar: false,
        enableBottomToolbar: true,
        renderBottomToolbarCustomActions: () => (
            <Text>
                {isFetching
                    ? 'Loading more...'
                    : hasNextPage
                    ? 'Scroll for more'
                    : 'All metrics loaded'}
            </Text>
        ),
        state: {
            isLoading: isFetching,
            showProgressBars: isFetching,
            density: 'xs',
        },
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { overscan: 40 },
    });

    return <MantineReactTable table={table} />;
};
