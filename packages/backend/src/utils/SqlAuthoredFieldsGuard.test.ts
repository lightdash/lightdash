import { type Ability } from '@casl/ability';
import {
    CustomDimensionType,
    CustomSqlQueryForbiddenError,
    DimensionType,
    TableCalculationType,
    type CustomSqlDimension,
    type MetricQuery,
    type SqlTableCalculation,
} from '@lightdash/common';
import { type CaslAuditWrapper } from '../logging/caslAuditWrapper';
import { assertCanWriteSqlAuthoredFields } from './SqlAuthoredFieldsGuard';

const baseMetricQuery: Pick<
    MetricQuery,
    'customDimensions' | 'tableCalculations'
> = {
    customDimensions: [],
    tableCalculations: [],
};

const sqlCustomDim: CustomSqlDimension = {
    id: 'dim-1',
    name: 'Bucketed amount',
    type: CustomDimensionType.SQL,
    table: 'orders',
    sql: "CASE WHEN amount > 100 THEN 'big' ELSE 'small' END",
    dimensionType: DimensionType.STRING,
};

const sqlTableCalc: SqlTableCalculation = {
    name: 'doubled',
    displayName: 'doubled',
    sql: '${orders.amount} * 2',
    type: TableCalculationType.NUMBER,
};

const buildAbility = (allowed: boolean): CaslAuditWrapper<Ability> =>
    ({
        cannot: jest.fn(() => !allowed),
    }) as unknown as CaslAuditWrapper<Ability>;

describe('assertCanWriteSqlAuthoredFields', () => {
    const args = {
        organizationUuid: 'org-uuid',
        projectUuid: 'project-uuid',
    };

    it('does not throw when metricQuery has no SQL-authored fields', () => {
        expect(() =>
            assertCanWriteSqlAuthoredFields({
                ...args,
                ability: buildAbility(false),
                metricQuery: baseMetricQuery,
            }),
        ).not.toThrow();
    });

    it('does not throw when metricQuery is null or undefined', () => {
        expect(() =>
            assertCanWriteSqlAuthoredFields({
                ...args,
                ability: buildAbility(false),
                metricQuery: null,
            }),
        ).not.toThrow();
        expect(() =>
            assertCanWriteSqlAuthoredFields({
                ...args,
                ability: buildAbility(false),
                metricQuery: undefined,
            }),
        ).not.toThrow();
    });

    it('throws when metricQuery has a SQL custom dimension and user lacks scope', () => {
        expect(() =>
            assertCanWriteSqlAuthoredFields({
                ...args,
                ability: buildAbility(false),
                metricQuery: {
                    ...baseMetricQuery,
                    customDimensions: [sqlCustomDim],
                },
            }),
        ).toThrow(CustomSqlQueryForbiddenError);
    });

    it('does not throw when metricQuery has a SQL custom dimension and user has scope', () => {
        expect(() =>
            assertCanWriteSqlAuthoredFields({
                ...args,
                ability: buildAbility(true),
                metricQuery: {
                    ...baseMetricQuery,
                    customDimensions: [sqlCustomDim],
                },
            }),
        ).not.toThrow();
    });

    it('throws when metricQuery has a SQL table calculation and user lacks scope', () => {
        expect(() =>
            assertCanWriteSqlAuthoredFields({
                ...args,
                ability: buildAbility(false),
                metricQuery: {
                    ...baseMetricQuery,
                    tableCalculations: [sqlTableCalc],
                },
            }),
        ).toThrow(CustomSqlQueryForbiddenError);
    });

    it('does not throw when metricQuery has a SQL table calculation and user has scope', () => {
        expect(() =>
            assertCanWriteSqlAuthoredFields({
                ...args,
                ability: buildAbility(true),
                metricQuery: {
                    ...baseMetricQuery,
                    tableCalculations: [sqlTableCalc],
                },
            }),
        ).not.toThrow();
    });

    it('uses the supplied error message when provided', () => {
        expect(() =>
            assertCanWriteSqlAuthoredFields({
                ...args,
                ability: buildAbility(false),
                metricQuery: {
                    ...baseMetricQuery,
                    customDimensions: [sqlCustomDim],
                },
                errorMessage: 'custom write-context message',
            }),
        ).toThrow('custom write-context message');
    });
});
