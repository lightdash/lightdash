import {
    FilterOperator,
    addFilterRule,
    getFilterGroupItemsPropertyName,
    getFilterRuleFromFieldWithDefaultValue,
    getItemId,
    getItemsFromFilterGroup,
    getTotalFilterRules,
    isCustomSqlDimension,
    isDimension,
    isFilterableField,
    isTableCalculation,
    type Field,
    type FilterableField,
    type Filters,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    explorerActions,
    selectFilters,
    selectIsFiltersExpanded,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
    useExplorerStore,
} from '../features/explorer/store';
import { isMetricFlowExploreName } from '../features/metricFlow/utils/metricFlowExplore';
import { ExplorerSection } from '../providers/Explorer/types';

const canFilterField = (
    field: FilterableField,
    isMetricFlowExplore: boolean,
) => (isMetricFlowExplore ? isDimension(field) : isFilterableField(field));

const resolveFieldId = (field: Field, isMetricFlowExplore: boolean) =>
    isMetricFlowExplore ? field.name : getItemId(field);

const createMetricFlowFilterRule = (field: FilterableField, value: any) =>
    getFilterRuleFromFieldWithDefaultValue(
        field,
        {
            id: uuidv4(),
            target: { fieldId: field.name },
            operator:
                value === null ? FilterOperator.NULL : FilterOperator.EQUALS,
        },
        value ? [value] : [],
    );

const addMetricFlowFilterRule = (
    filters: Filters,
    field: FilterableField,
    value: any,
) => {
    const groupKey =
        isDimension(field) || isCustomSqlDimension(field)
            ? 'dimensions'
            : isTableCalculation(field)
              ? 'tableCalculations'
              : 'metrics';
    const group = filters[groupKey];
    const rule = createMetricFlowFilterRule(field, value);
    return {
        ...filters,
        [groupKey]: {
            id: uuidv4(),
            ...group,
            [getFilterGroupItemsPropertyName(group)]: [
                ...getItemsFromFilterGroup(group),
                rule,
            ],
        },
    };
};

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
            const state = store.getState();
            const isMetricFlowExplore = isMetricFlowExploreName(
                selectTableName(state),
            );
            if (!canFilterField(field, isMetricFlowExplore)) return;
            const currentFilters = selectFilters(state);
            const newFilters = isMetricFlowExplore
                ? addMetricFlowFilterRule(currentFilters, field, value)
                : addFilterRule({
                      filters: currentFilters,
                      field,
                      value,
                  });
            dispatch(explorerActions.setFilters(newFilters));

            const isFiltersExpanded = selectIsFiltersExpanded(state);
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
    const tableName = useExplorerSelector(selectTableName);
    const isMetricFlowExplore = isMetricFlowExploreName(tableName);

    const filteredFieldIds = useMemo(() => {
        const allFilterRules = getTotalFilterRules(filters);
        return new Set(allFilterRules.map((rule) => rule.target.fieldId));
    }, [filters]);

    const isFilteredField = useCallback(
        (field: Field): boolean => {
            const fieldId = resolveFieldId(field, isMetricFlowExplore);
            return filteredFieldIds.has(fieldId);
        },
        [filteredFieldIds, isMetricFlowExplore],
    );

    const addFilter = useCallback(
        (field: FilterableField, value: any) => {
            if (!canFilterField(field, isMetricFlowExplore)) return;
            const currentFilters = selectFilters(store.getState());
            const newFilters = isMetricFlowExplore
                ? addMetricFlowFilterRule(currentFilters, field, value)
                : addFilterRule({
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
        [dispatch, store, isMetricFlowExplore],
    );

    return useMemo(
        () => ({
            isFilteredField,
            addFilter,
            canFilterField: (field: FilterableField) =>
                canFilterField(field, isMetricFlowExplore),
        }),
        [isFilteredField, addFilter, isMetricFlowExplore],
    );
};

export const useFilters = () => {
    const filters = useExplorerSelector(selectFilters);
    const dispatch = useExplorerDispatch();
    const store = useExplorerStore();
    const tableName = useExplorerSelector(selectTableName);
    const isMetricFlowExplore = isMetricFlowExploreName(tableName);

    const allFilterRules = useMemo(
        () => getTotalFilterRules(filters),
        [filters],
    );

    const isFilteredField = useCallback(
        (field: Field): boolean => {
            const fieldId = resolveFieldId(field, isMetricFlowExplore);
            return allFilterRules.some(
                (rule) => rule.target.fieldId === fieldId,
            );
        },
        [allFilterRules, isMetricFlowExplore],
    );

    const addFilter = useCallback(
        (field: FilterableField, value: any) => {
            if (!canFilterField(field, isMetricFlowExplore)) return;
            const currentFilters = selectFilters(store.getState());
            const isFiltersExpanded = selectIsFiltersExpanded(store.getState());

            const newFilters = isMetricFlowExplore
                ? addMetricFlowFilterRule(currentFilters, field, value)
                : addFilterRule({
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
        [dispatch, store, isMetricFlowExplore],
    );

    return useMemo(
        () => ({
            isFilteredField,
            addFilter,
            canFilterField: (field: FilterableField) =>
                canFilterField(field, isMetricFlowExplore),
        }),
        [isFilteredField, addFilter, isMetricFlowExplore],
    );
};
