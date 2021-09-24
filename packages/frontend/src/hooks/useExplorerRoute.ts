import { useEffect } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useMount } from 'react-use';
import { useExplorer } from '../providers/ExplorerProvider';
import { useApp } from '../providers/AppProvider';

export const useExplorerRoute = () => {
    const { showToastError } = useApp();
    const { search } = useLocation();
    const history = useHistory();
    const pathParams =
        useParams<{ projectUuid: string; tableId: string | undefined }>();
    const {
        pristineState,
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
        }
    });

    // Update url params based on pristine state
    useEffect(() => {
        if (pristineState.tableName) {
            const newParams = new URLSearchParams();
            if (pristineState.dimensions.length === 0) {
                newParams.delete('dimensions');
            } else {
                newParams.set('dimensions', pristineState.dimensions.join(','));
            }
            if (pristineState.metrics.length === 0) {
                newParams.delete('metrics');
            } else {
                newParams.set('metrics', pristineState.metrics.join(','));
            }
            if (pristineState.sorts.length === 0) {
                newParams.delete('sort');
            } else {
                newParams.set('sort', JSON.stringify(pristineState.sorts));
            }
            if (pristineState.filters.length === 0) {
                newParams.delete('filters');
            } else {
                newParams.set('filters', JSON.stringify(pristineState.filters));
            }
            newParams.set('limit', `${pristineState.limit}`);
            if (pristineState.columnOrder.length === 0) {
                newParams.delete('column_order');
            } else {
                newParams.set(
                    'column_order',
                    pristineState.columnOrder.join(','),
                );
            }
            if (pristineState.selectedTableCalculations.length === 0) {
                newParams.delete('selected_table_calculations');
            } else {
                newParams.set(
                    'selected_table_calculations',
                    pristineState.selectedTableCalculations.join(','),
                );
            }
            if (pristineState.tableCalculations.length === 0) {
                newParams.delete('table_calculations');
            } else {
                newParams.set(
                    'table_calculations',
                    JSON.stringify(pristineState.tableCalculations),
                );
            }
            history.replace({
                pathname: `/projects/${pathParams.projectUuid}/tables/${pristineState.tableName}`,
                search: newParams.toString(),
            });
        }
    }, [pristineState, history, pathParams.projectUuid]);

    useEffect(() => {
        if (!pathParams.tableId) {
            reset();
        }
    }, [pathParams.tableId, reset]);
};
