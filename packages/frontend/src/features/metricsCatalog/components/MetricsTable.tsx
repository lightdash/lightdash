import { assertUnreachable, type CatalogItem } from '@lightdash/common';
import {
    Box,
    Divider,
    Group,
    Paper,
    Text,
    useMantineTheme,
    type PaperProps,
} from '@mantine/core';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
} from '@tabler/icons-react';
import { useIsMutating } from '@tanstack/react-query';
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
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useMetricsCatalog } from '../hooks/useMetricsCatalog';
import { MetricsCatalogColumns } from './MetricsCatalogColumns';
import {
    MetricCatalogView,
    MetricsTableTopToolbar,
} from './MetricsTableTopToolbar';
import MetricTree from './MetricTree';

export const MetricsTable = () => {
    const theme = useMantineTheme();
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const categoryFilters = useAppSelector(
        (state) => state.metricsCatalog.categoryFilters,
    );

    const canManageTags = useAppSelector(
        (state) => state.metricsCatalog.abilities.canManageTags,
    );

    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null);

    const [search, setSearch] = useState<string | undefined>(undefined);
    const deferredSearch = useDeferredValue(search);

    const [metricCatalogView, setMetricCatalogView] =
        useState<MetricCatalogView>(MetricCatalogView.LIST);

    // Enable sorting by highest popularity(how many charts use the metric) by default
    const initialSorting = [
        {
            id: 'chartUsage',
            desc: true,
        },
    ];

    const [sorting, setSorting] = useState<MRT_SortingState>(initialSorting);

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetching,
        isLoading,
        isPreviousData,
    } = useMetricsCatalog({
        projectUuid,
        pageSize: 50,
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

    const dataHasCategories = useMemo(() => {
        return flatData.some((item) => item.categories?.length);
    }, [flatData]);

    // Check if we are mutating any of the icons or categories related mutations
    // TODO: Move this to separate hook and utilise constants so this scales better
    const isMutating = useIsMutating({
        predicate: (mutation) => {
            const mutationKeys = [
                'create-tag',
                'update-tag',
                'delete-tag',
                'add-category',
                'remove-category',
                'update-catalog-item-icon',
            ];
            return Boolean(
                mutation.options.mutationKey?.some((key) =>
                    mutationKeys.includes(key as string),
                ),
            );
        },
    });

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

    const showLoadingOverlay = useMemo(
        () => isFetching && isPreviousData && !isMutating,
        [isFetching, isPreviousData, isMutating],
    );

    const handleViewChange = (view: MetricCatalogView) => {
        setMetricCatalogView(view);
    };

    // Reusable paper props to avoid duplicate when rendering tree view
    const mantinePaperProps: PaperProps = useMemo(
        () => ({
            shadow: undefined,
            sx: {
                border: `1px solid ${theme.colors.gray[2]}`,
                borderRadius: theme.spacing.sm, // ! radius doesn't have rem(12) -> 0.75rem
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
            },
        }),
        [theme],
    );

    const table = useMantineReactTable({
        columns: MetricsCatalogColumns,
        data: flatData,
        enableColumnResizing: true,
        enableRowNumbers: false,
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
        positionGlobalFilter: 'left',
        mantinePaperProps,
        mantineTableContainerProps: {
            ref: tableContainerRef,
            sx: {
                maxHeight: 'calc(100dvh - 350px)',
                minHeight: '600px',
                display: 'flex',
                flexDirection: 'column',
            },
            onScroll: (event: UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.target as HTMLDivElement),
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(flatData.length),
            sx: {
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        mantineTableHeadProps: {
            sx: {
                flexShrink: 1,
            },
        },
        mantineTableHeadRowProps: {
            sx: {
                boxShadow: 'none',

                // Each head row has a divider when resizing columns is enabled
                'th > div > div:last-child': {
                    height: 40,
                    top: -10,
                    right: -5,
                },

                'th > div > div:last-child > .mantine-Divider-root': {
                    border: 'none',
                },
            },
        },
        mantineTableHeadCellProps: (props) => {
            const isAnyColumnResizing = props.table
                .getAllColumns()
                .some((c) => c.getIsResizing());

            const isLastColumn =
                props.table.getAllColumns().indexOf(props.column) ===
                props.table.getAllColumns().length - 1;

            return {
                bg: 'gray.0',
                h: '3xl',
                pos: 'relative',
                // Adding to inline styles to override the default ones which can't be overridden with sx
                style: {
                    padding: `${theme.spacing.xs} ${theme.spacing.xl}`,
                    borderBottom: `1px solid ${theme.colors.gray[2]}`,
                    borderRight: props.column.getIsResizing()
                        ? `2px solid ${theme.colors.blue[3]}`
                        : `1px solid ${
                              isLastColumn
                                  ? 'transparent'
                                  : theme.colors.gray[2]
                          }`,
                    borderTop: 'none',
                    borderLeft: 'none',
                },
                sx: {
                    justifyContent: 'center',
                    'tr > th:last-of-type': {
                        borderLeft: `2px solid ${theme.colors.blue[3]}`,
                    },
                    '&:hover': {
                        borderRight: !isAnyColumnResizing
                            ? `2px solid ${theme.colors.blue[3]} !important` // This is needed to override the default inline styles
                            : undefined,
                        transition: `border-right ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                    },
                },
            };
        },
        mantineTableBodyProps: {
            sx: {
                flexGrow: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                'tr:last-of-type > td': {
                    borderBottom: 'none',
                    borderLeft: 'none !important',
                },
            },
        },
        mantineTableBodyRowProps: {
            sx: {
                'td:first-of-type > div > .explore-button-container': {
                    visibility: 'hidden',
                    opacity: 0,
                },
                '&:hover': {
                    td: {
                        backgroundColor: theme.colors.gray[0],
                        transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                    },

                    'td:first-of-type > div > .explore-button-container': {
                        visibility: 'visible',
                        opacity: 1,
                        transition: `visibility 0ms, opacity ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                    },
                },
            },
        },
        mantineTableBodyCellProps: (props) => {
            const isLastColumn =
                props.table.getAllColumns().indexOf(props.column) ===
                props.table.getAllColumns().length - 1;

            return {
                h: 72,
                // Adding to inline styles to override the default ones which can't be overridden with sx
                style: {
                    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
                    borderRight: isLastColumn
                        ? 'none'
                        : `1px solid ${theme.colors.gray[2]}`,
                    borderBottom: `1px solid ${theme.colors.gray[2]}`,
                    borderTop: 'none',
                },
                sx: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    flexShrink: 0,
                },
            };
        },
        renderTopToolbar: () => (
            <Box>
                <MetricsTableTopToolbar
                    search={search}
                    setSearch={setSearch}
                    totalResults={totalResults}
                    position="apart"
                    p={`${theme.spacing.lg} ${theme.spacing.xl}`}
                    showCategoriesFilter={canManageTags || dataHasCategories}
                    onMetricCatalogViewChange={handleViewChange}
                    metricCatalogView={metricCatalogView}
                />
                <Divider color="gray.2" />
            </Box>
        ),
        renderBottomToolbar: () => (
            <Box
                p={`${theme.spacing.sm} ${theme.spacing.xl} ${theme.spacing.md} ${theme.spacing.xl}`}
                fz="xs"
                fw={500}
                color="gray.8"
                sx={{
                    borderTop: `1px solid ${theme.colors.gray[3]}`,
                }}
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
        icons: {
            IconArrowsSort: () => (
                <MantineIcon icon={IconArrowsSort} size="md" color="gray.5" />
            ),
            IconSortAscending: () => (
                <MantineIcon icon={IconArrowUp} size="md" color="blue.6" />
            ),
            IconSortDescending: () => (
                <MantineIcon icon={IconArrowDown} size="md" color="blue.6" />
            ),
        },
        state: {
            sorting,
            showProgressBars: false,
            showLoadingOverlay, // show loading overlay when fetching (like search, category filtering), but hide when editing rows.
            showSkeletons: isLoading, // loading for the first time with no data
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
            columnVisibility: {
                categories: false,
            },
        },
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { overscan: 40 },
        displayColumnDefOptions: {
            'mrt-row-actions': {
                header: '',
            },
        },
        enableFilterMatchHighlighting: true,
        enableEditing: true,
        editDisplayMode: 'cell',
    });

    useEffect(() => {
        table.setColumnVisibility({
            categories: canManageTags || dataHasCategories,
        });
    }, [canManageTags, dataHasCategories, table]);

    switch (metricCatalogView) {
        case MetricCatalogView.LIST:
            return <MantineReactTable table={table} />;
        case MetricCatalogView.TREE:
            return (
                <Paper {...mantinePaperProps}>
                    <Box>
                        <MetricsTableTopToolbar
                            search={search}
                            setSearch={setSearch}
                            totalResults={totalResults}
                            position="apart"
                            p={`${theme.spacing.lg} ${theme.spacing.xl}`}
                            showCategoriesFilter={
                                canManageTags || dataHasCategories
                            }
                            onMetricCatalogViewChange={handleViewChange}
                            metricCatalogView={metricCatalogView}
                        />
                        <Divider color="gray.2" />
                    </Box>
                    <Box w="100%" h="calc(100dvh - 350px)">
                        <MetricTree metrics={flatData} />
                    </Box>
                </Paper>
            );
        default:
            return assertUnreachable(
                metricCatalogView,
                'Invalid metric catalog view',
            );
    }
};
