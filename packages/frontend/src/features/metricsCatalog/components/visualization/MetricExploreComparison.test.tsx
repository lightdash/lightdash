import {
    FieldType,
    MetricExplorerComparison,
    MetricType,
    TimeFrames,
    type MetricExplorerQuery,
    type MetricWithAssociatedTimeDimension,
} from '@lightdash/common';
import { type UseQueryResult } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { MetricExploreComparison } from './MetricExploreComparison';

const comparisonMetric = {
    table: 'orders',
    tableLabel: 'Orders',
    name: 'total_sales',
    label: 'Total sales',
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    sql: '${TABLE}.amount',
    timeDimension: {
        table: 'orders',
        field: 'order_date',
        interval: TimeFrames.WEEK,
    },
} as MetricWithAssociatedTimeDimension;

const metricsQuery = {
    data: [comparisonMetric],
    isLoading: false,
    isSuccess: true,
} as UseQueryResult<MetricWithAssociatedTimeDimension[], unknown>;

const ControlledComparison = () => {
    const [query, setQuery] = useState<MetricExplorerQuery>({
        comparison: MetricExplorerComparison.DIFFERENT_METRIC,
        metric: { table: '', name: '', label: '' },
    });

    return (
        <MetricExploreComparison
            baseMetricLabel="Order count"
            query={query}
            onQueryChange={setQuery}
            metricsWithTimeDimensionsQuery={metricsQuery}
        />
    );
};

describe('MetricExploreComparison', () => {
    it('keeps the metric selected when choosing a comparison metric', async () => {
        renderWithProviders(<ControlledComparison />);

        await userEvent.click(screen.getByPlaceholderText('Select a metric'));
        await userEvent.click(
            await screen.findByRole('option', { name: 'Total sales' }),
        );

        expect(screen.getByDisplayValue('Total sales')).toBeInTheDocument();
    });
});
