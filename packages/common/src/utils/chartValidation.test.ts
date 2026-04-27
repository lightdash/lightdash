import { TableCalculationType } from '../types/field';
import { ChartType, type ChartConfig } from '../types/savedCharts';
import { getUnusedDimensions } from './chartValidation';

const cartesianChartConfig = (
    layout: Record<string, unknown>,
): ChartConfig['config'] =>
    ({
        layout,
    }) as ChartConfig['config'];

describe('chartValidation', () => {
    describe('getUnusedDimensions', () => {
        test('treats dimensions referenced by a chart-used table calculation as used', () => {
            const { unusedDimensions } = getUnusedDimensions({
                chartType: ChartType.CARTESIAN,
                chartConfig: cartesianChartConfig({
                    xField: 'customer_label',
                    yField: ['orders_total_order_amount'],
                }),
                pivotDimensions: ['orders_order_date_week'],
                queryDimensions: [
                    'customers_first_name',
                    'customers_last_name',
                    'orders_order_date_week',
                    'customers_email',
                ],
                queryTableCalculations: [
                    {
                        name: 'customer_label',
                        displayName: 'Customer label',
                        type: TableCalculationType.STRING,
                        sql: "${customers.first_name} || ' ' || ${customers.last_name}",
                    },
                ],
            });

            expect(unusedDimensions).toEqual(['customers_email']);
        });

        test('does not count dimensions from table calculations that are not used by the chart', () => {
            const { unusedDimensions } = getUnusedDimensions({
                chartType: ChartType.CARTESIAN,
                chartConfig: cartesianChartConfig({
                    xField: 'orders_order_date_week',
                    yField: ['orders_total_order_amount'],
                }),
                pivotDimensions: [],
                queryDimensions: [
                    'orders_order_date_week',
                    'customers_first_name',
                ],
                queryTableCalculations: [
                    {
                        name: 'customer_label',
                        displayName: 'Customer label',
                        type: TableCalculationType.STRING,
                        sql: '${customers.first_name}',
                    },
                ],
            });

            expect(unusedDimensions).toEqual(['customers_first_name']);
        });
    });
});
