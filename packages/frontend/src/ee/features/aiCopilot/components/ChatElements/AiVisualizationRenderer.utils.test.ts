import { AiResultType, FilterOperator, type Filters } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getVisualizationFieldsCount,
    getVisualizationFiltersCount,
    shouldDisplayMetricsAndDimensions,
    shouldDisplayVisualizationFilters,
} from './AiVisualizationRenderer.utils';

describe('AiVisualizationRenderer utils', () => {
    it('shows metric and dimension chips for switchable query result charts', () => {
        expect(
            shouldDisplayMetricsAndDimensions(AiResultType.QUERY_RESULT),
        ).toBe(true);
    });

    it('keeps legacy table result field chips hidden', () => {
        expect(
            shouldDisplayMetricsAndDimensions(AiResultType.TABLE_RESULT),
        ).toBe(false);
    });

    it('shows filters from the executed metric query', () => {
        const filters = {
            dimensions: {
                id: 'dimension-group',
                and: [
                    {
                        id: 'status-filter',
                        target: { fieldId: 'orders_status' },
                        operator: FilterOperator.EQUALS,
                        values: ['complete'],
                    },
                ],
            },
        } satisfies Filters;

        expect(shouldDisplayVisualizationFilters(filters)).toBe(true);
    });

    it('counts selected dimensions and metrics as fields', () => {
        expect(
            getVisualizationFieldsCount({
                dimensions: ['orders_order_date_month'],
                metrics: ['payments_total_revenue', 'orders_count'],
            }),
        ).toBe(3);
    });

    it('counts filter rules across filter groups', () => {
        const filters = {
            dimensions: {
                id: 'dimension-group',
                and: [
                    {
                        id: 'status-filter',
                        target: { fieldId: 'orders_status' },
                        operator: FilterOperator.EQUALS,
                        values: ['complete'],
                    },
                ],
            },
            metrics: {
                id: 'metric-group',
                and: [
                    {
                        id: 'revenue-filter',
                        target: { fieldId: 'payments_total_revenue' },
                        operator: FilterOperator.GREATER_THAN,
                        values: [100],
                    },
                ],
            },
        } satisfies Filters;

        expect(getVisualizationFiltersCount(filters)).toBe(2);
    });

    it('hides empty filters', () => {
        expect(shouldDisplayVisualizationFilters({})).toBe(false);
    });
});
