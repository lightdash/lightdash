import {
    AndFilterGroup,
    AnyType,
    CartesianChartConfig,
    ChartType,
    ConditionalFormattingConfigWithSingleColor,
    CustomVisConfig,
    DashboardDAO,
    DashboardFilterRule,
    FilterGroup,
    FilterOperator,
    isFilterRuleDefinedForFieldId,
    MetricFilterRule,
    MetricType,
    removeFieldFromFilterGroup,
    RenameType,
    SavedChartDAO,
    SchedulerAndTargets,
    SchedulerFormat,
    TableChartConfig,
    ThresholdOperator,
} from '@lightdash/common';
import { cloneDeep } from 'lodash';
import {
    createRenameFactory,
    getNameChanges,
    renameAlert,
    renameChartConfigType,
    renameDashboard,
    renameDashboardScheduler,
    renameMetricQuery,
    renameSavedChart,
    validateRename,
} from './rename';
import {
    chartMocked,
    expectedRenamedChartMocked,
    fieldRename,
    tableRename,
} from './rename.mock';

describe('removeFieldFromFilterGroup', () => {
    const fieldToBeRemoved = 'metric_field_id_1';
    const filterGroup: FilterGroup = {
        id: 'metric_id_1',
        and: [
            {
                id: 'metric_uuid_1',
                target: {
                    fieldId: fieldToBeRemoved,
                },
                operator: FilterOperator.EQUALS,
                values: ['metric_value_1'],
            },
            {
                id: 'metric_id_2',
                and: [
                    {
                        id: 'metric_uuid_2',
                        target: {
                            fieldId: fieldToBeRemoved,
                        },
                        operator: FilterOperator.EQUALS,
                        values: ['metric_value_2'],
                    },
                ],
            },
        ],
    };

    it('should return empty filters', async () => {
        const updatedFieldGroup = removeFieldFromFilterGroup(
            filterGroup,
            fieldToBeRemoved,
        );
        expect(updatedFieldGroup).toEqual(undefined);
    });

    it('should return remaining filters', async () => {
        const remainingMetric = {
            id: 'metric_uuid_3',
            target: {
                fieldId: 'metric_field_id_3',
            },
            operator: FilterOperator.EQUALS,
            values: ['metric_value_3'],
        };
        const filterGroupWithRemainingMetrics = cloneDeep(filterGroup);
        (filterGroupWithRemainingMetrics.and[1] as AndFilterGroup).and.push(
            remainingMetric,
        );
        filterGroupWithRemainingMetrics.and.push(remainingMetric);
        const updatedFieldGroup = removeFieldFromFilterGroup(
            filterGroupWithRemainingMetrics,
            fieldToBeRemoved,
        );
        expect(updatedFieldGroup).toEqual({
            id: 'metric_id_1',
            and: [
                {
                    id: 'metric_id_2',
                    and: [remainingMetric],
                },
                remainingMetric,
            ],
        });
    });
});
describe('isFilterRuleDefinedForFieldId', () => {
    const fieldToBeFound1 = 'metric_field_id_1';
    const fieldToBeFound2 = 'metric_field_id_2';
    const fieldToBeFound3 = 'metric_field_id_3';

    const filterGroup: FilterGroup = {
        id: 'metric_id_1',
        and: [
            {
                id: 'metric_uuid_1',
                target: {
                    fieldId: fieldToBeFound1,
                },
                operator: FilterOperator.EQUALS,
                values: ['metric_value_1'],
            },
            {
                id: 'metric_uuid_3',
                target: {
                    fieldId: `${fieldToBeFound3}_to_be_found`,
                },
                operator: FilterOperator.EQUALS,
                values: ['metric_value_3'],
            },
            {
                id: 'metric_id_2',
                and: [
                    {
                        id: 'metric_uuid_2',
                        target: {
                            fieldId: fieldToBeFound2,
                        },
                        operator: FilterOperator.EQUALS,
                        values: ['metric_value_2'],
                    },
                ],
            },
        ],
    };

    it('should find', async () => {
        expect(
            isFilterRuleDefinedForFieldId(filterGroup, fieldToBeFound1),
        ).toEqual(true);
        expect(
            isFilterRuleDefinedForFieldId(filterGroup, fieldToBeFound2),
        ).toEqual(true);
        expect(
            isFilterRuleDefinedForFieldId(filterGroup, 'someRandomFieldId'),
        ).toEqual(false);
        expect(
            isFilterRuleDefinedForFieldId(filterGroup, fieldToBeFound3, true),
        ).toEqual(true);
        expect(
            isFilterRuleDefinedForFieldId(filterGroup, fieldToBeFound3, false),
        ).toEqual(false);
    });
});

describe('createRenametableRename', () => {
    describe('with isPrefix=true', () => {
        test('replaceId should replace prefix', () => {
            expect(tableRename.replaceId('payment_customer_id')).toBe(
                'invoice_customer_id',
            );

            // This will replace only the model "part" of the id
            // This is the reason why we can't easily do a find and replace on the entire JSON
            // And we need to replace the references separately, using different methods
            expect(tableRename.replaceId('payment_payment_id')).toBe(
                'invoice_payment_id',
            );
        });
        test('replaceId should not replace invalid prefix', () => {
            expect(tableRename.replaceId('payments_payment_id')).toBe(
                'payments_payment_id',
            );
            expect(tableRename.replaceId('other_payment_id')).toBe(
                'other_payment_id',
            );
        });

        test('replaceReference should replace references', () => {
            expect(
                tableRename.replaceReference(
                    'sql sample: ${payment.customer_id} + 1',
                ),
            ).toBe('sql sample: ${invoice.customer_id} + 1');
        });

        test('replaceReference should not replace invalid references', () => {
            expect(
                tableRename.replaceReference(
                    'tooltip sample: ${payment_customer_id} !',
                ),
            ).toBe('tooltip sample: ${payment_customer_id} !');
            expect(
                tableRename.replaceReference(
                    'Do not replace payment.customer_id',
                ),
            ).toBe('Do not replace payment.customer_id');
            expect(
                tableRename.replaceReference(
                    'Also not replace ${payments.customer_id}',
                ),
            ).toBe('Also not replace ${payments.customer_id}');
        });

        test('replaceString should replace all occurrences', () => {
            expect(
                tableRename.replaceString('payment_id and payment_name'),
            ).toBe('invoice_id and invoice_name');
        });
        test('replaceString should not replace entire string', () => {
            expect(tableRename.replaceString('payment')).toBe('payment');
        });

        test('replaceOptionalId should handle undefined', () => {
            expect(tableRename.replaceOptionalId('payment_id')).toBe(
                'invoice_id',
            );
            expect(tableRename.replaceOptionalId(undefined)).toBeUndefined();
        });

        test('replaceKeys should replace object keys', () => {
            const obj = { payment_id: 1, payment_name: 'payment_value' };
            // Do not replace values
            expect(tableRename.replaceKeys(obj)).toEqual({
                invoice_id: 1,
                invoice_name: 'payment_value',
            });
        });

        test('replaceFull should replace all occurrences of the string', () => {
            expect(tableRename.replaceFull('payment')).toBe('invoice');
        });

        test('replaceList should replace all items in a list', () => {
            expect(
                tableRename.replaceList(['payment_id', 'payment_name']),
            ).toEqual(['invoice_id', 'invoice_name']);
        });

        test('replaceOptionalList should handle undefined', () => {
            expect(tableRename.replaceOptionalList(['payment_id'])).toEqual([
                'invoice_id',
            ]);
            expect(tableRename.replaceOptionalList(undefined)).toBeUndefined();
        });
    });

    describe('with isPrefix=false', () => {
        test('replaceId should replace entire id', () => {
            expect(fieldRename.replaceId('customer_id')).toBe(
                'customer_user_id',
            );
        });
        test('replaceId should not replace invalid prefix', () => {
            expect(fieldRename.replaceId('customer_id_extra')).toBe(
                'customer_id_extra',
            ); // This is not a full ID
            expect(fieldRename.replaceId('customer.id')).toBe('customer.id'); // This is a reference, not an ID
            expect(fieldRename.replaceId('other_customer_id')).toBe(
                'other_customer_id',
            ); // shouldn't replace non-prefix
        });

        test('replaceReference should replace references', () => {
            expect(
                fieldRename.replaceReference('sql sample: ${customer.id} + 1'),
            ).toBe('sql sample: ${customer.user_id} + 1');
        });

        test('replaceReference should replace references (events)', () => {
            const otherFieldRename = createRenameFactory({
                from: 'events_in_gbp',
                to: 'events_in_currency',
                fromReference: 'events.in_gbp',
                toReference: 'events.in_currency',
                isPrefix: false,
                fromFieldName: 'in_gbp',
                toFieldName: 'in_currency',
            });

            expect(
                otherFieldRename.replaceReference('1 + ${events.in_gbp} + 1'),
            ).toBe('1 + ${events.in_currency} + 1');
        });

        test('replaceReference should not replace invalid references', () => {
            // This contains some "extra" text in the reference
            expect(
                fieldRename.replaceReference(
                    'sql sample: ${customer.id.extra} + 1',
                ),
            ).toBe('sql sample: ${customer.id.extra} + 1');

            expect(
                fieldRename.replaceReference('Do not replace customer.id'),
            ).toBe('Do not replace customer.id');
            expect(
                fieldRename.replaceReference(
                    'Also not replace ${customers.id}',
                ),
            ).toBe('Also not replace ${customers.id}');
        });

        test('replaceString should replace all occurrences', () => {
            expect(
                fieldRename.replaceString(
                    'customer_id in the customer_id field',
                ),
            ).toBe('customer_user_id in the customer_user_id field');
        });
    });
    describe('with more complex model names', () => {
        const otherTableRename = createRenameFactory({
            from: 'my_payment',
            to: 'my_invoice',
            fromReference: 'my_payment',
            toReference: 'my_invoice',
            isPrefix: true,
            fromFieldName: undefined,
            toFieldName: undefined,
        });

        test('replaceId should replace prefix', () => {
            expect(otherTableRename.replaceId('my_payment_customer_id')).toBe(
                'my_invoice_customer_id',
            );
        });
        test('replaceReference should replace references', () => {
            expect(
                otherTableRename.replaceReference(
                    'sql sample: ${my_payment.customer_id} + 1',
                ),
            ).toBe('sql sample: ${my_invoice.customer_id} + 1');
        });
    });
});

describe('renameMetricQuery', () => {
    test('should rename table prefix in metric query', () => {
        const metricQuery = {
            exploreName: 'payment',
            dimensions: ['payment_id', 'payment_date'],
            metrics: ['payment_amount'],
            filters: {
                dimensions: {
                    id: 'filter_group_id',
                    and: [
                        {
                            id: 'filter_id_1',
                            target: {
                                fieldId: 'payment_id',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['123'],
                        },
                    ],
                },
                metrics: undefined,
                tableCalculations: undefined,
            },
            tableCalculations: [
                {
                    name: 'calc',
                    sql: '${payment.amount} * 2',
                    displayName: 'Calculation',
                },
            ],
            additionalMetrics: [
                {
                    name: 'custom_metric',
                    table: 'payment',
                    sql: '${TABLE}.status',
                    type: MetricType.SUM,
                    filters: [
                        {
                            id: '954711ae-88e0-4b24-9b27-47a676597b18',
                            target: {
                                fieldRef: 'payment.status',
                            },
                            values: ['completed'],
                            operator: 'equals',
                        },
                    ] as MetricFilterRule[],
                },
            ],
            sorts: [
                {
                    fieldId: 'payment_id',
                    descending: true,
                },
            ],
            limit: 100,
        };

        const result = renameMetricQuery(metricQuery, tableRename);

        expect(result.exploreName).toBe('invoice');
        expect(result.dimensions).toEqual(['invoice_id', 'invoice_date']);
        expect(result.metrics).toEqual(['invoice_amount']);
        expect(
            (result.filters?.dimensions as AnyType).and[0].target?.fieldId,
        ).toBe('invoice_id');
        expect(result.tableCalculations[0].sql).toBe('${invoice.amount} * 2');
        expect(result.additionalMetrics?.[0].table).toBe('invoice');
        expect(result.additionalMetrics?.[0].sql).toBe('${TABLE}.status'); // Same
        expect(
            result.additionalMetrics?.[0].filters?.[0].target?.fieldRef,
        ).toBe('invoice.status');

        expect(result.sorts[0].fieldId).toBe('invoice_id');
    });

    test('should rename field in metric query', () => {
        const metricQuery = {
            exploreName: 'payment',
            dimensions: ['payment_id', 'payment_date'],
            metrics: ['payment_amount'],
            filters: {
                dimensions: {
                    id: 'filter_group_id',
                    and: [
                        {
                            id: 'filter_id_1',
                            target: {
                                fieldId: 'payment_amount',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['123'],
                        },
                    ],
                },
                metrics: undefined,
                tableCalculations: undefined,
            },
            tableCalculations: [
                {
                    name: 'calc',
                    sql: '${payment.amount} * 2',
                    displayName: 'Calculation',
                },
            ],
            additionalMetrics: [
                {
                    name: 'custom_metric',
                    table: 'payment',
                    sql: '${TABLE}.amount',
                    type: MetricType.SUM,
                    filters: [
                        {
                            id: '954711ae-88e0-4b24-9b27-47a676597b18',
                            target: {
                                fieldRef: 'payment.amount',
                            },
                            values: ['100'],
                            operator: 'greaterThan',
                        },
                    ] as MetricFilterRule[],
                },
            ],
            sorts: [
                {
                    fieldId: 'payment_amount',
                    descending: true,
                },
            ],
            limit: 100,
        };

        const otherTableRename = createRenameFactory({
            from: 'payment_amount',
            to: 'payment_cost',
            fromReference: 'payment.amount',
            toReference: 'payment.cost',
            isPrefix: false,
            fromFieldName: 'amount',
            toFieldName: 'cost',
        });
        const result = renameMetricQuery(metricQuery, otherTableRename);

        expect(result.exploreName).toBe('payment'); // same
        expect(result.dimensions).toEqual(['payment_id', 'payment_date']); // same
        expect(result.metrics).toEqual(['payment_cost']);
        expect(
            (result.filters?.dimensions as AnyType).and[0].target?.fieldId,
        ).toBe('payment_cost');
        expect(result.tableCalculations[0].sql).toBe('${payment.cost} * 2');
        expect(result.additionalMetrics?.[0].sql).toBe('${TABLE}.cost');
        expect(
            result.additionalMetrics?.[0].filters?.[0].target?.fieldRef,
        ).toBe('payment.cost');
        expect(result.sorts[0].fieldId).toBe('payment_cost');
    });
});

describe('renameChartConfigType', () => {
    test('should rename table prefix in cartesian chart config', () => {
        const chartConfig = {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'payment_date',
                    yField: ['payment_amount'],
                },
                eChartsConfig: {
                    series: [
                        {
                            type: 'bar',
                            stack: 'payment_stack',
                            encode: {
                                xRef: { field: 'payment_date' },
                                yRef: {
                                    field: 'payment_amount',
                                    pivotValues: [
                                        {
                                            field: 'payment_type',
                                            value: 'someValue',
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                    tooltip: '${payment_amount} value',
                },
                metadata: {
                    'payment_id.shipped': {
                        hidden: true,
                        color: '#000000',
                    },
                },
            },
        } as CartesianChartConfig;

        const result = renameChartConfigType(chartConfig, tableRename);

        const config = (result as CartesianChartConfig).config!;
        expect(config.layout.xField).toBe('invoice_date');
        expect(config.layout.yField).toEqual(['invoice_amount']);

        const firstSerie = config.eChartsConfig?.series?.[0]!;
        expect(firstSerie.stack).toBe('invoice_stack');
        expect(firstSerie.encode.xRef.field).toBe('invoice_date');
        expect(firstSerie.encode.yRef.field).toBe('invoice_amount');
        expect(firstSerie.encode.yRef.pivotValues?.[0].field).toBe(
            'invoice_type',
        );
        expect(config.eChartsConfig.tooltip).toBe('${invoice_amount} value');
        expect(Object.keys(config.metadata!)[0]).toBe('invoice_id.shipped');
    });

    test('should rename field in cartesian chart config', () => {
        const chartConfig = {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'payment_id',
                    yField: ['payment_id'],
                },
                eChartsConfig: {
                    series: [
                        {
                            type: 'bar',
                            stack: 'payment_id',
                            encode: {
                                xRef: { field: 'payment_id' },
                                yRef: {
                                    field: 'payment_id',
                                    pivotValues: [
                                        {
                                            field: 'payment_id',
                                            value: 'someValue',
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                    tooltip: '${payment_id} value',
                },
                metadata: {
                    'payment_id.shipped': {
                        hidden: true,
                        color: '#000000',
                    },
                },
            },
        } as CartesianChartConfig;

        const otherTableRename = createRenameFactory({
            from: 'payment_id',
            to: 'invoice_id',
            fromReference: 'payment.id',
            toReference: 'invoice.id',
            isPrefix: false,
            fromFieldName: 'id',
            toFieldName: 'id',
        });
        const result = renameChartConfigType(chartConfig, otherTableRename);

        const config = (result as CartesianChartConfig).config!;
        expect(config.layout.xField).toBe('invoice_id');
        expect(config.layout.yField).toEqual(['invoice_id']);

        const firstSerie = config.eChartsConfig?.series?.[0]!;
        expect(firstSerie.stack).toBe('invoice_id');
        expect(firstSerie.encode.xRef.field).toBe('invoice_id');
        expect(firstSerie.encode.yRef.field).toBe('invoice_id');
        expect(firstSerie.encode.yRef.pivotValues?.[0].field).toBe(
            'invoice_id',
        );
        expect(config.eChartsConfig.tooltip).toBe('${invoice_id} value');
        expect(Object.keys(config.metadata!)[0]).toBe('invoice_id.shipped');
    });

    test('should rename table prefix in table chart config', () => {
        const chartConfig = {
            type: ChartType.TABLE,
            config: {
                columns: {
                    payment_id: { visible: true },
                    payment_amount: { visible: true },
                },
                conditionalFormattings: [
                    {
                        target: {
                            fieldId: 'payment_amount',
                        },
                        color: '#000000',
                        rules: [
                            {
                                id: 'rule_id',
                                operator: FilterOperator.GREATER_THAN,
                                values: [100],
                            },
                        ],
                    } as ConditionalFormattingConfigWithSingleColor,
                ],
            },
        } as TableChartConfig;

        const result = renameChartConfigType(chartConfig, tableRename);

        const config = (result as TableChartConfig).config!;
        expect(Object.keys(config.columns!)).toEqual([
            'invoice_id',
            'invoice_amount',
        ]);
        expect((config.conditionalFormattings || [])[0].target?.fieldId).toBe(
            'invoice_amount',
        );
    });

    test('should rename table prefix in custom chart config', () => {
        const chartConfig = {
            type: ChartType.CUSTOM,
            config: {
                spec: {
                    data: { name: 'payment_data' },
                    mark: 'bar',
                    encoding: {
                        x: { field: 'payment_date' },
                    },
                },
            },
        } as CustomVisConfig;

        const result = renameChartConfigType(chartConfig, tableRename);

        const config = (result as CustomVisConfig).config!;
        expect((config.spec as AnyType).data.name).toBe('invoice_data');
        expect((config.spec?.encoding as AnyType).x.field).toBe('invoice_date');
    });
});

describe('renameSavedChart', () => {
    test('should rename mocked saved chart field', () => {
        const { updatedChart, hasChanges } = renameSavedChart({
            type: RenameType.FIELD,
            chart: chartMocked,
            nameChanges: {
                from: 'orders_status',
                to: 'orders_order_type',
                fromReference: 'orders.status',
                toReference: 'orders.order_type',
                fromFieldName: 'status',
                toFieldName: 'order_type',
            },
            validate: false,
        });

        expect(hasChanges).toBe(true);
        expect(updatedChart).toEqual(expectedRenamedChartMocked); // toEqual doesn't check extra `undefined` fields
    });

    test('should rename subscriptions saved chart model', () => {
        const { updatedChart, hasChanges } = renameSavedChart({
            type: RenameType.MODEL,
            chart: {
                ...chartMocked,

                uuid: '8ecff9f3-e197-46f9-86f0-c61aa4328685',
                projectUuid: 'a5d16d37-1360-45b5-b3f5-681fc814bc04',
                name: 'Cloud subscription status',
                description: 'Shows cloud subscriptions for each organization',
                tableName: 'stripe_subscriptions',

                metricQuery: {
                    exploreName: 'stripe_subscriptions',
                    dimensions: [
                        'stripe_subscriptions_lightdash_organization_id',
                        'organizations_organization_name',
                        'stripe_subscriptions_monthly_plan_unit_amount',
                        'stripe_subscriptions_lightdash_product_name',
                    ],
                    metrics: [],
                    filters: {},
                    sorts: [
                        {
                            fieldId:
                                'stripe_subscriptions_lightdash_organization_id',
                            descending: false,
                        },
                    ],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                    customDimensions: [],
                },
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        columns: {
                            stripe_subscriptions_lightdash_organization_id: {
                                visible: false,
                            },
                        },
                        metricsAsRows: false,
                        hideRowNumbers: false,
                        showTableNames: true,
                        showResultsTotal: false,
                        showRowCalculation: false,
                        showColumnCalculation: false,
                        conditionalFormattings: [],
                    },
                },
                tableConfig: {
                    columnOrder: [
                        'stripe_subscriptions_lightdash_organization_id',
                        'organizations_organization_name',
                        'stripe_subscriptions_monthly_plan_unit_amount',
                        'stripe_subscriptions_lightdash_product_name',
                    ],
                },
                organizationUuid: 'd413dcea-4c8f-46b6-baa5-23885490e08b',
                spaceUuid: '1ac19157-777b-41b1-8c75-f070c7cfc8e8',
                spaceName: 'Shared',
                pinnedListUuid: null,
                pinnedListOrder: null,
                dashboardUuid: null,
                dashboardName: null,
                colorPalette: ['#FF6464'],
                slug: 'cloud-subscription-status',
            },
            nameChanges: {
                from: 'stripe_subscriptions',
                to: 'subscriptions',
                fromReference: 'stripe_subscriptions',
                toReference: 'subscriptions',
                fromFieldName: undefined,
                toFieldName: undefined,
            },
            validate: false,
        });

        expect(hasChanges).toBe(true);
        expect(updatedChart.tableName).toBe('subscriptions');
        expect(updatedChart.metricQuery).toEqual({
            exploreName: 'subscriptions',
            dimensions: [
                'subscriptions_lightdash_organization_id',
                'organizations_organization_name',
                'subscriptions_monthly_plan_unit_amount',
                'subscriptions_lightdash_product_name',
            ],
            metrics: [],
            filters: {},
            sorts: [
                {
                    fieldId: 'subscriptions_lightdash_organization_id',
                    descending: false,
                },
            ],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            customDimensions: [],
        }); // toEqual doesn't check extra `undefined` fields
    });

    test('should rename mocked saved chart model', () => {
        const { updatedChart, hasChanges } = renameSavedChart({
            type: RenameType.MODEL,
            chart: {
                ...chartMocked,
                metricQuery: {
                    exploreName: 'purchases',
                    dimensions: ['purchases_type'],
                    metrics: [],
                    filters: {},
                    sorts: [{ fieldId: 'purchases_type', descending: false }],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                },
            },
            nameChanges: {
                from: 'purchases',
                to: 'orders',
                fromReference: 'purchases',
                toReference: 'orders',
                fromFieldName: undefined,
                toFieldName: undefined,
            },
            validate: false,
        });

        expect(hasChanges).toBe(true);
        expect(updatedChart.metricQuery).toEqual({
            exploreName: 'orders',
            dimensions: ['orders_type'],
            metrics: [],
            filters: {},
            sorts: [{ fieldId: 'orders_type', descending: false }],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
        }); // toEqual doesn't check extra `undefined` fields
    });

    test('should rename table prefix in saved chart', () => {
        const chart = {
            name: 'Payment Analysis',
            tableName: 'payment',
            metricQuery: {
                exploreName: 'payments',
                dimensions: ['payment_id'],
                metrics: ['payment_amount'],
                sorts: [
                    {
                        fieldId: 'payment_id',
                        descending: true,
                    },
                ],
                // TODO add filters
                filters: {
                    dimensions: {
                        id: 'e99db6ef-2ee1-48bf-8209-371a221b1edd',
                        and: [
                            {
                                id: '9adef550-95d8-4b39-a220-77d17e555101',
                                target: {
                                    fieldId: 'payment_method',
                                },
                                values: ['credit_card'],
                                operator: 'equals',
                                required: false,
                            },
                        ],
                    },
                    metrics: undefined,
                    tableCalculations: undefined,
                },
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'payment_date',
                        yField: ['payment_amount'],
                    },
                },
            },
            tableConfig: {
                columnOrder: ['payment_id', 'payment_amount'],
            },
            pivotConfig: {
                columns: ['payment_type'],
            },
        } as SavedChartDAO;

        const { updatedChart, hasChanges } = renameSavedChart({
            type: RenameType.MODEL,
            chart,
            nameChanges: {
                from: 'payment',
                fromReference: 'payment',
                to: 'invoice',
                toReference: 'invoice',
                fromFieldName: undefined,
                toFieldName: undefined,
            },
            validate: false,
        });

        expect(hasChanges).toBe(true);
        expect(updatedChart.name).toBe('Payment Analysis'); // Renamins the same
        expect(updatedChart.tableName).toBe('invoice');
        expect(updatedChart.metricQuery.dimensions).toEqual(['invoice_id']);
        expect(updatedChart.metricQuery.sorts[0].fieldId).toEqual('invoice_id');
        expect(
            (updatedChart.metricQuery.filters?.dimensions as AnyType).and[0]
                .target?.fieldId,
        ).toBe('invoice_method');

        expect(
            (updatedChart.chartConfig as CartesianChartConfig).config?.layout
                .xField,
        ).toBe('invoice_date');
        expect(updatedChart.tableConfig.columnOrder).toEqual([
            'invoice_id',
            'invoice_amount',
        ]);
        expect(updatedChart.pivotConfig?.columns).toEqual(['invoice_type']);
    });

    test('should return unchanged chart when no matches found', () => {
        const chart = {
            name: 'Payment Analysis',
            tableName: 'payment',
            metricQuery: {
                exploreName: 'payments',
                dimensions: ['payment_id'],
                metrics: ['payment_amount'],
                filters: { dimensions: {}, metrics: {}, tableCalculations: {} },
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'payment_date',
                        yField: ['payment_amount'],
                    },
                },
            },
            tableConfig: {
                columnOrder: ['payment_id', 'payment_amount'],
            },
            pivotConfig: {
                columns: ['payment_type'],
            },
        } as SavedChartDAO;

        const { updatedChart, hasChanges } = renameSavedChart({
            type: RenameType.MODEL,
            chart,
            nameChanges: {
                from: 'customer',
                fromReference: 'customer',
                to: 'user',
                toReference: 'user',
                fromFieldName: undefined,
                toFieldName: undefined,
            },
            validate: false,
        });

        expect(hasChanges).toBe(false);
        expect(updatedChart).toBe(chart); // Should be the same object reference
    });
});

describe('renameDashboard', () => {
    test('should rename fields in dashboard filters', () => {
        const dashboard = {
            name: 'Payment Dashboard',
            filters: {
                dimensions: [
                    {
                        target: {
                            fieldId: 'payment_id',
                            tableName: 'payment',
                        },
                        operator: 'equals',
                        values: ['123'],
                        tileTargets: {
                            tile1: {
                                fieldId: 'payment_id',
                                tableName: 'payment',
                            },
                        },
                    },
                ],
                metrics: [],
                tableCalculations: [],
            },
        } as unknown as DashboardDAO; // TODO fix

        const { updatedDashboard, hasChanges } = renameDashboard(
            RenameType.MODEL,
            dashboard,
            {
                from: 'payment',
                fromReference: 'payment',
                to: 'invoice',
                toReference: 'invoice',
                fromFieldName: undefined,
                toFieldName: undefined,
            },
        );

        expect(hasChanges).toBe(true);

        const dimensionFilter = updatedDashboard.filters
            .dimensions[0] as DashboardFilterRule;

        expect(dimensionFilter.target.fieldId).toBe('invoice_id');
        expect(dimensionFilter.target.tableName).toBe('invoice');
        expect((dimensionFilter.tileTargets as AnyType).tile1?.fieldId).toBe(
            'invoice_id',
        );
        expect((dimensionFilter.tileTargets as AnyType).tile1?.tableName).toBe(
            'invoice',
        );
    });

    test('should return unchanged dashboard when no matches found', () => {
        const dashboard = {
            name: 'Customer Dashboard',
            filters: {
                dimensions: [
                    {
                        target: {
                            fieldId: 'customer_id',
                            tableName: 'customer',
                        },
                    },
                ],
                metrics: [],
                tableCalculations: [],
            },
        } as unknown as DashboardDAO; // TODO fix

        const { updatedDashboard, hasChanges } = renameDashboard(
            RenameType.MODEL,
            dashboard,
            {
                from: 'payment',
                fromReference: 'payment',
                to: 'invoice',
                toReference: 'invoice',
                fromFieldName: undefined,
                toFieldName: undefined,
            },
        );

        expect(hasChanges).toBe(false);
        expect(updatedDashboard).toBe(dashboard); // Should be the same object reference
    });
});

describe('validateRename', () => {
    // Mock console methods
    const originalConsoleWarn = console.warn;

    const nameChanges = {
        from: 'payment',
        fromReference: 'payment',
        to: 'invoice',
        toReference: 'invoice',
        fromFieldName: undefined,
        toFieldName: undefined,
    };
    beforeEach(() => {
        console.warn = jest.fn();
    });

    afterEach(() => {
        console.warn = originalConsoleWarn;
    });

    test('should not log warnings when objects match after rename', () => {
        const original = { id: 'payment_123', name: 'Payment' };
        const updated = { id: 'invoice_123', name: 'Payment' };

        validateRename(original, updated, 'Test Object', 'chart', nameChanges);

        expect(console.warn).not.toHaveBeenCalled();
    });

    test('should log warnings when objects do not match after rename', () => {
        const original = { id: 'payment_123', newProperty: 'payment_123' };
        // Because we added a new property, the object is not the same
        // We want to log a warning about it
        const updated = { id: 'invoice_123', newProperty: 'payment_123' };

        validateRename(original, updated, 'Test Object', 'chart', nameChanges);

        expect(console.warn).toHaveBeenCalled();
    });
});

describe('getNameChanges', () => {
    it('should handle field rename within the same table', () => {
        const result = getNameChanges({
            from: 'payments_amount',
            to: 'payments_total',
            table: 'payments',
            type: RenameType.FIELD,
        });

        expect(result).toEqual({
            from: 'payments_amount',
            to: 'payments_total',
            fromReference: 'payments.amount',
            toReference: 'payments.total',
            fromFieldName: 'amount',
            toFieldName: 'total',
        });
    });

    it('should handle model rename', () => {
        const result = getNameChanges({
            from: 'payments',
            to: 'orders',
            table: 'payments',
            type: RenameType.MODEL,
        });

        expect(result).toEqual({
            from: 'payments',
            to: 'orders',
            fromReference: 'payments',
            toReference: 'orders',
        });
    });

    it('should handle edge case with underscore in field name', () => {
        const result = getNameChanges({
            from: 'payments_user_id',
            to: 'payments_customer_id',
            table: 'payments',
            type: RenameType.FIELD,
        });

        expect(result).toEqual({
            from: 'payments_user_id',
            to: 'payments_customer_id',
            fromReference: 'payments.user_id',
            toReference: 'payments.customer_id',
            fromFieldName: 'user_id',
            toFieldName: 'customer_id',
        });
    });

    it('should handle model rename with underscore in field name', () => {
        const result = getNameChanges({
            from: 'payments',
            to: 'orders',
            table: 'payments',
            type: RenameType.MODEL,
        });

        expect(result).toEqual({
            from: 'payments',
            to: 'orders',
            fromReference: 'payments',
            toReference: 'orders',
        });
    });
});
