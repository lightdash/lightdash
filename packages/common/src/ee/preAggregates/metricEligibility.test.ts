import { getParameterReferencesFromSqlAndFormat } from '../../compiler/parameters';
import type { CompiledTable } from '../../types/explore';
import {
    DimensionType,
    FieldType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
} from '../../types/field';
import { FilterOperator } from '../../types/filter';
import { getItemId } from '../../utils/item';
import { PreAggregateDerivedDimensionIneligibilityReason } from './dimensionEligibility';
import {
    analyzePreAggregateDerivedMetricEligibility,
    PreAggregateDerivedMetricIneligibilityReason,
} from './metricEligibility';

const makeDimension = (
    overrides: Partial<CompiledDimension> & Pick<CompiledDimension, 'name'>,
): CompiledDimension => ({
    ...overrides,
    fieldType: FieldType.DIMENSION,
    type: DimensionType.NUMBER,
    name: overrides.name,
    label: overrides.label ?? overrides.name,
    table: overrides.table ?? 'orders',
    tableLabel: overrides.tableLabel ?? 'Orders',
    sql: overrides.sql ?? '${TABLE}.amount',
    compiledSql: overrides.compiledSql ?? overrides.sql ?? '"orders".amount',
    parameterReferences:
        overrides.parameterReferences ??
        getParameterReferencesFromSqlAndFormat(
            overrides.sql ?? '${TABLE}.amount',
        ),
    tablesReferences: overrides.tablesReferences ?? ['orders'],
    hidden: overrides.hidden ?? false,
});

const makeMetric = (
    overrides: Partial<CompiledMetric> & Pick<CompiledMetric, 'name' | 'type'>,
): CompiledMetric => ({
    ...overrides,
    fieldType: FieldType.METRIC,
    type: overrides.type,
    name: overrides.name,
    label: overrides.label ?? overrides.name,
    table: overrides.table ?? 'orders',
    tableLabel: overrides.tableLabel ?? 'Orders',
    sql: overrides.sql ?? 'sum(${TABLE}.amount)',
    compiledSql:
        overrides.compiledSql ?? overrides.sql ?? 'SUM("orders".amount)',
    parameterReferences:
        overrides.parameterReferences ??
        getParameterReferencesFromSqlAndFormat(
            overrides.sql ?? 'sum(${TABLE}.amount)',
        ),
    tablesReferences: overrides.tablesReferences ?? ['orders'],
    hidden: overrides.hidden ?? false,
});

const makeTables = ({
    dimensions,
    metrics,
}: {
    dimensions: CompiledDimension[];
    metrics: CompiledMetric[];
}): Record<
    string,
    Pick<CompiledTable, 'name' | 'originalName' | 'dimensions' | 'metrics'>
> =>
    [...dimensions, ...metrics].reduce<
        Record<
            string,
            Pick<
                CompiledTable,
                'name' | 'originalName' | 'dimensions' | 'metrics'
            >
        >
    >((acc, field) => {
        acc[field.table] = acc[field.table] ?? {
            name: field.table,
            originalName: field.table === 'cstmr' ? 'customers' : undefined,
            dimensions: {},
            metrics: {},
        };

        if (field.fieldType === FieldType.DIMENSION) {
            acc[field.table].dimensions[field.name] = field;
        } else {
            acc[field.table].metrics[field.name] = field;
        }

        return acc;
    }, {});

describe('analyzePreAggregateDerivedMetricEligibility', () => {
    it('classifies a custom sql metric over eligible dimensions as eligible', () => {
        const amount = makeDimension({
            name: 'amount',
            sql: '${TABLE}.amount',
            compiledSql: '"orders".amount',
        });
        const shippingCost = makeDimension({
            name: 'shipping_cost',
            sql: '${TABLE}.shipping_cost',
            compiledSql: '"orders".shipping_cost',
        });
        const totalValue = makeMetric({
            name: 'total_value',
            type: MetricType.SUM,
            sql: '${amount} + ${shipping_cost}',
            compiledSql: 'SUM("orders".amount + "orders".shipping_cost)',
        });

        expect(
            analyzePreAggregateDerivedMetricEligibility({
                metric: totalValue,
                tables: makeTables({
                    dimensions: [amount, shippingCost],
                    metrics: [totalValue],
                }),
            }),
        ).toEqual({
            isEligible: true,
            referencedDimensionFieldIds: [
                getItemId(amount),
                getItemId(shippingCost),
            ],
            referencedMetricFieldIds: [getItemId(totalValue)],
        });
    });

    it('classifies a metric with recursive metric dependencies as eligible when all dependencies are safe', () => {
        const amount = makeDimension({
            name: 'amount',
            sql: '${TABLE}.amount',
            compiledSql: '"orders".amount',
        });
        const orderValue = makeMetric({
            name: 'order_value',
            type: MetricType.SUM,
            sql: '${amount}',
            compiledSql: 'SUM("orders".amount)',
        });
        const doubledOrderValue = makeMetric({
            name: 'doubled_order_value',
            type: MetricType.NUMBER,
            sql: '${order_value} * 2',
            compiledSql: '(SUM("orders".amount)) * 2',
        });

        expect(
            analyzePreAggregateDerivedMetricEligibility({
                metric: doubledOrderValue,
                tables: makeTables({
                    dimensions: [amount],
                    metrics: [orderValue, doubledOrderValue],
                }),
            }),
        ).toEqual({
            isEligible: true,
            referencedDimensionFieldIds: [getItemId(amount)],
            referencedMetricFieldIds: [
                getItemId(doubledOrderValue),
                getItemId(orderValue),
            ],
        });
    });

    it('resolves metric references through a joined table original name', () => {
        const customerFirstName = makeDimension({
            name: 'first_name',
            table: 'cstmr',
            sql: '${TABLE}.first_name',
            compiledSql: '"customers".first_name',
        });
        const customerNameCount = makeMetric({
            name: 'customer_name_count',
            table: 'orders',
            type: MetricType.COUNT,
            sql: '${customers.first_name}',
            compiledSql: 'COUNT("customers".first_name)',
        });

        expect(
            analyzePreAggregateDerivedMetricEligibility({
                metric: customerNameCount,
                tables: makeTables({
                    dimensions: [customerFirstName],
                    metrics: [customerNameCount],
                }),
            }),
        ).toEqual({
            isEligible: true,
            referencedDimensionFieldIds: [getItemId(customerFirstName)],
            referencedMetricFieldIds: [getItemId(customerNameCount)],
        });
    });

    it('rejects when a metric references a parameter directly', () => {
        const regionAwareRevenue = makeMetric({
            name: 'region_aware_revenue',
            type: MetricType.SUM,
            sql: `
                CASE
                    WHEN \${lightdash.parameters.orders.region} = 'EMEA' THEN \${TABLE}.amount
                    ELSE 0
                END
            `,
            parameterReferences: ['orders.region'],
        });

        expect(
            analyzePreAggregateDerivedMetricEligibility({
                metric: regionAwareRevenue,
                tables: makeTables({
                    dimensions: [],
                    metrics: [regionAwareRevenue],
                }),
            }),
        ).toEqual({
            isEligible: false,
            reason: PreAggregateDerivedMetricIneligibilityReason.PARAMETER_REFERENCES,
            ineligibleMetricFieldId: getItemId(regionAwareRevenue),
            referencedDimensionFieldIds: [],
            referencedMetricFieldIds: [getItemId(regionAwareRevenue)],
        });
    });

    it('rejects when a metric sql contains a direct user attribute reference', () => {
        const regionAwareRevenue = makeMetric({
            name: 'region_aware_revenue',
            type: MetricType.SUM,
            sql: `
                CASE
                    WHEN \${lightdash.attributes.region} = 'EMEA' THEN \${TABLE}.amount
                    ELSE 0
                END
            `,
        });

        expect(
            analyzePreAggregateDerivedMetricEligibility({
                metric: regionAwareRevenue,
                tables: makeTables({
                    dimensions: [],
                    metrics: [regionAwareRevenue],
                }),
            }),
        ).toEqual({
            isEligible: false,
            reason: PreAggregateDerivedMetricIneligibilityReason.USER_ATTRIBUTES,
            ineligibleMetricFieldId: getItemId(regionAwareRevenue),
            referencedDimensionFieldIds: [],
            referencedMetricFieldIds: [getItemId(regionAwareRevenue)],
        });
    });

    it('rejects when a metric sql contains a direct intrinsic user reference', () => {
        const emailAwareRevenue = makeMetric({
            name: 'email_aware_revenue',
            type: MetricType.SUM,
            sql: `
                CASE
                    WHEN \${ld.user.email} IS NOT NULL THEN \${TABLE}.amount
                    ELSE 0
                END
            `,
        });

        expect(
            analyzePreAggregateDerivedMetricEligibility({
                metric: emailAwareRevenue,
                tables: makeTables({
                    dimensions: [],
                    metrics: [emailAwareRevenue],
                }),
            }),
        ).toEqual({
            isEligible: false,
            reason: PreAggregateDerivedMetricIneligibilityReason.USER_ATTRIBUTES,
            ineligibleMetricFieldId: getItemId(emailAwareRevenue),
            referencedDimensionFieldIds: [],
            referencedMetricFieldIds: [getItemId(emailAwareRevenue)],
        });
    });

    it('rejects when a referenced dimension is ineligible', () => {
        const parameterizedAmount = makeDimension({
            name: 'parameterized_amount',
            sql: `
                CASE
                    WHEN \${lightdash.parameters.orders.region} = 'EMEA' THEN \${TABLE}.amount
                    ELSE NULL
                END
            `,
            parameterReferences: ['orders.region'],
        });
        const revenue = makeMetric({
            name: 'revenue',
            type: MetricType.SUM,
            sql: '${parameterized_amount}',
            compiledSql: 'SUM(CASE WHEN ... END)',
        });

        expect(
            analyzePreAggregateDerivedMetricEligibility({
                metric: revenue,
                tables: makeTables({
                    dimensions: [parameterizedAmount],
                    metrics: [revenue],
                }),
            }),
        ).toEqual({
            isEligible: false,
            reason: PreAggregateDerivedMetricIneligibilityReason.DIMENSION_DEPENDENCY_INELIGIBLE,
            ineligibleMetricFieldId: getItemId(revenue),
            ineligibleDimensionFieldId: getItemId(parameterizedAmount),
            ineligibleDimensionReason:
                PreAggregateDerivedDimensionIneligibilityReason.PARAMETER_REFERENCES,
            referencedDimensionFieldIds: [getItemId(parameterizedAmount)],
            referencedMetricFieldIds: [getItemId(revenue)],
        });
    });

    it('rejects when a recursive metric dependency is ineligible', () => {
        const parameterizedRevenue = makeMetric({
            name: 'parameterized_revenue',
            type: MetricType.SUM,
            sql: `
                CASE
                    WHEN \${lightdash.parameters.orders.region} = 'EMEA' THEN \${TABLE}.amount
                    ELSE 0
                END
            `,
            parameterReferences: ['orders.region'],
        });
        const doubledRevenue = makeMetric({
            name: 'doubled_revenue',
            type: MetricType.NUMBER,
            sql: '${parameterized_revenue} * 2',
        });

        expect(
            analyzePreAggregateDerivedMetricEligibility({
                metric: doubledRevenue,
                tables: makeTables({
                    dimensions: [],
                    metrics: [parameterizedRevenue, doubledRevenue],
                }),
            }),
        ).toEqual({
            isEligible: false,
            reason: PreAggregateDerivedMetricIneligibilityReason.METRIC_DEPENDENCY_INELIGIBLE,
            ineligibleMetricFieldId: getItemId(parameterizedRevenue),
            referencedDimensionFieldIds: [],
            referencedMetricFieldIds: [
                getItemId(doubledRevenue),
                getItemId(parameterizedRevenue),
            ],
        });
    });

    it('rejects when a metric filter references an ineligible dimension', () => {
        const amount = makeDimension({
            name: 'amount',
            sql: '${TABLE}.amount',
            compiledSql: '"orders".amount',
        });
        const parameterizedStatus = makeDimension({
            name: 'parameterized_status',
            sql: `
                CASE
                    WHEN \${lightdash.parameters.orders.region} = 'EMEA' THEN \${TABLE}.status
                    ELSE NULL
                END
            `,
            parameterReferences: ['orders.region'],
        });
        const filteredRevenue = makeMetric({
            name: 'filtered_revenue',
            type: MetricType.SUM,
            sql: '${amount}',
            compiledSql: 'SUM("orders".amount)',
            filters: [
                {
                    id: 'metric-filter',
                    target: {
                        fieldRef: 'parameterized_status',
                    },
                    operator: FilterOperator.EQUALS,
                    values: ['completed'],
                },
            ],
        });

        expect(
            analyzePreAggregateDerivedMetricEligibility({
                metric: filteredRevenue,
                tables: makeTables({
                    dimensions: [amount, parameterizedStatus],
                    metrics: [filteredRevenue],
                }),
            }),
        ).toEqual({
            isEligible: false,
            reason: PreAggregateDerivedMetricIneligibilityReason.FILTER_DIMENSION_INELIGIBLE,
            ineligibleMetricFieldId: getItemId(filteredRevenue),
            ineligibleDimensionFieldId: getItemId(parameterizedStatus),
            ineligibleDimensionReason:
                PreAggregateDerivedDimensionIneligibilityReason.PARAMETER_REFERENCES,
            referencedDimensionFieldIds: [
                getItemId(amount),
                getItemId(parameterizedStatus),
            ],
            referencedMetricFieldIds: [getItemId(filteredRevenue)],
        });
    });

    it('resolves metric filter dimensions case-insensitively', () => {
        const orderDateDay = makeDimension({
            name: 'order_date_day',
            table: 'orders',
            sql: '${TABLE}.order_date',
            compiledSql: 'DATE_TRUNC(\'DAY\', "orders".order_date)',
        });
        const filteredRevenue = makeMetric({
            name: 'filtered_revenue',
            type: MetricType.SUM,
            sql: '${TABLE}.amount',
            compiledSql: 'SUM("orders".amount)',
            filters: [
                {
                    id: 'metric-filter',
                    target: {
                        fieldRef: 'order_date_DAY',
                    },
                    operator: FilterOperator.EQUALS,
                    values: ['2024-01-01'],
                },
            ],
        });

        expect(
            analyzePreAggregateDerivedMetricEligibility({
                metric: filteredRevenue,
                tables: makeTables({
                    dimensions: [orderDateDay],
                    metrics: [filteredRevenue],
                }),
            }),
        ).toEqual({
            isEligible: true,
            referencedDimensionFieldIds: [getItemId(orderDateDay)],
            referencedMetricFieldIds: [getItemId(filteredRevenue)],
        });
    });
});
