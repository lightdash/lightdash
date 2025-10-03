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

            // Read isFiltersExpanded at call time, not at callback creation time
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
    const filterIsOpen = useExplorerSelector(selectIsFiltersExpanded);
    const dispatch = useExplorerDispatch();

    const setFilters = useCallback(
        (newFilters: typeof filters) => {
            dispatch(explorerActions.setFilters(newFilters));
        },
        [dispatch],
    );

    const toggleExpandedSection = useCallback(
        (section: ExplorerSection) => {
            dispatch(explorerActions.toggleExpandedSection(section));
        },
        [dispatch],
    );

    const allFilterRules = useMemo(
        () => getTotalFilterRules(filters),
        [filters],
    );

    // Optimize isFilteredField to prevent re-renders in tree components
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
            setFilters(addFilterRule({ filters, field, value }));
            if (!filterIsOpen) toggleExpandedSection(ExplorerSection.FILTERS);

            window.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        },
        [filters, setFilters, filterIsOpen, toggleExpandedSection],
    );

    return useMemo(
        () => ({
            isFilteredField,
            addFilter,
        }),
        [isFilteredField, addFilter],
    );
};
