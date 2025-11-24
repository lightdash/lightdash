import {
    MAX_METRICS_TREE_NODE_COUNT,
    SpotlightTableColumns,
    assertUnreachable,
    type CatalogItem,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Center,
    Divider,
    Group,
    Paper,
    Text,
    useMantineTheme,
    type PaperProps,
} from '@mantine/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconArrowsSort,
} from '@tabler/icons-react';
import { useIsMutating } from '@tanstack/react-query';
import { ReactFlowProvider } from '@xyflow/react';
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
    type FC,
    type UIEvent,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import {
    MIN_METRICS_CATALOG_SEARCH_LENGTH,
    useMetricsCatalog,
} from '../hooks/useMetricsCatalog';
import { useMetricsTree } from '../hooks/useMetricsTree';
import { useSpotlightTableConfig } from '../hooks/useSpotlightTable';
import {
    setCategoryFilters,
    setColumnConfig,
    setSearch,
    setTableSorting,
    toggleMetricExploreModal,
} from '../store/metricsCatalogSlice';
import { MetricCatalogView } from '../types';
import Canvas from './Canvas';
import { MetricExploreModal } from './MetricExploreModal';
import { MetricsCatalogColumns } from './MetricsCatalogColumns';
import { MetricsTableTopToolbar } from './MetricsTableTopToolbar';

type MetricsTableProps = {
    metricCatalogView: MetricCatalogView;
};

export const MetricsTable: FC<MetricsTableProps> = ({ metricCatalogView }) => {
    const { track } = useTracking();
    const dispatch = useAppDispatch();
    const theme = useMantineTheme();
    const location = useLocation();
    const navigate = useNavigate();

    const userUuid = useAppSelector(
        (state) => state.metricsCatalog.user?.userUuid,
    );
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );
    const categoryFilters = useAppSelector(
        (state) => state.metricsCatalog.categoryFilters,
    );
    const { canManageTags, canManageMetricsTree } = useAppSelector(
        (state) => state.metricsCatalog.abilities,
    );
    const isMetricExploreModalOpen = useAppSelector(
        (state) => state.metricsCatalog.modals.metricExploreModal.isOpen,
    );
    const search = useAppSelector((state) => state.metricsCatalog.search);
    const stateTableSorting = useAppSelector(
        (state) => state.metricsCatalog.tableSorting,
    );
    const deferredSearch = useDeferredValue(search);
    const prevView = useRef(metricCatalogView);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null);

    // We need internal state to handle non serializable state for the updater function
    const [internalSorting, setInternalSorting] =
        useState<MRT_SortingState>(stateTableSorting);

    const onCloseMetricExploreModal = () => {
        dispatch(toggleMetricExploreModal(undefined));
    };

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
        ...(stateTableSorting.length > 0 && {
            sortBy: stateTableSorting[0].id as keyof CatalogItem,
            sortDirection: stateTableSorting[0].desc ? 'desc' : 'asc',
        }),
    });

    useEffect(() => {
        dispatch(setTableSorting(internalSorting));
    }, [dispatch, internalSorting]);

    useEffect(() => {
        if (
            deferredSearch &&
            deferredSearch.length > MIN_METRICS_CATALOG_SEARCH_LENGTH &&
            data
        ) {
            track({
                name: EventName.METRICS_CATALOG_SEARCH_APPLIED,
                properties: {
                    userId: userUuid,
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                },
            });
        }
    }, [deferredSearch, track, organizationUuid, projectUuid, data, userUuid]);

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

    const handleSetCategoryFilters = (selectedCategories: string[]) => {
        dispatch(setCategoryFilters(selectedCategories));

        // Track when categories are applied as filters
        if (selectedCategories.length > 0 && selectedCategories) {
            track({
                name: EventName.METRICS_CATALOG_CATEGORY_FILTER_APPLIED,
                properties: {
                    userId: userUuid,
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                },
            });
        }
    };

    // Reusable paper props to avoid duplicate when rendering tree view
    const mantinePaperProps: PaperProps = useMemo(
        () => ({
            shadow: undefined,
            sx: {
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm, // ! radius doesn't have rem(12) -> 0.75rem
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
            },
        }),
        [theme],
    );

    const flatData = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data],
    );

    // Fetch metric tree data
    const selectedMetricUuids = useMemo(() => {
        return flatData.map((metric) => metric.catalogSearchUuid);
    }, [flatData]);

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

    const isValidMetricsNodeCount =
        selectedMetricUuids.length > 0 &&
        selectedMetricUuids.length <= MAX_METRICS_TREE_NODE_COUNT;

    const { data: metricsTree } = useMetricsTree(
        projectUuid,
        selectedMetricUuids,
        {
            enabled: !!projectUuid && isValidMetricsNodeCount,
        },
    );

    // Viewers cannot access metrics tree if there are no edges
    const isValidMetricsEdgeCount = useMemo(
        () => canManageMetricsTree || (metricsTree?.edges.length ?? 0) > 0,
        [canManageMetricsTree, metricsTree],
    );

    const isValidMetricsTree = useMemo(
        () => isValidMetricsNodeCount && isValidMetricsEdgeCount,
        [isValidMetricsNodeCount, isValidMetricsEdgeCount],
    );

    const dataHasCategories = useMemo(() => {
        return flatData.some((item) => item.categories?.length);
    }, [flatData]);

    const noMetricsAvailable = useMemo(() => {
        return (
            flatData.length === 0 &&
            !isLoading &&
            !isFetching &&
            !hasNextPage &&
            !search &&
            categoryFilters.length === 0
        );
    }, [flatData, isLoading, isFetching, search, categoryFilters, hasNextPage]);

    // Get column config from Redux
    const columnConfig = useAppSelector(
        (state) => state.metricsCatalog.columnConfig,
    );

    // Only fetch saved config on initial load
    const { data: spotlightConfig } = useSpotlightTableConfig({
        projectUuid,
    });

    const columnVisibilityWithPermissions = useMemo(
        () => ({
            ...columnConfig.columnVisibility,
            [SpotlightTableColumns.CATEGORIES]:
                columnConfig.columnVisibility[
                    SpotlightTableColumns.CATEGORIES
                ] &&
                (canManageTags || dataHasCategories),
        }),
        [columnConfig.columnVisibility, canManageTags, dataHasCategories],
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
            dispatch(setSearch(s));
        },
        manualFiltering: true,
        enableFilterMatchHighlighting: true,
        enableSorting: true,
        manualSorting: true,
        onSortingChange: setInternalSorting,
        enableTopToolbar: true,
        positionGlobalFilter: 'left',
        mantinePaperProps,
        mantineTableContainerProps: {
            ref: tableContainerRef,
            sx: {
                maxHeight: 'calc(100dvh - 350px)',
                minHeight: 600,
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

            const isLastVisibleColumn =
                props.table
                    .getVisibleLeafColumns()
                    .findIndex((col) => col.id === props.column.id) ===
                props.table.getVisibleLeafColumns().length - 1;

            return {
                bg: 'ldGray.0',
                h: '3xl',
                pos: 'relative',
                // Adding to inline styles to override the default ones which can't be overridden with sx
                style: {
                    padding: `${theme.spacing.xs} ${theme.spacing.xl}`,
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                    borderRight: props.column.getIsResizing()
                        ? `2px solid ${theme.colors.blue[3]}`
                        : `1px solid ${
                              isLastVisibleColumn
                                  ? 'transparent'
                                  : theme.colors.ldGray[2]
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
                // This is needed to remove the bottom border of the last row when there are no rows (cell props are not used)
                // It doesn't work when there are rows because they more specific selectors for default styles, so TableBodyCellProps are used instead
                'tr:last-of-type > td': {
                    borderBottom: 'none',
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
                        backgroundColor: theme.colors.ldGray[0],
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
            const isLastVisibleColumn =
                props.table
                    .getVisibleLeafColumns()
                    .findIndex((col) => col.id === props.column.id) ===
                props.table.getVisibleLeafColumns().length - 1;

            const isLastRow = flatData.length === props.row.index + 1;
            const hasScroll = tableContainerRef.current
                ? tableContainerRef.current.scrollHeight >
                  tableContainerRef.current.clientHeight
                : false;

            return {
                h: 72,
                // Adding to inline styles to override the default ones which can't be overridden with sx
                style: {
                    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
                    borderRight: isLastVisibleColumn
                        ? 'none'
                        : `1px solid ${theme.colors.ldGray[2]}`,
                    // This is needed to remove the bottom border of the last row when there are rows
                    borderBottom:
                        isLastRow && hasScroll
                            ? 'none'
                            : `1px solid ${theme.colors.ldGray[2]}`,
                    borderTop: 'none',
                    borderLeft: 'none',
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
                    setSearch={(s) => dispatch(setSearch(s))}
                    totalResults={totalResults}
                    selectedCategories={categoryFilters}
                    setSelectedCategories={handleSetCategoryFilters}
                    position="apart"
                    p={`${theme.spacing.lg} ${theme.spacing.xl}`}
                    showCategoriesFilter={canManageTags || dataHasCategories}
                    isValidMetricsTree={isValidMetricsTree}
                    isValidMetricsNodeCount={isValidMetricsNodeCount}
                    isValidMetricsEdgeCount={isValidMetricsEdgeCount}
                    metricCatalogView={metricCatalogView}
                    table={table}
                />
                <Divider color="ldGray.2" />
            </Box>
        ),
        renderBottomToolbar: () => (
            <Box
                p={`${theme.spacing.sm} ${theme.spacing.xl} ${theme.spacing.md} ${theme.spacing.xl}`}
                fz="xs"
                fw={500}
                color="ldGray.8"
                sx={{
                    borderTop: `1px solid ${theme.colors.ldGray[3]}`,
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
                        <Text fw={400} color="ldGray.6">
                            {hasNextPage
                                ? `(${flatData.length} loaded)`
                                : `(${flatData.length})`}
                        </Text>
                    </Group>
                )}
            </Box>
        ),
        renderEmptyRowsFallback: () => {
            return noMetricsAvailable ? (
                <SuboptimalState
                    title="No metrics defined in this project"
                    action={
                        <Text>
                            To learn how to define metrics, check out our{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/references/metrics/"
                            >
                                documentation
                            </Anchor>
                        </Text>
                    }
                />
            ) : (
                <Center>
                    <Text fs="italic" color="gray">
                        No results found
                    </Text>
                </Center>
            );
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
            sorting: stateTableSorting,
            showProgressBars: false,
            showLoadingOverlay, // show loading overlay when fetching (like search, category filtering), but hide when editing rows.
            showSkeletons: isLoading, // loading for the first time with no data
            density: 'md',
            globalFilter: search ?? '',
            columnOrder: columnConfig.columnOrder,
            columnVisibility: columnVisibilityWithPermissions,
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
        enableEditing: true,
        editDisplayMode: 'cell',
    });

    // Initialize Redux state from API config whenever we load it via the API
    useEffect(() => {
        if (spotlightConfig) {
            dispatch(setColumnConfig(spotlightConfig));
        }
    }, [dispatch, spotlightConfig]);

    useEffect(
        function handleRefetchOnViewChange() {
            if (
                data &&
                metricCatalogView === MetricCatalogView.LIST &&
                prevView.current === MetricCatalogView.CANVAS
            ) {
                table.setRowSelection({}); // Force a re-render of the table
            }

            prevView.current = metricCatalogView;
        },
        [metricCatalogView, data, table],
    );

    switch (metricCatalogView) {
        case MetricCatalogView.LIST:
            return (
                <>
                    <MantineReactTable table={table} />
                    {isMetricExploreModalOpen && (
                        <MetricExploreModal
                            opened={isMetricExploreModalOpen}
                            onClose={onCloseMetricExploreModal}
                            metrics={flatData}
                        />
                    )}
                </>
            );
        case MetricCatalogView.CANVAS:
            return (
                <Paper {...mantinePaperProps}>
                    <Box>
                        <MetricsTableTopToolbar
                            search={search}
                            setSearch={(s) => dispatch(setSearch(s))}
                            totalResults={totalResults}
                            selectedCategories={categoryFilters}
                            setSelectedCategories={handleSetCategoryFilters}
                            position="apart"
                            p={`${theme.spacing.lg} ${theme.spacing.xl}`}
                            showCategoriesFilter={
                                canManageTags || dataHasCategories
                            }
                            isValidMetricsTree={isValidMetricsTree}
                            isValidMetricsNodeCount={isValidMetricsNodeCount}
                            isValidMetricsEdgeCount={isValidMetricsEdgeCount}
                            metricCatalogView={metricCatalogView}
                            table={table}
                        />
                        <Divider color="ldGray.2" />
                    </Box>
                    <Box w="100%" h="calc(100dvh - 350px)" mih={600}>
                        <ReactFlowProvider>
                            {isValidMetricsTree ? (
                                <Canvas
                                    metrics={flatData}
                                    edges={metricsTree?.edges ?? []}
                                    viewOnly={!canManageMetricsTree}
                                />
                            ) : (
                                <SuboptimalState
                                    title="Canvas mode not available"
                                    description={
                                        !isValidMetricsEdgeCount &&
                                        isValidMetricsNodeCount
                                            ? 'There are no connections between the selected metrics'
                                            : 'Please narrow your search to display up to 30 metrics'
                                    }
                                    action={
                                        <Button
                                            onClick={() => {
                                                void navigate({
                                                    pathname:
                                                        location.pathname.replace(
                                                            /\/canvas/,
                                                            '',
                                                        ),
                                                });
                                            }}
                                        >
                                            Back to list view
                                        </Button>
                                    }
                                />
                            )}
                        </ReactFlowProvider>
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
