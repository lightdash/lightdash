/// <reference types="vitest/globals" />
import { FilterOperator } from '@lightdash/common';
import { hasSavedFiltersOverrides } from './useSavedDashboardFiltersOverrides';

const dimOverride = {
    id: 'dim-1',
    label: undefined,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: ['completed'],
};

const metricOverride = {
    id: 'metric-1',
    label: undefined,
    target: { fieldId: 'orders_total_revenue', tableName: 'orders' },
    operator: FilterOperator.GREATER_THAN,
    values: [100],
};

describe('hasSavedFiltersOverrides', () => {
    test('returns false for undefined', () => {
        expect(hasSavedFiltersOverrides(undefined)).toBe(false);
    });

    test('returns false when both dimensions and metrics are empty', () => {
        expect(
            hasSavedFiltersOverrides({
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            }),
        ).toBe(false);
    });

    test('returns true when only dimensions have overrides', () => {
        expect(
            hasSavedFiltersOverrides({
                dimensions: [dimOverride],
                metrics: [],
                tableCalculations: [],
            }),
        ).toBe(true);
    });

    test('returns true when only metrics have overrides', () => {
        expect(
            hasSavedFiltersOverrides({
                dimensions: [],
                metrics: [metricOverride],
                tableCalculations: [],
            }),
        ).toBe(true);
    });

    test('returns true when both have overrides', () => {
        expect(
            hasSavedFiltersOverrides({
                dimensions: [dimOverride],
                metrics: [metricOverride],
                tableCalculations: [],
            }),
        ).toBe(true);
    });
});
