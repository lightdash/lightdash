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
} from '../features/explorer/store';
import { ExplorerSection } from '../providers/Explorer/types';
import useExplorerContext from '../providers/Explorer/useExplorerContext';

export const useFilteredFields = () => {
    const filters = useExplorerSelector(selectFilters);
    const isFiltersExpanded = useExplorerSelector(selectIsFiltersExpanded);
    const dispatch = useExplorerDispatch();

    // Get Context setFilters action for synchronization during migration
    const contextSetFilters = useExplorerContext(
        (context) => context.actions.setFilters,
    );

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
            const newFilters = addFilterRule({ filters, field, value });
            // Update both Redux and Context during migration phase
            dispatch(explorerActions.setFilters(newFilters));
            contextSetFilters(newFilters);

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
        [filters, dispatch, contextSetFilters, isFiltersExpanded],
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

    // Get Context setFilters action for synchronization during migration
    const contextSetFilters = useExplorerContext(
        (context) => context.actions.setFilters,
    );

    const setFilters = useCallback(
        (newFilters: typeof filters) => {
            // Update both Redux and Context during migration phase
            dispatch(explorerActions.setFilters(newFilters));
            contextSetFilters(newFilters);
        },
        [dispatch, contextSetFilters],
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
