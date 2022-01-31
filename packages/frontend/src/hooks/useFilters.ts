import {
    Dimension,
    Field,
    fieldId,
    FilterOperator,
    getTotalFilterRules,
    isAndFilterGroup,
    isFilterableDimension,
} from 'common';
import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useExplorer } from '../providers/ExplorerProvider';

export const useFilters = () => {
    const {
        state: { filters },
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

    const addDefaultFilterForDimension = useCallback(
        (dimension: Dimension): void => {
            if (isFilterableDimension(dimension)) {
                setFilters({
                    ...filters,
                    dimensions: {
                        id: uuidv4(),
                        ...filters.dimensions,
                        and: [
                            ...(filters.dimensions &&
                            isAndFilterGroup(filters.dimensions)
                                ? filters.dimensions.and
                                : []),
                            {
                                id: uuidv4(),
                                target: {
                                    fieldId: fieldId(dimension),
                                },
                                operator: FilterOperator.EQUALS,
                            },
                        ],
                    },
                });
            }
        },
        [filters, setFilters],
    );

    return {
        isFilteredField,
        isFilterableDimension,
        addDefaultFilterForDimension,
    };
};
