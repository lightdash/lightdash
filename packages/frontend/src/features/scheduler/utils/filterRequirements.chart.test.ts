import {
    FilterOperator,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getChartSchedulerRequiredFiltersWithoutValues } from './filterRequirements';

const rule = (
    id: string,
    fieldId: string,
    values: unknown[],
    extra: Partial<FilterRule> = {},
): FilterRule => ({
    id,
    target: { fieldId },
    operator: FilterOperator.EQUALS,
    values,
    ...extra,
});

const chartFilters: Filters = {
    dimensions: {
        id: 'dimensions',
        and: [
            rule('region', 'orders_region', ['EMEA'], { required: true }),
            rule('status', 'orders_status', ['completed']),
        ],
    },
};

describe('getChartSchedulerRequiredFiltersWithoutValues', () => {
    it('is empty when the chart has no filters', () => {
        expect(
            getChartSchedulerRequiredFiltersWithoutValues(undefined, undefined),
        ).toEqual([]);
    });

    it('is empty when the required rule keeps its chart value', () => {
        expect(
            getChartSchedulerRequiredFiltersWithoutValues(chartFilters, {
                dimensions: {
                    id: 'overrides',
                    and: [rule('status', 'orders_status', ['shipped'])],
                },
            }),
        ).toEqual([]);
    });

    it('flags a required rule whose override clears its value', () => {
        const result = getChartSchedulerRequiredFiltersWithoutValues(
            chartFilters,
            {
                dimensions: {
                    id: 'overrides',
                    and: [
                        rule('region', 'orders_region', [], { disabled: true }),
                    ],
                },
            },
        );

        expect(result.map((filter) => filter.id)).toEqual(['region']);
    });

    it('ignores optional rules without values', () => {
        expect(
            getChartSchedulerRequiredFiltersWithoutValues(chartFilters, {
                dimensions: {
                    id: 'overrides',
                    and: [
                        rule('status', 'orders_status', [], { disabled: true }),
                    ],
                },
            }),
        ).toEqual([]);
    });

    it('cannot be satisfied by an override that claims to be required', () => {
        const result = getChartSchedulerRequiredFiltersWithoutValues(
            {
                dimensions: {
                    id: 'dimensions',
                    and: [
                        rule('region', 'orders_region', [], { required: true }),
                    ],
                },
            },
            {
                dimensions: {
                    id: 'overrides',
                    and: [
                        rule('extra', 'orders_status', ['x'], {
                            required: true,
                        }),
                    ],
                },
            },
        );

        expect(result.map((filter) => filter.id)).toEqual(['region']);
    });
});
