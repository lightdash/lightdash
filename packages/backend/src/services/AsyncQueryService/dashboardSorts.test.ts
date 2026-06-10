import {
    CustomDimensionType,
    DimensionType,
    MetricType,
} from '@lightdash/common';
import { getValidatedDashboardSorts } from './dashboardSorts';

describe('getValidatedDashboardSorts', () => {
    it('drops dashboard sorts that are not in the chart metric query', () => {
        expect(
            getValidatedDashboardSorts(
                [
                    {
                        fieldId: 'payments_payment_method',
                        descending: false,
                    },
                    {
                        fieldId: 'payments_payment_method" DESC --',
                        descending: false,
                    },
                ],
                {
                    exploreName: 'payments',
                    dimensions: ['payments_payment_method'],
                    metrics: ['payments_total_revenue'],
                    filters: {},
                    sorts: [],
                    limit: 10,
                    tableCalculations: [],
                },
            ),
        ).toEqual([
            {
                fieldId: 'payments_payment_method',
                descending: false,
            },
        ]);
    });

    it('drops custom fields that are defined but not selected', () => {
        expect(
            getValidatedDashboardSorts(
                [
                    {
                        fieldId: 'payments_unselected_custom_dimension',
                        descending: false,
                    },
                    {
                        fieldId: 'payments_unselected_custom_metric',
                        descending: true,
                    },
                ],
                {
                    exploreName: 'payments',
                    dimensions: ['payments_payment_method'],
                    metrics: ['payments_total_revenue'],
                    filters: {},
                    sorts: [],
                    limit: 10,
                    tableCalculations: [],
                    customDimensions: [
                        {
                            id: 'payments_unselected_custom_dimension',
                            name: 'unselected_custom_dimension',
                            table: 'payments',
                            type: CustomDimensionType.SQL,
                            sql: '${TABLE}.unselected_custom_dimension',
                            dimensionType: DimensionType.STRING,
                        },
                    ],
                    additionalMetrics: [
                        {
                            name: 'unselected_custom_metric',
                            table: 'payments',
                            type: MetricType.SUM,
                            sql: '${TABLE}.unselected_custom_metric',
                        },
                    ],
                },
            ),
        ).toBeUndefined();
    });

    it('keeps sort fields that are selected for the query but hidden in the chart', () => {
        expect(
            getValidatedDashboardSorts(
                [
                    {
                        fieldId: 'orders_total_order_amount',
                        descending: true,
                    },
                ],
                {
                    exploreName: 'orders',
                    dimensions: [
                        'customers_customer_id',
                        'orders_is_completed',
                    ],
                    metrics: [
                        'orders_total_order_amount',
                        'orders_unique_order_count',
                    ],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                },
            ),
        ).toEqual([
            {
                fieldId: 'orders_total_order_amount',
                descending: true,
            },
        ]);
    });
});
