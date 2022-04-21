import { countTotalFilterRules } from 'common';
import { useEffect } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useMount } from 'react-use';
import { useApp } from '../providers/AppProvider';
import { useExplorer } from '../providers/ExplorerProvider';

export const useExplorerRoute = () => {
    const { showToastError } = useApp();
    const { search } = useLocation();
    const history = useHistory();
    const pathParams =
        useParams<{ projectUuid: string; tableId: string | undefined }>();
    const {
        state: { tableName, columnOrder: stateColumnOrder },
        queryResults: { data: queryResultsData },
        actions: { setState, reset, setTableName },
    } = useExplorer();

    // Set initial state based on url params
    useMount(() => {
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
                const selectedTableCalculations =
                    searchParams
                        .get('selected_table_calculations')
                        ?.split(',') || [];
                const additionalMetricsParam =
                    searchParams.get('additionalMetrics');
                const additionalMetrics = !additionalMetricsParam
                    ? []
                    : JSON.parse(additionalMetricsParam);
                setState({
                    shouldFetchResults: true,
                    chartName: '',
                    tableName: pathParams.tableId,
                    dimensions,
                    metrics,
                    filters,
                    sorts,
                    limit,
                    columnOrder,
                    tableCalculations,
                    selectedTableCalculations,
                    additionalMetrics,
                });
            } catch (e: any) {
                showToastError({ title: 'Error parsing url', subtitle: e });
            }
        }
    });

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
                newParams.delete('selected_table_calculations');
            } else {
                newParams.set(
                    'selected_table_calculations',
                    queryResultsData.metricQuery.tableCalculations
                        .map(({ name }) => name)
                        .join(','),
                );
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
