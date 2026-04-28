import {
    CustomDimensionType,
    DimensionType,
    type CustomDimension,
    type CustomSqlDimension,
    type FormulaTableCalculation,
    type SqlTableCalculation,
    type TemplateTableCalculation,
} from '../types/field';
import { type MetricQuery } from '../types/metricQuery';
import {
    getModifiedSqlAuthoredFields,
    hasModifiedSqlAuthoredFields,
    hasSqlAuthoredFields,
} from './sqlAuthoredFields';

const sqlDim = (id: string, sql: string, name = id): CustomSqlDimension => ({
    id,
    name,
    table: 'orders',
    type: CustomDimensionType.SQL,
    sql,
    dimensionType: DimensionType.STRING,
});

const binDim = (id: string): CustomDimension =>
    ({
        id,
        name: id,
        table: 'orders',
        type: CustomDimensionType.BIN,
    }) as unknown as CustomDimension;

const sqlCalc = (name: string, sql: string): SqlTableCalculation => ({
    name,
    displayName: name,
    sql,
});

const templateCalc = (name: string): TemplateTableCalculation => ({
    name,
    displayName: name,
    template: {
        type: 'percent_change_from_previous',
    } as TemplateTableCalculation['template'],
});

const formulaCalc = (
    name: string,
    formula: string,
): FormulaTableCalculation => ({
    name,
    displayName: name,
    formula,
});

const mq = (
    overrides: Partial<MetricQuery> = {},
): Pick<MetricQuery, 'customDimensions' | 'tableCalculations'> => ({
    customDimensions: overrides.customDimensions ?? [],
    tableCalculations: overrides.tableCalculations ?? [],
});

describe('getModifiedSqlAuthoredFields', () => {
    describe('saved baseline absent', () => {
        it('treats every incoming SQL field as modified when there is no saved version', () => {
            const incoming = mq({
                customDimensions: [sqlDim('d1', 'a + 1')],
                tableCalculations: [sqlCalc('c1', 'sum(x)')],
            });

            const result = getModifiedSqlAuthoredFields(incoming, null);

            expect(result.customDimensions).toHaveLength(1);
            expect(result.tableCalculations).toHaveLength(1);
        });

        it('returns empty result when incoming has no SQL fields and saved is missing', () => {
            const incoming = mq({
                customDimensions: [binDim('b1')],
                tableCalculations: [
                    templateCalc('t1'),
                    formulaCalc('f1', 'SUM(x)'),
                ],
            });

            const result = getModifiedSqlAuthoredFields(incoming, undefined);

            expect(result.customDimensions).toHaveLength(0);
            expect(result.tableCalculations).toHaveLength(0);
        });
    });

    describe('custom SQL dimensions', () => {
        it('returns nothing when SQL is identical', () => {
            const dim = sqlDim('d1', 'a + 1');
            const result = getModifiedSqlAuthoredFields(
                mq({ customDimensions: [dim] }),
                mq({ customDimensions: [dim] }),
            );
            expect(result.customDimensions).toHaveLength(0);
        });

        it('flags a dim whose SQL body changed', () => {
            const result = getModifiedSqlAuthoredFields(
                mq({ customDimensions: [sqlDim('d1', 'a + 2')] }),
                mq({ customDimensions: [sqlDim('d1', 'a + 1')] }),
            );
            expect(result.customDimensions).toEqual([sqlDim('d1', 'a + 2')]);
        });

        it('flags a brand-new dim added on top of a saved query', () => {
            const result = getModifiedSqlAuthoredFields(
                mq({
                    customDimensions: [
                        sqlDim('d1', 'a + 1'),
                        sqlDim('d2', 'b + 1'),
                    ],
                }),
                mq({ customDimensions: [sqlDim('d1', 'a + 1')] }),
            );
            expect(result.customDimensions).toEqual([sqlDim('d2', 'b + 1')]);
        });

        it('does not flag a removed dim (removal is not authoring)', () => {
            const result = getModifiedSqlAuthoredFields(
                mq({ customDimensions: [] }),
                mq({ customDimensions: [sqlDim('d1', 'a + 1')] }),
            );
            expect(result.customDimensions).toHaveLength(0);
        });

        it('does not flag a name-only change when SQL is unchanged', () => {
            const result = getModifiedSqlAuthoredFields(
                mq({
                    customDimensions: [sqlDim('d1', 'a + 1', 'New Display')],
                }),
                mq({
                    customDimensions: [sqlDim('d1', 'a + 1', 'Old Display')],
                }),
            );
            expect(result.customDimensions).toHaveLength(0);
        });

        it('ignores bin custom dimensions entirely', () => {
            const result = getModifiedSqlAuthoredFields(
                mq({ customDimensions: [binDim('b1')] }),
                mq({ customDimensions: [] }),
            );
            expect(result.customDimensions).toHaveLength(0);
        });
    });

    describe('SQL table calculations', () => {
        it('returns nothing when SQL is identical', () => {
            const calc = sqlCalc('c1', 'sum(x)');
            const result = getModifiedSqlAuthoredFields(
                mq({ tableCalculations: [calc] }),
                mq({ tableCalculations: [calc] }),
            );
            expect(result.tableCalculations).toHaveLength(0);
        });

        it('flags a calc whose SQL body changed', () => {
            const result = getModifiedSqlAuthoredFields(
                mq({ tableCalculations: [sqlCalc('c1', 'avg(x)')] }),
                mq({ tableCalculations: [sqlCalc('c1', 'sum(x)')] }),
            );
            expect(result.tableCalculations).toEqual([sqlCalc('c1', 'avg(x)')]);
        });

        it('flags a newly added calc', () => {
            const result = getModifiedSqlAuthoredFields(
                mq({
                    tableCalculations: [
                        sqlCalc('c1', 'sum(x)'),
                        sqlCalc('c2', 'count(*)'),
                    ],
                }),
                mq({ tableCalculations: [sqlCalc('c1', 'sum(x)')] }),
            );
            expect(result.tableCalculations).toEqual([
                sqlCalc('c2', 'count(*)'),
            ]);
        });

        it('does not flag a removed calc', () => {
            const result = getModifiedSqlAuthoredFields(
                mq({ tableCalculations: [] }),
                mq({ tableCalculations: [sqlCalc('c1', 'sum(x)')] }),
            );
            expect(result.tableCalculations).toHaveLength(0);
        });

        it('does not flag a display-name-only change', () => {
            const result = getModifiedSqlAuthoredFields(
                mq({
                    tableCalculations: [
                        {
                            ...sqlCalc('c1', 'sum(x)'),
                            displayName: 'New label',
                        },
                    ],
                }),
                mq({
                    tableCalculations: [
                        {
                            ...sqlCalc('c1', 'sum(x)'),
                            displayName: 'Old label',
                        },
                    ],
                }),
            );
            expect(result.tableCalculations).toHaveLength(0);
        });

        it('ignores template and formula calcs entirely (added or removed)', () => {
            const result = getModifiedSqlAuthoredFields(
                mq({
                    tableCalculations: [
                        templateCalc('t1'),
                        formulaCalc('f1', 'SUM(x) / SUM(y)'),
                    ],
                }),
                mq({ tableCalculations: [] }),
            );
            expect(result.tableCalculations).toHaveLength(0);
        });

        it('treats SQL→formula conversion as a non-modification (the SQL is gone, formula is ungated)', () => {
            const result = getModifiedSqlAuthoredFields(
                mq({ tableCalculations: [formulaCalc('c1', 'SUM(x)')] }),
                mq({ tableCalculations: [sqlCalc('c1', 'sum(x)')] }),
            );
            expect(result.tableCalculations).toHaveLength(0);
        });
    });
});

describe('hasSqlAuthoredFields', () => {
    it('returns false for null/undefined input', () => {
        expect(hasSqlAuthoredFields(null)).toBe(false);
        expect(hasSqlAuthoredFields(undefined)).toBe(false);
    });

    it('returns false when only non-SQL fields are present', () => {
        expect(
            hasSqlAuthoredFields(
                mq({
                    customDimensions: [binDim('b1')],
                    tableCalculations: [
                        templateCalc('t1'),
                        formulaCalc('f1', 'SUM(x)'),
                    ],
                }),
            ),
        ).toBe(false);
    });

    it('returns true if any SQL custom dim is present', () => {
        expect(
            hasSqlAuthoredFields(
                mq({ customDimensions: [sqlDim('d1', 'a + 1')] }),
            ),
        ).toBe(true);
    });

    it('returns true if any SQL table calc is present', () => {
        expect(
            hasSqlAuthoredFields(
                mq({ tableCalculations: [sqlCalc('c1', 'sum(x)')] }),
            ),
        ).toBe(true);
    });
});

describe('hasModifiedSqlAuthoredFields', () => {
    it('returns true when there is any modification', () => {
        expect(
            hasModifiedSqlAuthoredFields(
                mq({ tableCalculations: [sqlCalc('c1', 'avg(x)')] }),
                mq({ tableCalculations: [sqlCalc('c1', 'sum(x)')] }),
            ),
        ).toBe(true);
    });

    it('returns false when nothing changed', () => {
        const dim = sqlDim('d1', 'a + 1');
        const calc = sqlCalc('c1', 'sum(x)');
        expect(
            hasModifiedSqlAuthoredFields(
                mq({ customDimensions: [dim], tableCalculations: [calc] }),
                mq({ customDimensions: [dim], tableCalculations: [calc] }),
            ),
        ).toBe(false);
    });
});
