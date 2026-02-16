import { getItemLabel, getItemMap, isField } from '@lightdash/common';
import { Box, Loader, Text } from '@mantine/core';
import { memo, useCallback, useMemo, useState, type FC } from 'react';
import { ResultsViewMode } from './types';

import {
    explorerActions,
    selectAdditionalMetrics,
    selectChartConfig,
    selectColumnOrder,
    selectCustomDimensions,
    selectIsEditMode,
    selectTableCalculations,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useColumns } from '../../../hooks/useColumns';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import type {
    useGetReadyQueryResults,
    useInfiniteQueryResults,
} from '../../../hooks/useQueryResults';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../../types/Events';
import PivotTable from '../../common/PivotTable';
import Table from '../../common/Table';
import { JsonViewerModal } from '../../JsonViewerModal';
import CellContextMenu from './CellContextMenu';
import ColumnHeaderContextMenu from './ColumnHeaderContextMenu';
import {
    EmptyStateExploreLoading,
    EmptyStateNoColumns,
    EmptyStateNoTableData,
    MissingRequiredParameters,
    NoTableSelected,
} from './ExplorerResultsNonIdealStates';
import { useGroupedResultsAvailability } from './useGroupedResultsAvailability';
import { usePivotTableData } from './usePivotTableData';

const getQueryStatus = (
    query: ReturnType<typeof useGetReadyQueryResults>,
    queryResults: ReturnType<typeof useInfiniteQueryResults>,
): 'loading' | 'error' | 'idle' | 'success' => {
    const isCreatingQuery = query.isFetching;
    const isFetchingFirstPage = queryResults.isFetchingFirstPage;

    // Don't return queryResults.status because we changed from mutation to query so 'loading' has a different meaning
    if (queryResults.error || query.error) {
        return 'error';
    } else if (isCreatingQuery || isFetchingFirstPage) {
        return 'loading';
    } else if (!query.data) {
        return 'idle';
    } else if (query.status === 'success') {
        return 'success';
    } else {
        return 'error';
    }
};

type ExplorerResultsProps = {
    viewMode: ResultsViewMode;
};

export const ExplorerResults = memo(({ viewMode }: ExplorerResultsProps) => {
    const dispatch = useExplorerDispatch();
    const columns = useColumns();
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const activeTableName = useExplorerSelector(selectTableName);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const customDimensions = useExplorerSelector(selectCustomDimensions);

    // Get chart config for column properties
    const chartConfig = useExplorerSelector(selectChartConfig);
    const columnProperties =
        chartConfig.type === 'table' && chartConfig.config?.columns
            ? chartConfig.config.columns
            : undefined;

    // Get query state from new hook
    const {
        query,
        queryResults,
        unpivotedQuery,
        unpivotedQueryResults,
        unpivotedEnabled,
        missingRequiredParameters,
    } = useExplorerQuery();

    const dimensions = query.data?.metricQuery?.dimensions ?? [];
    const metrics = query.data?.metricQuery?.metrics ?? [];
    const explorerColumnOrder = useExplorerSelector(selectColumnOrder);

    // Check if grouped view is available
    const {
        isSqlPivotEnabled,
        hasPivotColumns: hasPivotConfig,
        canShowGroupedResults,
    } = useGroupedResultsAvailability();

    const resultsData = useMemo(() => {
        const hasUnpivotedQuery = !!unpivotedQuery?.data?.queryUuid;

        // Check if we need unpivoted data (regardless of whether it's ready)
        const needsUnpivotedData =
            isSqlPivotEnabled && hasPivotConfig && unpivotedEnabled;

        // Only use unpivoted data when it's ready
        const shouldUseUnpivotedData = needsUnpivotedData && hasUnpivotedQuery;

        // When we need unpivoted data but it's not ready yet,
        // show loading state instead of falling back to pivoted main query data.
        // The main query has a different row structure (pivoted) that would cause
        // the first column to show "-" because the pivot dimension key is missing.
        if (needsUnpivotedData && !hasUnpivotedQuery) {
            return {
                rows: [],
                totalResults: undefined,
                isFetchingRows: true,
                fetchMoreRows: () => {},
                status: 'loading' as const,
                apiError: undefined,
            };
        }

        if (shouldUseUnpivotedData) {
            return {
                rows: unpivotedQueryResults.rows,
                totalResults: unpivotedQueryResults.totalResults,
                isFetchingRows:
                    unpivotedQueryResults.isFetchingRows &&
                    !unpivotedQueryResults.error,
                fetchMoreRows: unpivotedQueryResults.fetchMoreRows,
                status: getQueryStatus(unpivotedQuery, unpivotedQueryResults),
                apiError: unpivotedQuery.error ?? unpivotedQueryResults.error,
            };
        }

        const finalStatus = getQueryStatus(query, queryResults);
        const result = {
            rows: queryResults.rows,
            totalResults: queryResults.totalResults,
            isFetchingRows: queryResults.isFetchingRows && !queryResults.error,
            fetchMoreRows: queryResults.fetchMoreRows,
            status: finalStatus,
            apiError: query.error ?? queryResults.error,
        };

        return result;
    }, [
        isSqlPivotEnabled,
        unpivotedQuery,
        hasPivotConfig,
        unpivotedEnabled,
        query,
        queryResults,
        unpivotedQueryResults,
    ]);

    const {
        rows,
        totalResults: totalRows,
        isFetchingRows,
        fetchMoreRows,
        status,
        apiError,
    } = resultsData;

    // Grouped results data - uses the main query which has pivoted data when backend pivoting is enabled
    const groupedResultsData = useMemo(() => {
        if (!canShowGroupedResults) {
            return null;
        }

        const finalStatus = getQueryStatus(query, queryResults);
        return {
            rows: queryResults.rows,
            totalResults: queryResults.totalResults,
            isFetchingRows: queryResults.isFetchingRows && !queryResults.error,
            fetchMoreRows: queryResults.fetchMoreRows,
            status: finalStatus,
            apiError: query.error ?? queryResults.error,
            pivotDetails: queryResults.pivotDetails,
        };
    }, [canShowGroupedResults, query, queryResults]);

    const handleColumnOrderChange = useCallback(
        (order: string[]) => {
            dispatch(explorerActions.setColumnOrder(order));
        },
        [dispatch],
    );

    const { data: exploreData, isInitialLoading: isExploreLoading } =
        useExplore(activeTableName, {
            refetchOnMount: false,
        });
    const [isExpandModalOpened, setIsExpandModalOpened] = useState(false);
    const [expandData, setExpandData] = useState<{
        name: string;
        jsonObject: Record<string, unknown>;
    }>({
        name: 'unknown',
        jsonObject: {},
    });

    const handleCellExpand = (name: string, data: Record<string, unknown>) => {
        setExpandData({
            name: name,
            jsonObject: data,
        });
        setIsExpandModalOpened(true);
    };

    const itemsMap = useMemo(() => {
        return exploreData
            ? getItemMap(
                  exploreData,
                  additionalMetrics,
                  tableCalculations,
                  customDimensions,
              )
            : undefined;
    }, [exploreData, additionalMetrics, tableCalculations, customDimensions]);

    // Field helper functions for PivotTable
    const getField = useCallback(
        (fieldId: string) => (itemsMap ? itemsMap[fieldId] : undefined),
        [itemsMap],
    );

    const getFieldLabel = useCallback(
        (fieldId: string | null | undefined) => {
            if (!fieldId) return undefined;

            // Check for custom label override from column properties first
            const customLabel = columnProperties?.[fieldId]?.name;
            if (customLabel) return customLabel;

            // Fall back to default label from itemsMap
            if (!itemsMap || !(fieldId in itemsMap)) return undefined;

            const item = itemsMap[fieldId];
            if (isField(item)) {
                return item.label;
            }
            return getItemLabel(item);
        },
        [itemsMap, columnProperties],
    );

    // Convert pivoted query results to PivotData format for PivotTable
    // Only process when user is actually viewing grouped results
    const pivotTableQuery = usePivotTableData({
        enabled: canShowGroupedResults && viewMode === ResultsViewMode.GROUPED,
        rows: queryResults.rows,
        pivotDetails: queryResults.pivotDetails,
        columnOrder: explorerColumnOrder,
        getField,
        getFieldLabel,
    });

    const cellContextMenu = useCallback(
        (props: any) => (
            <CellContextMenu
                isEditMode={isEditMode}
                {...props}
                itemsMap={itemsMap}
                onExpand={handleCellExpand}
            />
        ),
        [isEditMode, itemsMap],
    );

    const IdleState: FC = useCallback(() => {
        const description =
            dimensions.length <= 0 ? (
                <>
                    Pick one or more{' '}
                    <Text span color="blue.9">
                        dimensions
                    </Text>{' '}
                    to split your selected metric by.
                </>
            ) : metrics.length <= 0 ? (
                <>
                    Pick a{' '}
                    <Text span color="yellow.9">
                        metric
                    </Text>{' '}
                    to make calculations across your selected dimensions.
                </>
            ) : (
                <>
                    Run query to view your results and visualize them as a
                    chart.
                </>
            );

        return <EmptyStateNoTableData description={description} />;
    }, [dimensions.length, metrics.length]);

    const pagination = useMemo(
        () => ({
            show: true,
            showResultsTotal: true,
        }),
        [],
    );
    const footer = useMemo(
        () => ({
            show: true,
        }),
        [],
    );

    if (!activeTableName) return <NoTableSelected />;

    if (columns.length === 0) return <EmptyStateNoColumns />;

    if (isExploreLoading) return <EmptyStateExploreLoading />;

    if (missingRequiredParameters && missingRequiredParameters.length > 0)
        return (
            <MissingRequiredParameters
                missingRequiredParameters={missingRequiredParameters}
            />
        );

    const showGroupedView =
        viewMode === ResultsViewMode.GROUPED && groupedResultsData;

    // Render grouped view content
    const renderGroupedView = () => {
        if (pivotTableQuery.isLoading || groupedResultsData?.isFetchingRows) {
            return (
                <Box
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        minHeight: 200,
                    }}
                >
                    <Loader />
                </Box>
            );
        }

        if (pivotTableQuery.error) {
            return (
                <Text c="red" ta="center">
                    Error loading grouped results:{' '}
                    {pivotTableQuery.error.message}
                </Text>
            );
        }

        if (!pivotTableQuery.data) {
            return <IdleState />;
        }

        return (
            <PivotTable
                data={pivotTableQuery.data}
                conditionalFormattings={[]}
                minMaxMap={undefined}
                hideRowNumbers={false}
                getFieldLabel={getFieldLabel}
                getField={getField}
                showSubtotals={false}
                isMinimal={false}
            />
        );
    };

    return (
        <TrackSection name={SectionName.RESULTS_TABLE}>
            <Box px="xs" py="lg" data-testid="results-table-container">
                {showGroupedView ? (
                    // Grouped results view - shows pivoted data with hierarchical headers
                    // Match approximate height of the paginated results table
                    <Box
                        style={{
                            minHeight: 300,
                            maxHeight: 450,
                            overflow: 'auto',
                        }}
                    >
                        {renderGroupedView()}
                    </Box>
                ) : (
                    // Regular results view - shows unpivoted data
                    <Table
                        status={status}
                        errorDetail={apiError?.error}
                        data={rows || []}
                        totalRowsCount={totalRows || 0}
                        isFetchingRows={isFetchingRows}
                        fetchMoreRows={fetchMoreRows}
                        columns={columns}
                        columnOrder={explorerColumnOrder}
                        onColumnOrderChange={handleColumnOrderChange}
                        cellContextMenu={cellContextMenu}
                        headerContextMenu={
                            isEditMode ? ColumnHeaderContextMenu : undefined
                        }
                        idleState={IdleState}
                        pagination={pagination}
                        footer={footer}
                        showSubtotals={false}
                        columnProperties={columnProperties}
                    />
                )}

                <JsonViewerModal
                    heading={`Field: ${expandData.name}`}
                    jsonObject={expandData.jsonObject}
                    opened={isExpandModalOpened}
                    onClose={() => setIsExpandModalOpened(false)}
                />
            </Box>
        </TrackSection>
    );
});
