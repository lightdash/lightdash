import { getParameterReferencesFromSqlAndFormat } from '../../compiler/parameters';
import type { CompiledTable } from '../../types/explore';
import {
    DimensionType,
    FieldType,
    type CompiledDimension,
} from '../../types/field';
import { getItemId } from '../../utils/item';
import {
    analyzePreAggregateDerivedDimensionEligibility,
    PreAggregateDerivedDimensionIneligibilityReason,
} from './dimensionEligibility';

const makeDimension = (
    overrides: Partial<CompiledDimension> & Pick<CompiledDimension, 'name'>,
): CompiledDimension => ({
    ...overrides,
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: overrides.name,
    label: overrides.label ?? overrides.name,
    table: overrides.table ?? 'orders',
    tableLabel: overrides.tableLabel ?? 'Orders',
    sql: overrides.sql ?? '${TABLE}.id',
    compiledSql: overrides.compiledSql ?? overrides.sql ?? '"orders".id',
    parameterReferences:
        overrides.parameterReferences ??
        getParameterReferencesFromSqlAndFormat(overrides.sql ?? '${TABLE}.id'),
    tablesReferences: overrides.tablesReferences ?? ['orders'],
    hidden: overrides.hidden ?? false,
});

const makeTables = (
    dimensions: CompiledDimension[],
): Record<
    string,
    Pick<CompiledTable, 'name' | 'originalName' | 'dimensions' | 'metrics'>
> =>
    dimensions.reduce<
        Record<
            string,
            Pick<
                CompiledTable,
                'name' | 'originalName' | 'dimensions' | 'metrics'
            >
        >
    >((acc, dimension) => {
        acc[dimension.table] = acc[dimension.table] ?? {
            name: dimension.table,
            originalName: dimension.table === 'cstmr' ? 'customers' : undefined,
            dimensions: {},
            metrics: {},
        };
        acc[dimension.table].dimensions[dimension.name] = dimension;
        return acc;
    }, {});

describe('analyzePreAggregateDerivedDimensionEligibility', () => {
    it('classifies a plain base dimension as eligible', () => {
        const orderId = makeDimension({
            name: 'order_id',
            sql: '${TABLE}.id',
            compiledSql: '"orders".id',
        });

        expect(
            analyzePreAggregateDerivedDimensionEligibility({
                dimension: orderId,
                tables: makeTables([orderId]),
            }),
        ).toEqual({
            isEligible: true,
            referencedDimensionFieldIds: [getItemId(orderId)],
        });
    });

    it('classifies a derived dimension without runtime context as eligible', () => {
        const status = makeDimension({
            name: 'status',
            sql: '${TABLE}.status',
            compiledSql: '"orders".status',
        });
        const normalizedStatus = makeDimension({
            name: 'normalized_status',
            sql: 'upper(${status})',
        });
        const statusLabel = makeDimension({
            name: 'status_label',
            sql: "concat(${normalized_status}, '-ok')",
        });

        expect(
            analyzePreAggregateDerivedDimensionEligibility({
                dimension: statusLabel,
                tables: makeTables([status, normalizedStatus, statusLabel]),
            }),
        ).toEqual({
            isEligible: true,
            referencedDimensionFieldIds: [
                getItemId(statusLabel),
                getItemId(normalizedStatus),
                getItemId(status),
            ],
        });
    });

    it('resolves references through a joined table original name', () => {
        const customerFirstName = makeDimension({
            name: 'first_name',
            table: 'cstmr',
            sql: '${TABLE}.first_name',
            compiledSql: '"customers".first_name',
        });
        const customerGreeting = makeDimension({
            name: 'customer_greeting',
            sql: "concat(${customers.first_name}, ' hi')",
        });

        expect(
            analyzePreAggregateDerivedDimensionEligibility({
                dimension: customerGreeting,
                tables: makeTables([customerFirstName, customerGreeting]),
            }),
        ).toEqual({
            isEligible: true,
            referencedDimensionFieldIds: [
                getItemId(customerGreeting),
                getItemId(customerFirstName),
            ],
        });
    });

    it('rejects when a dimension sql references a parameter directly', () => {
        const status = makeDimension({
            name: 'status',
            sql: `
                CASE
                    WHEN \${lightdash.parameters.orders.region} = 'EMEA' THEN \${TABLE}.status
                    ELSE NULL
                END
            `,
        });

        expect(
            analyzePreAggregateDerivedDimensionEligibility({
                dimension: status,
                tables: makeTables([status]),
            }),
        ).toEqual({
            isEligible: false,
            reason: PreAggregateDerivedDimensionIneligibilityReason.PARAMETER_REFERENCES,
            ineligibleDimensionFieldId: getItemId(status),
            referencedDimensionFieldIds: [getItemId(status)],
        });
    });

    it('rejects when a recursive dependency has parameter references', () => {
        const status = makeDimension({
            name: 'status',
            sql: `
                CASE
                    WHEN \${lightdash.parameters.orders.region} = 'EMEA' THEN \${TABLE}.status
                    ELSE NULL
                END
            `,
        });
        const filteredStatus = makeDimension({
            name: 'filtered_status',
            sql: '${status}',
        });

        expect(
            analyzePreAggregateDerivedDimensionEligibility({
                dimension: filteredStatus,
                tables: makeTables([status, filteredStatus]),
            }),
        ).toEqual({
            isEligible: false,
            reason: PreAggregateDerivedDimensionIneligibilityReason.PARAMETER_REFERENCES,
            ineligibleDimensionFieldId: getItemId(status),
            referencedDimensionFieldIds: [
                getItemId(filteredStatus),
                getItemId(status),
            ],
        });
    });

    it('rejects when the dimension sql contains a direct user attribute reference', () => {
        const regionAwareStatus = makeDimension({
            name: 'region_aware_status',
            sql: "case when ${ld.attr.region} = 'EMEA' then ${TABLE}.status end",
        });

        expect(
            analyzePreAggregateDerivedDimensionEligibility({
                dimension: regionAwareStatus,
                tables: makeTables([regionAwareStatus]),
            }),
        ).toEqual({
            isEligible: false,
            reason: PreAggregateDerivedDimensionIneligibilityReason.USER_ATTRIBUTES,
            ineligibleDimensionFieldId: getItemId(regionAwareStatus),
            referencedDimensionFieldIds: [getItemId(regionAwareStatus)],
        });
    });

    it('rejects when the dimension sql contains a direct intrinsic user reference', () => {
        const emailAwareStatus = makeDimension({
            name: 'email_aware_status',
            sql: "case when ${lightdash.user.email} = 'demo@lightdash.com' then ${TABLE}.status end",
        });

        expect(
            analyzePreAggregateDerivedDimensionEligibility({
                dimension: emailAwareStatus,
                tables: makeTables([emailAwareStatus]),
            }),
        ).toEqual({
            isEligible: false,
            reason: PreAggregateDerivedDimensionIneligibilityReason.USER_ATTRIBUTES,
            ineligibleDimensionFieldId: getItemId(emailAwareStatus),
            referencedDimensionFieldIds: [getItemId(emailAwareStatus)],
        });
    });

    it('rejects when a nested dependency has a compilation error', () => {
        const status = makeDimension({
            name: 'status',
            sql: '${TABLE}.status',
            compilationError: {
                message: 'Cannot compile',
            },
        });
        const prettyStatus = makeDimension({
            name: 'pretty_status',
            sql: "concat(${orders.status}, '!')",
        });
        const statusWrapper = makeDimension({
            name: 'status_wrapper',
            sql: '${pretty_status}',
        });

        expect(
            analyzePreAggregateDerivedDimensionEligibility({
                dimension: statusWrapper,
                tables: makeTables([status, prettyStatus, statusWrapper]),
            }),
        ).toEqual({
            isEligible: false,
            reason: PreAggregateDerivedDimensionIneligibilityReason.COMPILATION_ERROR,
            ineligibleDimensionFieldId: getItemId(status),
            referencedDimensionFieldIds: [
                getItemId(statusWrapper),
                getItemId(prettyStatus),
                getItemId(status),
            ],
        });
    });

    it('rejects circular dependencies without recursing indefinitely', () => {
        const loop = makeDimension({
            name: 'loop',
            sql: '${loop}',
        });

        expect(
            analyzePreAggregateDerivedDimensionEligibility({
                dimension: loop,
                tables: makeTables([loop]),
            }),
        ).toEqual({
            isEligible: false,
            reason: PreAggregateDerivedDimensionIneligibilityReason.CIRCULAR_DEPENDENCY,
            ineligibleDimensionFieldId: getItemId(loop),
            referencedDimensionFieldIds: [getItemId(loop)],
        });
    });
});
