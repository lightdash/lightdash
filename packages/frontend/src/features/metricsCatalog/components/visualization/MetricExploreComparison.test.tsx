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
    it('switches comparisons using named radios from the keyboard', async () => {
        const user = userEvent.setup();
        renderWithProviders(<ControlledComparison />);
        const previousYear = screen.getByRole('radio', {
            name: 'Compare to previous year',
        });
        previousYear.focus();
        await user.keyboard(' ');
        expect(previousYear).toBeChecked();
        expect(
            screen.queryByRole('combobox', { name: 'Comparison metric' }),
        ).not.toBeInTheDocument();

        const anotherMetric = screen.getByRole('radio', {
            name: 'Compare to another metric',
        });
        anotherMetric.focus();
        await user.keyboard(' ');
        expect(anotherMetric).toBeChecked();
        expect(
            screen.getByRole('combobox', { name: 'Comparison metric' }),
        ).toBeInTheDocument();
    });

    it('keeps the metric selected when choosing a comparison metric', async () => {
        renderWithProviders(<ControlledComparison />);

        const metricSelect = screen.getByPlaceholderText('Select a metric');
        expect(metricSelect).not.toHaveAttribute('data-disabled');

        await userEvent.click(metricSelect);
        await userEvent.click(
            await screen.findByRole('option', { name: 'Total sales' }),
        );

        expect(screen.getByDisplayValue('Total sales')).toBeInTheDocument();
    });
});
