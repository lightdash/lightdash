import { ChartConfig, countTotalFilterRules } from 'common';
import { useEffect } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useMount } from 'react-use';
import { useApp } from '../providers/AppProvider';
import {
    ExplorerReduceState,
    useExplorer,
} from '../providers/ExplorerProvider';

export const convertExplorerStateToExploreUrl = (
    state: ExplorerReduceState,
    chartConfig?: ChartConfig,
) => {
    const newParams = new URLSearchParams();

    if (state.dimensions.length === 0) {
        newParams.delete('dimensions');
    } else {
        newParams.set('dimensions', state.dimensions.join(','));
    }
    if (state.metrics.length === 0) {
        newParams.delete('metrics');
    } else {
        newParams.set('metrics', state.metrics.join(','));
    }
    if (state.sorts.length === 0) {
        newParams.delete('sort');
    } else {
        newParams.set('sort', JSON.stringify(state.sorts));
    }
    if (countTotalFilterRules(state.filters) === 0) {
        newParams.delete('filters');
    } else {
        newParams.set('filters', JSON.stringify(state.filters));
    }
    newParams.set('limit', `${state.limit}`);
    if (state.columnOrder.length === 0) {
        newParams.delete('column_order');
    } else {
        newParams.set('column_order', state.columnOrder.join(','));
    }
    if (state.selectedTableCalculations.length === 0) {
        newParams.delete('selected_table_calculations');
    } else {
        newParams.set(
            'selected_table_calculations',
            state.selectedTableCalculations.join(','),
        );
    }
    if (state.tableCalculations.length === 0) {
        newParams.delete('table_calculations');
    } else {
        newParams.set(
            'table_calculations',
            JSON.stringify(state.tableCalculations),
        );
    }

    if (chartConfig) {
        console.log('chart config', JSON.stringify(chartConfig));
        newParams.set('chart_config', JSON.stringify(chartConfig));
    }
    return newParams;
};
export const useExplorerRoute = () => {
    const { showToastError } = useApp();
    const { search } = useLocation();
    const history = useHistory();
    const pathParams =
        useParams<{ projectUuid: string; tableId: string | undefined }>();
    const {
        pristineState,
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
                setState({
                    chartName: '',
                    sorting: false,
                    tableName: pathParams.tableId,
                    dimensions,
                    metrics,
                    filters,
                    sorts,
                    limit,
                    columnOrder,
                    tableCalculations,
                    selectedTableCalculations,
                });
            } catch (e: any) {
                showToastError({ title: 'Error parsing url', subtitle: e });
            }
        }
    });

    // Update url params based on pristine state
    useEffect(() => {
        if (pristineState.tableName) {
            const newParams = convertExplorerStateToExploreUrl(pristineState);

            history.replace({
                pathname: `/projects/${pathParams.projectUuid}/tables/${pristineState.tableName}`,
                search: newParams.toString(),
            });
        }
    }, [pristineState, history, pathParams.projectUuid]);

    useEffect(() => {
        if (!pathParams.tableId) {
            reset();
        } else {
            setTableName(pathParams.tableId);
        }
    }, [pathParams.tableId, reset, setTableName]);
};
