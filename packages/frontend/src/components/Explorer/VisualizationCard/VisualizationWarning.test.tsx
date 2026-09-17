import { ChartType, DimensionType, FieldType } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import VisualizationWarning, {
    type PivotMismatchWarningProps,
} from './VisualizationWarning';

const props: PivotMismatchWarningProps = {
    dirtyPivotConfiguration: undefined,
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: { xField: 'orders_date', yField: ['orders_total'] },
            eChartsConfig: {},
        },
    },
    resultsData: {
        isFetchingRows: false,
        isInitialLoading: false,
        isFetchingFirstPage: false,
        pivotDetails: undefined,
        metricQuery: {
            exploreName: 'orders',
            dimensions: ['orders_date', 'orders_status'],
            metrics: ['orders_total'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        },
        fields: {
            orders_status: {
                fieldType: FieldType.DIMENSION,
                type: DimensionType.STRING,
                name: 'status',
                label: 'Status',
                table: 'orders',
                tableLabel: 'Orders',
                sql: '${TABLE}.status',
                hidden: false,
            },
        },
    },
    isLoading: false,
    maxColumnLimit: undefined,
};

describe('VisualizationWarning', () => {
    it.each([
        {
            dimensions: ['orders_date', 'orders_status'],
            names: '"Orders Status"',
        },
        {
            dimensions: ['orders_date', 'orders_status', 'orders_region'],
            names: '"Orders Status", "orders_region"',
        },
    ])(
        'identifies all unused dimensions with labels or field IDs: $names',
        async ({ dimensions, names }) => {
            renderWithProviders(
                <VisualizationWarning
                    {...props}
                    resultsData={{
                        ...props.resultsData,
                        metricQuery: {
                            ...props.resultsData.metricQuery!,
                            dimensions,
                        },
                    }}
                />,
            );

            await userEvent.hover(screen.getByText('Results may be incorrect'));

            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                `Your query includes dimensions that are not used in the chart configuration (x-axis, y-axis, or group by): ${names}. Remove them from the query to avoid incorrect results.`,
            );
        },
    );
    it('does not warn when every dimension is used', () => {
        renderWithProviders(
            <VisualizationWarning
                {...props}
                chartConfig={{
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: {
                            xField: 'orders_date',
                            yField: ['orders_status'],
                        },
                        eChartsConfig: {},
                    },
                }}
            />,
        );

        expect(
            screen.queryByText('Results may be incorrect'),
        ).not.toBeInTheDocument();
    });
});
