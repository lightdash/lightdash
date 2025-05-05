import {
    AndFilterGroup,
    AnyType,
    CartesianChartConfig,
    ChartType,
    ConditionalFormattingConfigWithSingleColor,
    ConditionalOperator,
    CustomVisConfig,
    DashboardDAO,
    DashboardFilterRule,
    FilterGroup,
    isFilterRuleDefinedForFieldId,
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
    renameAlert,
    renameChartConfigType,
    renameDashboard,
    renameDashboardScheduler,
    renameMetricQuery,
    renameSavedChart,
    validateRename,
} from './rename';

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
                operator: ConditionalOperator.EQUALS,
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
                        operator: ConditionalOperator.EQUALS,
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
            operator: ConditionalOperator.EQUALS,
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
                operator: ConditionalOperator.EQUALS,
                values: ['metric_value_1'],
            },
            {
                id: 'metric_uuid_3',
                target: {
                    fieldId: `${fieldToBeFound3}_to_be_found`,
                },
                operator: ConditionalOperator.EQUALS,
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
                        operator: ConditionalOperator.EQUALS,
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

describe('createRenameFactory', () => {
    describe('with isPrefix=true', () => {
        const factory = createRenameFactory(
            'payment',
            'invoice',
            'payment',
            'invoice',
            true,
        );

        test('replaceId should replace prefix', () => {
            expect(factory.replaceId('payment_customer_id')).toBe(
                'invoice_customer_id',
            );

            // This will replace only the model "part" of the id
            // This is the reason why we can't easily do a find and replace on the entire JSON
            // And we need to replace the references separately, using different methods
            expect(factory.replaceId('payment_payment_id')).toBe(
                'invoice_payment_id',
            );
        });
        test('replaceId should not replace invalid prefix', () => {
            expect(factory.replaceId('payments_payment_id')).toBe(
                'payments_payment_id',
            );
            expect(factory.replaceId('other_payment_id')).toBe(
                'other_payment_id',
            );
        });

        test('replaceReference should replace references', () => {
            expect(
                factory.replaceReference(
                    'sql sample: ${payment.customer_id} + 1',
                ),
            ).toBe('sql sample: ${invoice.customer_id} + 1');
        });

        test('replaceReference should not replace invalid references', () => {
            expect(
                factory.replaceReference(
                    'tooltip sample: ${payment_customer_id} !',
                ),
            ).toBe('tooltip sample: ${payment_customer_id} !');
            expect(
                factory.replaceReference('Do not replace payment.customer_id'),
            ).toBe('Do not replace payment.customer_id');
            expect(
                factory.replaceReference(
                    'Also not replace ${payments.customer_id}',
                ),
            ).toBe('Also not replace ${payments.customer_id}');
        });

        test('replaceString should replace all occurrences', () => {
            expect(factory.replaceString('payment_id and payment_name')).toBe(
                'invoice_id and invoice_name',
            );
        });
        test('replaceString should not replace entire string', () => {
            expect(factory.replaceString('payment')).toBe('payment');
        });

        test('replaceOptionalId should handle undefined', () => {
            expect(factory.replaceOptionalId('payment_id')).toBe('invoice_id');
            expect(factory.replaceOptionalId(undefined)).toBeUndefined();
        });

        test('replaceKeys should replace object keys', () => {
            const obj = { payment_id: 1, payment_name: 'payment_value' };
            // Do not replace values
            expect(factory.replaceKeys(obj)).toEqual({
                invoice_id: 1,
                invoice_name: 'payment_value',
            });
        });

        test('replaceFull should replace all occurrences of the string', () => {
            expect(factory.replaceFull('payment')).toBe('invoice');
        });

        test('replaceList should replace all items in a list', () => {
            expect(factory.replaceList(['payment_id', 'payment_name'])).toEqual(
                ['invoice_id', 'invoice_name'],
            );
        });

        test('replaceOptionalList should handle undefined', () => {
            expect(factory.replaceOptionalList(['payment_id'])).toEqual([
                'invoice_id',
            ]);
            expect(factory.replaceOptionalList(undefined)).toBeUndefined();
        });
    });

    describe('with isPrefix=false', () => {
        const factory = createRenameFactory(
            'customer_id',
            'client_id',
            'customer.id',
            'client.id',
            false,
        );

        test('replaceId should replace entire id', () => {
            expect(factory.replaceId('customer_id')).toBe('client_id');
        });
        test('replaceId should not replace invalid prefix', () => {
            expect(factory.replaceId('customer_id_extra')).toBe(
                'customer_id_extra',
            ); // This is not a full ID
            expect(factory.replaceId('customer.id')).toBe('customer.id'); // This is a reference, not an ID
            expect(factory.replaceId('other_customer_id')).toBe(
                'other_customer_id',
            ); // shouldn't replace non-prefix
        });

        test('replaceReference should replace references', () => {
            expect(
                factory.replaceReference('sql sample: ${customer.id} + 1'),
            ).toBe('sql sample: ${client.id} + 1');
        });

        test('replaceReference should replace references (events)', () => {
            const otherFactory = createRenameFactory(
                'events_in_gbp',
                'events_in_currency',
                'events.in_gbp',
                'events.in_currency',
                false,
            );
            expect(
                otherFactory.replaceReference('1 + ${events.in_gbp} + 1'),
            ).toBe('1 + ${events.in_currency} + 1');
        });

        test('replaceReference should not replace invalid references', () => {
            // This contains some "extra" text in the reference
            expect(
                factory.replaceReference(
                    'sql sample: ${customer.id.extra} + 1',
                ),
            ).toBe('sql sample: ${customer.id.extra} + 1');

            expect(factory.replaceReference('Do not replace customer.id')).toBe(
                'Do not replace customer.id',
            );
            expect(
                factory.replaceReference('Also not replace ${customers.id}'),
            ).toBe('Also not replace ${customers.id}');
        });

        test('replaceString should replace all occurrences', () => {
            expect(
                factory.replaceString('customer_id in the customer_id field'),
            ).toBe('client_id in the client_id field');
        });
    });
    describe('with more complex model names', () => {
        const factory = createRenameFactory(
            'my_payment',
            'my_invoice',
            'my_payment',
            'my_invoice',
            true,
        );
        test('replaceId should replace prefix', () => {
            expect(factory.replaceId('my_payment_customer_id')).toBe(
                'my_invoice_customer_id',
            );
        });
        test('replaceReference should replace references', () => {
            expect(
                factory.replaceReference(
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
                            operator: ConditionalOperator.EQUALS,
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
                    sql: '${payment.amount} / 100',
                    type: MetricType.NUMBER,
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

        const factory = createRenameFactory(
            'payment',
            'invoice',
            'payment',
            'invoice',
            true,
        );
        const result = renameMetricQuery(metricQuery, factory);

        expect(result.exploreName).toBe('invoice');
        expect(result.dimensions).toEqual(['invoice_id', 'invoice_date']);
        expect(result.metrics).toEqual(['invoice_amount']);
        expect(
            (result.filters?.dimensions as AnyType).and[0].target?.fieldId,
        ).toBe('invoice_id');
        expect(result.tableCalculations[0].sql).toBe('${invoice.amount} * 2');
        expect(result.additionalMetrics?.[0].table).toBe('invoice');
        expect(result.additionalMetrics?.[0].sql).toBe(
            '${invoice.amount} / 100',
        );
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
                            operator: ConditionalOperator.EQUALS,
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
                    sql: '${payment.amount} / 100',
                    type: MetricType.NUMBER,
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

        const factory = createRenameFactory(
            'payment_amount',
            'payment_cost',
            'payment.amount',
            'payment.cost',
            false,
        );
        const result = renameMetricQuery(metricQuery, factory);

        expect(result.exploreName).toBe('payment'); // same
        expect(result.dimensions).toEqual(['payment_id', 'payment_date']); // same
        expect(result.metrics).toEqual(['payment_cost']);
        expect(
            (result.filters?.dimensions as AnyType).and[0].target?.fieldId,
        ).toBe('payment_cost');
        expect(result.tableCalculations[0].sql).toBe('${payment.cost} * 2');
        expect(result.additionalMetrics?.[0].table).toBe('payment'); // same table
        expect(result.additionalMetrics?.[0].sql).toBe('${payment.cost} / 100');
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

        const factory = createRenameFactory(
            'payment',
            'invoice',
            'payment',
            'invoice',
            true,
        );
        const result = renameChartConfigType(chartConfig, factory);

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

        const factory = createRenameFactory(
            'payment_id',
            'invoice_id',
            'payment.id',
            'invoice.id',
            false,
        );
        const result = renameChartConfigType(chartConfig, factory);

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
                                operator: ConditionalOperator.GREATER_THAN,
                                values: [100],
                            },
                        ],
                    } as ConditionalFormattingConfigWithSingleColor,
                ],
            },
        } as TableChartConfig;

        const factory = createRenameFactory(
            'payment',
            'invoice',
            'payment',
            'invoice',
            true,
        );
        const result = renameChartConfigType(chartConfig, factory);

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

        const factory = createRenameFactory(
            'payment',
            'invoice',
            'payment',
            'invoice',
            true,
        );
        const result = renameChartConfigType(chartConfig, factory);

        const config = (result as CustomVisConfig).config!;
        expect((config.spec as AnyType).data.name).toBe('invoice_data');
        expect((config.spec?.encoding as AnyType).x.field).toBe('invoice_date');
    });
});

describe('renameSavedChart', () => {
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

        const { updatedChart, hasChanges } = renameSavedChart(
            RenameType.models,
            chart,
            {
                from: 'payment',
                fromReference: 'payment',
                to: 'invoice',
                toReference: 'invoice',
            },
        );

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

        const { updatedChart, hasChanges } = renameSavedChart(
            RenameType.models,
            chart,
            {
                from: 'customer',
                fromReference: 'customer',
                to: 'user',
                toReference: 'user',
            },
        );

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
            RenameType.models,
            dashboard,
            {
                from: 'payment',
                fromReference: 'payment',
                to: 'invoice',
                toReference: 'invoice',
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
            RenameType.models,
            dashboard,
            {
                from: 'payment',
                fromReference: 'payment',
                to: 'invoice',
                toReference: 'invoice',
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

        validateRename(original, updated, 'Test Object', nameChanges);

        expect(console.warn).not.toHaveBeenCalled();
    });

    test('should log warnings when objects do not match after rename', () => {
        const original = { id: 'payment_123', newProperty: 'payment_123' };
        // Because we added a new property, the object is not the same
        // We want to log a warning about it
        const updated = { id: 'invoice_123', newProperty: 'payment_123' };

        validateRename(original, updated, 'Test Object', nameChanges);

        expect(console.warn).toHaveBeenCalled();
    });
});
