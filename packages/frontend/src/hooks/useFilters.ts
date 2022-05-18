import {
    addFilterRule,
    Field,
    fieldId,
    FilterableField,
    getTotalFilterRules,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useExplorer } from '../providers/ExplorerProvider';

export const useFilters = () => {
    const {
        state: {
            unsavedChartVersion: {
                metricQuery: { filters },
            },
        },
        actions: { setFilters },
    } = useExplorer();

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
        (field: FilterableField, value: any, shouldFetchResults?: boolean) =>
            setFilters(
                addFilterRule({ filters, field, value }),
                !!shouldFetchResults,
            ),
        [filters, setFilters],
    );

    return {
        isFilteredField,
        addFilter,
    };
};
