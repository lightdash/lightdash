import {
    addFilterRule,
    Field,
    fieldId,
    FilterableField,
    getTotalFilterRules,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { ExplorerSection, useExplorer } from '../providers/ExplorerProvider';

export const useFilters = () => {
    const {
        state: {
            expandedSections,
            unsavedChartVersion: {
                metricQuery: { filters },
            },
        },
        actions: { setFilters, toggleExpandedSection },
    } = useExplorer();
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
        },
        [filters, setFilters, filterIsOpen, toggleExpandedSection],
    );

    return {
        isFilteredField,
        addFilter,
    };
};
