import {
    addFilterRule,
    getItemId,
    getTotalFilterRules,
    type Field,
    type FilterableField,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { ExplorerSection } from '../providers/Explorer/types';
import useExplorerContext from '../providers/Explorer/useExplorerContext';

export const useFilters = () => {
    const expandedSections = useExplorerContext(
        (context) => context.state.expandedSections,
    );
    const filters = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.filters,
    );
    const setFilters = useExplorerContext(
        (context) => context.actions.setFilters,
    );
    const toggleExpandedSection = useExplorerContext(
        (context) => context.actions.toggleExpandedSection,
    );
    const filterIsOpen = expandedSections.includes(ExplorerSection.FILTERS);

    const allFilterRules = useMemo(
        () => getTotalFilterRules(filters),
        [filters],
    );

    const isFilteredField = useCallback(
        (field: Field): boolean =>
            !!allFilterRules.find(
                (rule) => rule.target.fieldId === getItemId(field),
            ),
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
