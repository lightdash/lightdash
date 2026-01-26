import {
    MetricType,
    WindowFunctionType,
    type CustomMetricBase,
    type TableCalcsSchema,
} from '@lightdash/common';
import { mockOrdersExplore } from './validationExplore.mock';
import { validateTableCalculations } from './validators';

describe('validateTableCalculations', () => {
    describe('Edge Cases', () => {
        it('should not throw for null or empty tableCalcs array', () => {
            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    null,
                    [],
                    [],
                    null,
                ),
            ).not.toThrow();

            expect(() =>
                validateTableCalculations(mockOrdersExplore, [], [], [], null),
            ).not.toThrow();
        });
    });

    describe('Basic Happy Paths', () => {
        it('should not throw for valid table calculation with selected metric', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total_revenue',
                    displayName: 'Running Total Revenue',
                    fieldId: 'orders_total_revenue',
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    [],
                    selectedMetrics,
                    null,
                ),
            ).not.toThrow();
        });

        it('should not throw for rank_in_column calculation type', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'rank_in_column',
                    name: 'revenue_rank',
                    displayName: 'Revenue Rank',
                    fieldId: 'orders_total_revenue',
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    [],
                    selectedMetrics,
                    null,
                ),
            ).not.toThrow();
        });
    });

    describe('Custom Metrics Integration', () => {
        it('should not throw when table calc references custom metric', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total_custom',
                    displayName: 'Running Total Custom',
                    fieldId: 'orders_avg_revenue',
                },
            ];

            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_revenue',
                    label: 'Average Revenue',
                    description: 'Average revenue per order',
                    table: 'orders',
                    baseDimensionName: 'order_id',
                    type: MetricType.AVERAGE,
                },
            ];

            const selectedMetrics = ['orders_avg_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    [],
                    selectedMetrics,
                    customMetrics,
                ),
            ).not.toThrow();
        });
    });

    describe('Window Functions', () => {
        it('should not throw for nullary window function without fieldId', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'window_function',
                    name: 'row_num',
                    displayName: 'Row Number',
                    windowFunction: WindowFunctionType.ROW_NUMBER,
                    fieldId: null,
                    orderBy: [
                        { fieldId: 'orders_total_revenue', order: 'desc' },
                    ],
                    partitionBy: null,
                    frame: null,
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    [],
                    selectedMetrics,
                    null,
                ),
            ).not.toThrow();
        });

        it('should not throw for window function with both partitionBy and orderBy', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'window_function',
                    name: 'sum_by_customer',
                    displayName: 'Sum by Customer',
                    windowFunction: WindowFunctionType.SUM,
                    fieldId: 'orders_total_revenue',
                    orderBy: [{ fieldId: 'orders_order_count', order: 'desc' }],
                    partitionBy: ['orders_customer_name'],
                    frame: null,
                },
            ];

            const selectedDimensions = ['orders_customer_name'];
            const selectedMetrics = [
                'orders_total_revenue',
                'orders_order_count',
            ];

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    selectedDimensions,
                    selectedMetrics,
                    null,
                ),
            ).not.toThrow();
        });

        it('should throw for unary window function missing fieldId', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'window_function',
                    name: 'sum_window',
                    displayName: 'Sum Window',
                    windowFunction: WindowFunctionType.SUM,
                    fieldId: null,
                    orderBy: null,
                    partitionBy: null,
                    frame: null,
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    [],
                    selectedMetrics,
                    null,
                ),
            ).toThrow(
                /Window function "sum_window" of type "sum" requires a fieldId/,
            );
        });
    });

    describe('Table Calc Dependencies', () => {
        it('should not throw when table calc references another table calc', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total',
                    displayName: 'Running Total',
                    fieldId: 'orders_total_revenue',
                },
                {
                    type: 'percent_change_from_previous',
                    name: 'percent_change',
                    displayName: 'Percent Change',
                    fieldId: 'running_total',
                    orderBy: [],
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    [],
                    selectedMetrics,
                    null,
                ),
            ).not.toThrow();
        });

        it('should not throw when orderBy references another table calculation', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total',
                    displayName: 'Running Total',
                    fieldId: 'orders_total_revenue',
                },
                {
                    type: 'percent_change_from_previous',
                    name: 'percent_change',
                    displayName: 'Percent Change',
                    fieldId: 'orders_order_count',
                    orderBy: [{ fieldId: 'running_total', order: 'asc' }],
                },
            ];

            const selectedMetrics = [
                'orders_total_revenue',
                'orders_order_count',
            ];

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    [],
                    selectedMetrics,
                    null,
                ),
            ).not.toThrow();
        });

        it('should throw for circular dependency between table calculations', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'calc_a',
                    displayName: 'Calc A',
                    fieldId: 'calc_b',
                },
                {
                    type: 'running_total',
                    name: 'calc_b',
                    displayName: 'Calc B',
                    fieldId: 'calc_a',
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    [],
                    selectedMetrics,
                    null,
                ),
            ).toThrow(/Circular dependency detected in table calculations/);
        });
    });

    describe('Field Validation Errors', () => {
        it('should throw when fieldId references unselected field', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total',
                    displayName: 'Running Total',
                    fieldId: 'orders_total_revenue',
                },
            ];

            const selectedMetrics = ['orders_order_count'];

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    [],
                    selectedMetrics,
                    null,
                ),
            ).toThrow(/references unselected field "orders_total_revenue"/);
        });

        it('should throw when fieldId references a dimension instead of metric', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total',
                    displayName: 'Running Total',
                    fieldId: 'orders_order_id',
                },
            ];

            const selectedMetrics = ['orders_order_id'];

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    [],
                    selectedMetrics,
                    null,
                ),
            ).toThrow(/references "orders_order_id" which is not a metric/);
        });

        it('should throw when orderBy field does not exist', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'percent_change_from_previous',
                    name: 'percent_change',
                    displayName: 'Percent Change',
                    fieldId: 'orders_total_revenue',
                    orderBy: [{ fieldId: 'non_existent_field', order: 'asc' }],
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    [],
                    selectedMetrics,
                    null,
                ),
            ).toThrow(/OrderBy field validation failed/);
        });

        it('should throw when partitionBy field does not exist', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'percent_of_column_total',
                    name: 'percent_of_total',
                    displayName: 'Percent of Total',
                    fieldId: 'orders_total_revenue',
                    partitionBy: ['non_existent_field'],
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    [],
                    selectedMetrics,
                    null,
                ),
            ).toThrow(/neither in the explore nor in the custom metrics/);
        });

        it('should throw when partitionBy field is not selected in query', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'percent_of_column_total',
                    name: 'percent_of_total',
                    displayName: 'Percent of Total',
                    fieldId: 'orders_total_revenue',
                    partitionBy: ['orders_customer_name'],
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    [], // orders_customer_name is not selected
                    selectedMetrics,
                    null,
                ),
            ).toThrow(
                /uses partitionBy field "orders_customer_name" which is not selected in the query/,
            );
        });

        it('should throw when orderBy field is not selected in query', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'percent_change_from_previous',
                    name: 'percent_change',
                    displayName: 'Percent Change',
                    fieldId: 'orders_total_revenue',
                    orderBy: [{ fieldId: 'orders_order_count', order: 'asc' }],
                },
            ];

            const selectedMetrics = ['orders_total_revenue']; // orders_order_count is not selected

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    [],
                    selectedMetrics,
                    null,
                ),
            ).toThrow(
                /uses orderBy field "orders_order_count" which is not selected in the query/,
            );
        });
    });

    describe('Type Validation Errors', () => {
        it('should throw for non-numeric metric with numeric calculation type', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'percent_change_from_previous',
                    name: 'percent_change',
                    displayName: 'Percent Change',
                    fieldId: 'orders_max_date',
                    orderBy: [],
                },
            ];

            const selectedMetrics = ['orders_max_date'];

            expect(() =>
                validateTableCalculations(
                    mockOrdersExplore,
                    tableCalcs,
                    [],
                    selectedMetrics,
                    null,
                ),
            ).toThrow(/requires a numeric metric.*has type "max"/);
        });
    });
});
