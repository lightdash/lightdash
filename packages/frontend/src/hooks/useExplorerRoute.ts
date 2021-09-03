import { useEffect } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useMount } from 'react-use';
import { useExplorer } from '../providers/ExplorerProvider';
import { useApp } from '../providers/AppProvider';

export const useExplorerRoute = () => {
    const { showToastError } = useApp();
    const { search } = useLocation();
    const history = useHistory();
    const pathParams = useParams<{ tableId: string | undefined }>();
    const {
        state,
        actions: { setState, reset },
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
            } catch (e) {
                showToastError({ title: 'Error parsing url', subtitle: e });
            }
        } else {
            reset();
        }
    });

    // Update url params based on state
    useEffect(() => {
        if (state.tableName) {
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
            if (state.filters.length === 0) {
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
            history.replace({
                pathname: `/tables/${state.tableName}`,
                search: newParams.toString(),
            });
        }
    }, [state, history]);
};
