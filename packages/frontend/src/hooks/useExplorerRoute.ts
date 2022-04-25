import { ChartType, countTotalFilterRules } from 'common';
import { useEffect, useMemo } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useApp } from '../providers/AppProvider';
import {
    ExplorerReduceState,
    useExplorer,
} from '../providers/ExplorerProvider';

export const useExplorerRoute = () => {
    const history = useHistory();
    const pathParams =
        useParams<{ projectUuid: string; tableId: string | undefined }>();
    const {
        state: {
            unsavedChartVersion: {
                tableName,
                tableConfig: { columnOrder: stateColumnOrder },
            },
        },
        queryResults: { data: queryResultsData },
        actions: { reset, setTableName },
    } = useExplorer();

    // Update url params based on pristine state
    useEffect(() => {
        if (queryResultsData?.metricQuery && tableName) {
            const newParams = new URLSearchParams();
            if (queryResultsData.metricQuery.dimensions.length === 0) {
                newParams.delete('dimensions');
            } else {
                newParams.set(
                    'dimensions',
                    queryResultsData.metricQuery.dimensions.join(','),
                );
            }
            if (queryResultsData.metricQuery.metrics.length === 0) {
                newParams.delete('metrics');
            } else {
                newParams.set(
                    'metrics',
                    queryResultsData.metricQuery.metrics.join(','),
                );
            }
            if (queryResultsData.metricQuery.sorts.length === 0) {
                newParams.delete('sort');
            } else {
                newParams.set(
                    'sort',
                    JSON.stringify(queryResultsData.metricQuery.sorts),
                );
            }
            if (
                countTotalFilterRules(queryResultsData.metricQuery.filters) ===
                0
            ) {
                newParams.delete('filters');
            } else {
                newParams.set(
                    'filters',
                    JSON.stringify(queryResultsData.metricQuery.filters),
                );
            }
            newParams.set('limit', `${queryResultsData.metricQuery.limit}`);
            if (stateColumnOrder.length === 0) {
                newParams.delete('column_order');
            } else {
                newParams.set('column_order', stateColumnOrder.join(','));
            }
            if (queryResultsData.metricQuery.tableCalculations.length === 0) {
                newParams.delete('table_calculations');
            } else {
                newParams.set(
                    'table_calculations',
                    JSON.stringify(
                        queryResultsData.metricQuery.tableCalculations,
                    ),
                );
            }

            if (queryResultsData.metricQuery.additionalMetrics?.length === 0) {
                newParams.delete('additional_metrics');
            } else {
                newParams.set(
                    'additional_metrics',
                    JSON.stringify(
                        queryResultsData.metricQuery.additionalMetrics,
                    ),
                );
            }
            history.replace({
                pathname: `/projects/${pathParams.projectUuid}/tables/${tableName}`,
                search: newParams.toString(),
            });
        }
    }, [
        queryResultsData,
        tableName,
        stateColumnOrder,
        history,
        pathParams.projectUuid,
    ]);

    useEffect(() => {
        if (!pathParams.tableId) {
            reset();
        } else {
            setTableName(pathParams.tableId);
        }
    }, [pathParams.tableId, reset, setTableName]);
};

export const useExplorerUrlState = (): ExplorerReduceState | undefined => {
    const { showToastError } = useApp();
    const { search } = useLocation();
    const pathParams =
        useParams<{ projectUuid: string; tableId: string | undefined }>();

    return useMemo(() => {
        if (pathParams.tableId) {
            try {
                const searchParams = new URLSearchParams(search);
                const dimensions =
                    searchParams.get('dimensions')?.split(',') || [];
                const metrics = searchParams.get('metrics')?.split(',') || [];
                const sortSearchParam = searchParams.get('sort');
                const sorts = !sortSearchParam
                    ? []
                    : JSON.parse(sortSearchParam);
                const filterSearchParam = searchParams.get('filters');
                const filters = !filterSearchParam
                    ? []
                    : JSON.parse(filterSearchParam);
                const limitSearchParam = searchParams.get('limit');
                const limit =
                    limitSearchParam &&
                    !Number.isNaN(parseInt(limitSearchParam, 10))
                        ? parseInt(limitSearchParam, 10)
                        : 500;
                const columnOrder =
                    searchParams.get('column_order')?.split(',') || [];
                const tableCalculationsSearchParam =
                    searchParams.get('table_calculations');
                const tableCalculations = !tableCalculationsSearchParam
                    ? []
                    : JSON.parse(tableCalculationsSearchParam);
                const additionalMetricsParam =
                    searchParams.get('additionalMetrics');
                const additionalMetrics = !additionalMetricsParam
                    ? []
                    : JSON.parse(additionalMetricsParam);
                return {
                    shouldFetchResults: true,
                    chartName: undefined,
                    unsavedChartVersion: {
                        tableName: pathParams.tableId,
                        metricQuery: {
                            dimensions,
                            metrics,
                            filters,
                            sorts,
                            limit,
                            tableCalculations,
                            additionalMetrics,
                        },
                        pivotConfig: undefined,
                        tableConfig: {
                            columnOrder,
                        },
                        chartConfig: {
                            type: ChartType.CARTESIAN,
                            config: { layout: {}, eChartsConfig: {} },
                        },
                    },
                };
            } catch (e: any) {
                showToastError({ title: 'Error parsing url', subtitle: e });
            }
        }
    }, [pathParams, search, showToastError]);
};
