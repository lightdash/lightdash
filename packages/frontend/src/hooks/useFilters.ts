import {
    addFilterRule,
    getItemId,
    getTotalFilterRules,
    type Field,
    type FilterableField,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import {
    explorerActions,
    selectFilters,
    selectIsFiltersExpanded,
    useExplorerDispatch,
    useExplorerSelector,
    useExplorerStore,
} from '../features/explorer/store';
import { ExplorerSection } from '../providers/Explorer/types';

/**
 * Hook that provides ONLY the addFilter function without subscribing to filter state.
 * Use this in components that need to add filters but don't need to know which fields are filtered.
 * This prevents unnecessary re-renders when filters change.
 */
export const useAddFilter = () => {
    const dispatch = useExplorerDispatch();
    const store = useExplorerStore();

    const addFilter = useCallback(
        (field: FilterableField, value: any) => {
            const currentFilters = selectFilters(store.getState());
            const newFilters = addFilterRule({
                filters: currentFilters,
                field,
                value,
            });
            dispatch(explorerActions.setFilters(newFilters));

            const isFiltersExpanded = selectIsFiltersExpanded(store.getState());
            if (!isFiltersExpanded) {
                dispatch(
                    explorerActions.toggleExpandedSection(
                        ExplorerSection.FILTERS,
                    ),
                );
            }

            window.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        },
        [dispatch, store],
    );

    return addFilter;
};

export const useFilteredFields = () => {
    const filters = useExplorerSelector(selectFilters);
    const dispatch = useExplorerDispatch();
    const store = useExplorerStore();

    const filteredFieldIds = useMemo(() => {
        const allFilterRules = getTotalFilterRules(filters);
        return new Set(allFilterRules.map((rule) => rule.target.fieldId));
    }, [filters]);

    const isFilteredField = useCallback(
        (field: Field): boolean => {
            const fieldId = getItemId(field);
            return filteredFieldIds.has(fieldId);
        },
        [filteredFieldIds],
    );

    const addFilter = useCallback(
        (field: FilterableField, value: any) => {
            const currentFilters = selectFilters(store.getState());
            const newFilters = addFilterRule({
                filters: currentFilters,
                field,
                value,
            });
            dispatch(explorerActions.setFilters(newFilters));

            const isFiltersExpanded = selectIsFiltersExpanded(store.getState());
            if (!isFiltersExpanded) {
                dispatch(
                    explorerActions.toggleExpandedSection(
                        ExplorerSection.FILTERS,
                    ),
                );
            }

            window.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        },
        [dispatch, store],
    );

    return useMemo(
        () => ({
            isFilteredField,
            addFilter,
        }),
        [isFilteredField, addFilter],
    );
};

export const useFilters = () => {
    const filters = useExplorerSelector(selectFilters);
    const dispatch = useExplorerDispatch();
    const store = useExplorerStore();

    const allFilterRules = useMemo(
        () => getTotalFilterRules(filters),
        [filters],
    );

    const isFilteredField = useCallback(
        (field: Field): boolean => {
            const fieldId = getItemId(field);
            return allFilterRules.some(
                (rule) => rule.target.fieldId === fieldId,
            );
        },
        [allFilterRules],
    );

    const addFilter = useCallback(
        (field: FilterableField, value: any) => {
            const currentFilters = selectFilters(store.getState());
            const isFiltersExpanded = selectIsFiltersExpanded(store.getState());

            const newFilters = addFilterRule({
                filters: currentFilters,
                field,
                value,
            });
            dispatch(explorerActions.setFilters(newFilters));

            if (!isFiltersExpanded) {
                dispatch(
                    explorerActions.toggleExpandedSection(
                        ExplorerSection.FILTERS,
                    ),
                );
            }

            window.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        },
        [dispatch, store],
    );

    return useMemo(
        () => ({
            isFilteredField,
            addFilter,
        }),
        [isFilteredField, addFilter],
    );
};
