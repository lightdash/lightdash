import {
    addFilterRule,
    Field,
    fieldId,
    FilterableField,
    getTotalFilterRules,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { Context, ExplorerSection } from '../providers/ExplorerProvider';

export const useFilters = () => {
    const expandedSections = useContextSelector(
        Context,
        (context) => context!.state.expandedSections,
    );
    const filters = useContextSelector(
        Context,
        (context) => context!.state.unsavedChartVersion.metricQuery.filters,
    );
    const setFilters = useContextSelector(
        Context,
        (context) => context!.actions.setFilters,
    );
    const toggleExpandedSection = useContextSelector(
        Context,
        (context) => context!.actions.toggleExpandedSection,
    );
    const filterIsOpen = expandedSections.includes(ExplorerSection.FILTERS);

    const allFilterRules = useMemo(
        () => getTotalFilterRules(filters),
        [filters],
    );

    const isFilteredField = useCallback(
        (field: Field): boolean =>
            !!allFilterRules.find(
                (rule) => rule.target.fieldId === fieldId(field),
            ),
        [allFilterRules],
    );

    const addFilter = useCallback(
        (field: FilterableField, value: any, shouldFetchResults?: boolean) => {
            setFilters(
                addFilterRule({ filters, field, value }),
                !!shouldFetchResults,
            );
            if (!filterIsOpen) toggleExpandedSection(ExplorerSection.FILTERS);

            window.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        },
        [filters, setFilters, filterIsOpen, toggleExpandedSection],
    );

    return {
        isFilteredField,
        addFilter,
    };
};
