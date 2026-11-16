import {
    ChartType,
    DimensionType,
    FieldType,
    OTHER_PIVOT_KEY,
    OTHER_PIVOT_LABEL,
    VizAggregationOptions,
    type PivotConfiguration,
} from '@lightdash/common';
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

            await userEvent.hover(
                screen.getByRole('img', { name: 'Results may be incorrect' }),
            );

            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                `Your query includes dimensions that are not used in the chart configuration (x-axis, y-axis, or group by): ${names}. Remove them from the query to avoid incorrect results.`,
            );
        },
    );
    it('warns that groups are left out when they exceed the column limit', async () => {
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
                resultsData={{
                    ...props.resultsData,
                    pivotDetails: {
                        totalColumnCount: 412,
                        indexColumn: undefined,
                        valuesColumns: [],
                        groupByColumns: undefined,
                        sortBy: undefined,
                        originalColumns: {},
                    },
                }}
                maxColumnLimit={200}
            />,
        );

        await userEvent.hover(
            screen.getByRole('img', { name: 'Results may be incorrect' }),
        );

        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'Results limited to 200 of 412 columns. Filter the chart or group by a field with fewer values to show all results.',
        );
    });
    describe('when the results hold an "Other" group', () => {
        const chartConfig: PivotMismatchWarningProps['chartConfig'] = {
            type: ChartType.CARTESIAN,
            config: {
                layout: { xField: 'orders_date', yField: ['orders_total'] },
                eChartsConfig: {},
            },
        };
        const resultsData: PivotMismatchWarningProps['resultsData'] = {
            ...props.resultsData,
            pivotDetails: {
                totalColumnCount: 412,
                indexColumn: undefined,
                valuesColumns: [
                    {
                        referenceField: 'orders_total',
                        pivotColumnName: `orders_total_any_${OTHER_PIVOT_KEY}`,
                        aggregation: VizAggregationOptions.ANY,
                        pivotValues: [
                            {
                                referenceField: 'orders_status',
                                value: OTHER_PIVOT_KEY,
                                formatted: OTHER_PIVOT_LABEL,
                            },
                        ],
                        isOtherGroup: true,
                    },
                ],
                groupByColumns: [{ reference: 'orders_status' }],
                sortBy: undefined,
                originalColumns: {},
            },
        };
        const pivotConfiguration: PivotConfiguration = {
            indexColumn: undefined,
            valuesColumns: [],
            groupByColumns: [{ reference: 'orders_status' }],
            sortBy: undefined,
        };

        it('says the rest are added together while the chart is stacked', async () => {
            renderWithProviders(
                <VisualizationWarning
                    {...props}
                    chartConfig={chartConfig}
                    resultsData={resultsData}
                    dirtyPivotConfiguration={{
                        ...pivotConfiguration,
                        foldOverflowGroups: true,
                    }}
                    maxColumnLimit={200}
                />,
            );

            await userEvent.hover(
                screen.getByRole('img', { name: 'Results may be incorrect' }),
            );

            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                'The first 200 are shown and the rest are added together as "Other".',
            );
        });

        it('asks for a re-run once the chart is no longer stacked', async () => {
            renderWithProviders(
                <VisualizationWarning
                    {...props}
                    chartConfig={chartConfig}
                    resultsData={resultsData}
                    dirtyPivotConfiguration={pivotConfiguration}
                    maxColumnLimit={200}
                />,
            );

            await userEvent.hover(
                screen.getByRole('img', { name: 'Results may be incorrect' }),
            );

            const tooltip = await screen.findByRole('tooltip');
            expect(tooltip).toHaveTextContent(
                'Re-run the query to update them.',
            );
            expect(tooltip).not.toHaveTextContent('are shown and the rest');
        });
    });

    it('asks for a re-run when a chart that is now stacked has results that dropped groups', async () => {
        renderWithProviders(
            <VisualizationWarning
                {...props}
                chartConfig={{
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: {
                            xField: 'orders_date',
                            yField: ['orders_total'],
                        },
                        eChartsConfig: {},
                    },
                }}
                resultsData={{
                    ...props.resultsData,
                    pivotDetails: {
                        totalColumnCount: 412,
                        indexColumn: undefined,
                        valuesColumns: [],
                        groupByColumns: [{ reference: 'orders_status' }],
                        sortBy: undefined,
                        originalColumns: {},
                    },
                }}
                dirtyPivotConfiguration={{
                    indexColumn: undefined,
                    valuesColumns: [],
                    groupByColumns: [{ reference: 'orders_status' }],
                    sortBy: undefined,
                    foldOverflowGroups: true,
                }}
                maxColumnLimit={200}
            />,
        );

        await userEvent.hover(
            screen.getByRole('img', { name: 'Results may be incorrect' }),
        );

        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'Re-run the query to add them together as "Other".',
        );
    });

    it('does not warn about the column limit when the chart has its own smaller column limit', () => {
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
                        columnLimit: 5,
                    },
                }}
                resultsData={{
                    ...props.resultsData,
                    pivotDetails: {
                        totalColumnCount: 412,
                        indexColumn: undefined,
                        valuesColumns: [],
                        groupByColumns: undefined,
                        sortBy: undefined,
                        originalColumns: {},
                    },
                }}
                maxColumnLimit={200}
            />,
        );

        expect(
            screen.queryByRole('img', { name: 'Results may be incorrect' }),
        ).not.toBeInTheDocument();
    });

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
            screen.queryByRole('img', { name: 'Results may be incorrect' }),
        ).not.toBeInTheDocument();
    });
});
