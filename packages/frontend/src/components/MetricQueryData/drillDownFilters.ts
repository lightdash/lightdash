import {
    FilterOperator,
    type DashboardFilters,
    type FilterGroupItem,
    type FilterRule,
    type Filters,
    type MetricQuery,
    type PivotReference,
    type ResultValue,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import type { TopGroupTuple } from './types';

type CombineFiltersArgs = {
    fieldValues: Record<string, ResultValue>;
    metricQuery: MetricQuery;
    pivotReference?: PivotReference;
    topGroupTuples?: TopGroupTuple[];
    dashboardFilters?: DashboardFilters;
    extraFilters?: Filters;
};

export const combineFilters = ({
    fieldValues,
    metricQuery,
    pivotReference,
    topGroupTuples,
    dashboardFilters,
    extraFilters,
}: CombineFiltersArgs): Filters => {
    const combinedDimensionFilters: Array<FilterGroupItem> = [];

    if (metricQuery.filters.dimensions) {
        combinedDimensionFilters.push(metricQuery.filters.dimensions);
    }
    if (dashboardFilters) {
        combinedDimensionFilters.push(...dashboardFilters.dimensions);
    }
    if (pivotReference?.pivotValues) {
        const hasOtherPivot = pivotReference.pivotValues.some(
            (pv) => pv.isOtherGroup,
        );

        if (hasOtherPivot && topGroupTuples?.length) {
            // Build tuple-aware exclusion: NOT((A₁ AND B₁) OR (A₂ AND B₂))
            // Via De Morgan: (NOT A₁ OR NOT B₁) AND (NOT A₂ OR NOT B₂)
            const tupleExclusions: FilterGroupItem[] = topGroupTuples.map(
                (tuple) => ({
                    id: uuidv4(),
                    or: Object.entries(tuple).map(
                        ([field, tupleValue]): FilterRule => ({
                            id: uuidv4(),
                            target: { fieldId: field },
                            operator:
                                tupleValue === null
                                    ? FilterOperator.NOT_NULL
                                    : FilterOperator.NOT_EQUALS,
                            values:
                                tupleValue === null
                                    ? undefined
                                    : [tupleValue as string],
                        }),
                    ),
                }),
            );
            combinedDimensionFilters.push(...tupleExclusions);

            // Also add non-Other pivot values as equality filters
            const nonOtherPivots = pivotReference.pivotValues.filter(
                (pv) => !pv.isOtherGroup,
            );
            combinedDimensionFilters.push(
                ...nonOtherPivots.map(
                    (pivot): FilterRule => ({
                        id: uuidv4(),
                        target: { fieldId: pivot.field },
                        operator:
                            pivot.value === null
                                ? FilterOperator.NULL
                                : FilterOperator.EQUALS,
                        values:
                            pivot.value === null ? undefined : [pivot.value],
                    }),
                ),
            );
        } else {
            const pivotFilter: FilterRule[] = pivotReference.pivotValues
                .filter((pv) => !pv.isOtherGroup)
                .map((pivot) => ({
                    id: uuidv4(),
                    target: {
                        fieldId: pivot.field,
                    },
                    operator:
                        pivot.value === null
                            ? FilterOperator.NULL
                            : FilterOperator.EQUALS,
                    values: pivot.value === null ? undefined : [pivot.value],
                }));
            combinedDimensionFilters.push(...pivotFilter);
        }
    }
    if (extraFilters?.dimensions) {
        combinedDimensionFilters.push(extraFilters.dimensions);
    }

    const dimensionFilters: FilterRule[] = metricQuery.dimensions.reduce<
        FilterRule[]
    >((acc, dimension) => {
        const rowValue = fieldValues[dimension];
        if (!rowValue) {
            return acc;
        }
        const dimensionFilter: FilterRule = {
            id: uuidv4(),
            target: {
                fieldId: dimension,
            },
            operator:
                rowValue.raw === null
                    ? FilterOperator.NULL
                    : FilterOperator.EQUALS,
            values: rowValue.raw === null ? undefined : [rowValue.raw],
        };
        return [...acc, dimensionFilter];
    }, []);
    combinedDimensionFilters.push(...dimensionFilters);

    return {
        dimensions: {
            id: uuidv4(),
            and: combinedDimensionFilters,
        },
    };
};
