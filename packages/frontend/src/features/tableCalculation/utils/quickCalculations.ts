import { DimensionType, type Field, type MetricQuery } from '@lightdash/common';

export enum QuickCalculationType {
    PercentChangeFromPrevious = 'percent_change_from_previous',
    PercentOfPrevious = 'percent_of_previous',
    PercentOfColumnTotal = 'percent_of_column_total',
    RankInColumn = 'rank_in_column',
    RunningTotal = 'running_total',
}

interface CompiledQuickCalculation {
    sql: string;
}

interface QuickCalculationDefinition {
    label: string;
    description: string;

    /** Which dimension types this quick calculation can be used with. Literal '*' means "any" */
    guard: DimensionType[] | '*';

    /** Function responsible for generating the quick calculation for a field */
    generateQuickCalculation?: (generatorArgs: {
        item: Field;
        metricQuery: MetricQuery;
        warehouseType: string;
    }) => CompiledQuickCalculation;
}

/**
 * Outlines available quick calculations, and how they're used.
 */
export const quickCalculations: {
    [key in QuickCalculationType]: QuickCalculationDefinition;
} = {
    [QuickCalculationType.PercentChangeFromPrevious]: {
        label: 'Percent change from previous',
        description:
            'Calculates percentage change from a value versus the previous row',
        guard: [DimensionType.NUMBER],
    },
    [QuickCalculationType.PercentOfPrevious]: {
        label: 'Percent of previous',
        description:
            'Calculates the percentage of a value compared to the value in the row above it',
        guard: [DimensionType.NUMBER],
    },
    [QuickCalculationType.PercentOfColumnTotal]: {
        label: 'Percent of column total',
        description:
            'Calculates contribution percentage of a row to the column total',
        guard: [DimensionType.NUMBER],
    },
    [QuickCalculationType.RankInColumn]: {
        label: 'Rank in column',
        description:
            'Calculates the rank of the row value compared to all of the values in the column. By default, the smallest value has the lowest rank',
        guard: '*',
    },
    [QuickCalculationType.RunningTotal]: {
        label: 'Running total',
        description:
            'Calculates the running total of all of the values in the column',
        guard: [DimensionType.NUMBER],
    },
} as const;

/**
 * @example 'Running total of My Field'
 */
export const getQuickCalculationFieldName = (
    qcType: QuickCalculationType,
    fieldName: string,
) => `${quickCalculations[qcType].label} of ${fieldName}`;

/**
 * Filters the available list of quick calculations to a given dimension type,
 * and converts it into a more convenient intermediate list.
 */
export const quickCalculationTypesForDimensionType = (
    dimensionType: DimensionType,
): (QuickCalculationDefinition & {
    quickCalculationType: QuickCalculationType;
})[] =>
    Object.entries(quickCalculations)
        .filter(
            ([_qcType, { guard }]) =>
                guard === '*' || guard.includes(dimensionType),
        )
        .map(([qcType, def]) => ({
            ...def,
            quickCalculationType: qcType as QuickCalculationType,
        }));
