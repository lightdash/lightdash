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
                setState({
                    tableName: pathParams.tableId,
                    dimensions,
                    metrics,
                    filters,
                    sorts,
                    limit,
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
            history.replace({
                pathname: `/tables/${state.tableName}`,
                search: newParams.toString(),
            });
        } else {
            history.push({
                pathname: `/tables`,
            });
        }
    }, [state, history]);
};
