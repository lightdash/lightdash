import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { moveFilterRule } from './filterOrder';

const rule = (id: string): DashboardFilterRule => ({
    id,
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: ['done'],
});

describe('moveFilterRule', () => {
    const filters: DashboardFilters = {
        dimensions: [rule('a'), rule('b'), rule('c')],
        metrics: [rule('m1'), rule('m2')],
        tableCalculations: [],
    };

    it('moves a dimension rule to the place of another', () => {
        const next = moveFilterRule(filters, 'dimensions', 'a', 'c');

        expect(next.dimensions.map((r) => r.id)).toEqual(['b', 'c', 'a']);
        expect(next.metrics).toBe(filters.metrics);
    });

    it('moves a metric rule inside the metrics only', () => {
        const next = moveFilterRule(filters, 'metrics', 'm2', 'm1');

        expect(next.metrics.map((r) => r.id)).toEqual(['m2', 'm1']);
        expect(next.dimensions).toBe(filters.dimensions);
    });
});
