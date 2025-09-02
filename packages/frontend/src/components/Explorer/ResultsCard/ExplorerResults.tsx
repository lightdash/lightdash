import { getItemMap } from '@lightdash/common';
import { Box, Text } from '@mantine/core';
import { memo, useCallback, useMemo, useState, type FC } from 'react';

import { useColumns } from '../../../hooks/useColumns';
import { useExplore } from '../../../hooks/useExplore';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../../types/Events';
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

const getQueryStatus = (query: any, queryResults: any) => {
    const isCreatingQuery = query.isFetching;
    const isFetchingFirstPage = queryResults.isFetchingFirstPage;

    // Don't return queryResults.status because we changed from mutation to query so 'loading' has a different meaning
    if (queryResults.error) {
        return 'error';
    } else if (isCreatingQuery || isFetchingFirstPage) {
        return 'loading';
    } else if (query.status === 'loading' || !query.isFetched) {
        return 'idle';
    } else {
        return query.status;
    }
};

export const ExplorerResults = memo(() => {
    const columns = useColumns();
    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );
    const activeTableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const dimensions = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.dimensions,
    );
    const metrics = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.metrics,
    );
    const explorerColumnOrder = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableConfig.columnOrder,
    );

    const resultsData = useExplorerContext((context) => {
        const hasPivotConfig = !!context.state.unsavedChartVersion.pivotConfig;
        const hasUnpivotedQuery = !!context.unpivotedQuery.data?.queryUuid;
        const shouldUseUnpivotedData = hasPivotConfig && hasUnpivotedQuery;

        // Check if we need to show loading for unpivoted data
        const isUnpivotedQueryLoading =
            context.unpivotedQuery.isFetching ||
            context.unpivotedQueryResults.isFetchingFirstPage ||
            context.unpivotedQuery.status === 'loading';
        const needsUnpivotedQuery =
            hasPivotConfig &&
            !hasUnpivotedQuery &&
            !context.unpivotedQuery.isFetching &&
            !context.unpivotedQuery.data;
        const shouldShowLoadingForUnpivoted =
            hasPivotConfig &&
            !hasUnpivotedQuery &&
            (isUnpivotedQueryLoading || needsUnpivotedQuery);

        if (shouldShowLoadingForUnpivoted) {
            // Show loading state for pivoted charts waiting for unpivoted data
            return {
                rows: undefined,
                totalResults: undefined,
                isFetchingRows: false,
                fetchMoreRows: () => {},
                status: 'loading' as const,
                apiError: null,
            };
        }

        if (shouldUseUnpivotedData) {
            const queryResults = context.unpivotedQueryResults;
            const query = context.unpivotedQuery;

            return {
                rows: queryResults.rows,
                totalResults: queryResults.totalResults,
                isFetchingRows:
                    queryResults.isFetchingRows && !queryResults.error,
                fetchMoreRows: queryResults.fetchMoreRows,
                status: getQueryStatus(query, queryResults),
                apiError: query.error ?? queryResults.error,
            };
        }

        const queryResults = context.queryResults;
        const query = context.query;

        return {
            rows: queryResults.rows,
            totalResults: queryResults.totalResults,
            isFetchingRows: queryResults.isFetchingRows && !queryResults.error,
            fetchMoreRows: queryResults.fetchMoreRows,
            status: getQueryStatus(query, queryResults),
            apiError: query.error ?? queryResults.error,
        };
    });

    const {
        rows,
        totalResults: totalRows,
        isFetchingRows,
        fetchMoreRows,
        status,
        apiError,
    } = resultsData;

    const setColumnOrder = useExplorerContext(
        (context) => context.actions.setColumnOrder,
    );
    const { data: exploreData, isInitialLoading: isExploreLoading } =
        useExplore(activeTableName, {
            refetchOnMount: false,
        });
    const tableCalculations = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.tableCalculations,
    );
    const additionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );
    const missingRequiredParameters = useExplorerContext(
        (context) => context.state.missingRequiredParameters,
    );
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
        if (exploreData) {
            return getItemMap(
                exploreData,
                additionalMetrics,
                tableCalculations,
            );
        }
        return undefined;
    }, [exploreData, additionalMetrics, tableCalculations]);

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

    return (
        <TrackSection name={SectionName.RESULTS_TABLE}>
            <Box px="xs" py="lg">
                <Table
                    status={status}
                    errorDetail={apiError?.error}
                    data={rows || []}
                    totalRowsCount={totalRows || 0}
                    isFetchingRows={isFetchingRows}
                    fetchMoreRows={fetchMoreRows}
                    columns={columns}
                    columnOrder={explorerColumnOrder}
                    onColumnOrderChange={setColumnOrder}
                    cellContextMenu={cellContextMenu}
                    headerContextMenu={
                        isEditMode ? ColumnHeaderContextMenu : undefined
                    }
                    idleState={IdleState}
                    pagination={pagination}
                    footer={footer}
                    showSubtotals={false}
                />
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
