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
    mergeSavedSqlBodiesIntoMetricQuery,
    stripSqlBodiesFromMetricQuery,
} from './sqlAuthoredFields';

const fullMq = (overrides: Partial<MetricQuery> = {}): MetricQuery => ({
    exploreName: 'orders',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
    additionalMetrics: [],
    customDimensions: [],
    ...overrides,
});

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

describe('getModifiedSqlAuthoredFields — strip-on-encode round-trip', () => {
    it('treats empty incoming custom dim sql as preserved when saved has a body', () => {
        const result = getModifiedSqlAuthoredFields(
            mq({ customDimensions: [sqlDim('d1', '')] }),
            mq({ customDimensions: [sqlDim('d1', '${orders.amount}')] }),
        );

        expect(result.customDimensions).toEqual([]);
    });

    it('treats empty incoming table calc sql as preserved when saved has a body', () => {
        const result = getModifiedSqlAuthoredFields(
            mq({ tableCalculations: [sqlCalc('c1', '')] }),
            mq({ tableCalculations: [sqlCalc('c1', 'sum(x)')] }),
        );

        expect(result.tableCalculations).toEqual([]);
    });

    it('flags empty incoming SQL custom dim as modified when there is no saved counterpart', () => {
        // Custom SQL dims are identified by `type === SQL` regardless of body.
        const result = getModifiedSqlAuthoredFields(
            mq({ customDimensions: [sqlDim('d_new', '')] }),
            mq({}),
        );
        expect(result.customDimensions).toHaveLength(1);
    });

    it('does not flag an empty incoming SQL table calc when no saved match exists', () => {
        // SQL table calcs are identified by a *non-empty* sql body, so a
        // calc with empty body falls outside the SQL variant entirely.
        // Compile would still reject it downstream — gate stays out of it.
        const result = getModifiedSqlAuthoredFields(
            mq({ tableCalculations: [sqlCalc('c_new', '')] }),
            mq({}),
        );
        expect(result.tableCalculations).toEqual([]);
    });
});

describe('stripSqlBodiesFromMetricQuery', () => {
    it('blanks the sql of every SQL custom dim while leaving bin dims untouched', () => {
        const result = stripSqlBodiesFromMetricQuery(
            fullMq({
                customDimensions: [
                    sqlDim('d1', '${orders.amount}'),
                    binDim('b1'),
                ],
            }),
        );

        expect(result.customDimensions).toEqual([
            expect.objectContaining({ id: 'd1', sql: '' }),
            expect.objectContaining({ id: 'b1' }),
        ]);
        // Bin dim shape preserved
        expect(result.customDimensions?.[1]).not.toHaveProperty('sql');
    });

    it('blanks the sql of every SQL table calc while leaving formula and template untouched', () => {
        const result = stripSqlBodiesFromMetricQuery(
            fullMq({
                tableCalculations: [
                    sqlCalc('s1', 'sum(x)'),
                    formulaCalc('f1', '=SUM(x)'),
                    templateCalc('t1'),
                ],
            }),
        );

        expect(result.tableCalculations).toEqual([
            expect.objectContaining({ name: 's1', sql: '' }),
            expect.objectContaining({ name: 'f1', formula: '=SUM(x)' }),
            expect.objectContaining({ name: 't1' }),
        ]);
    });

    it('returns an equivalent shape (idempotent) when there are no SQL fields', () => {
        const input = fullMq({
            customDimensions: [binDim('b1')],
            tableCalculations: [
                formulaCalc('f1', '=AVG(x)'),
                templateCalc('t1'),
            ],
        });
        const result = stripSqlBodiesFromMetricQuery(input);

        expect(result.customDimensions).toEqual(input.customDimensions);
        expect(result.tableCalculations).toEqual(input.tableCalculations);
    });
});

describe('mergeSavedSqlBodiesIntoMetricQuery', () => {
    it('rehydrates an empty SQL custom dim from the saved chart by id', () => {
        const result = mergeSavedSqlBodiesIntoMetricQuery(
            fullMq({ customDimensions: [sqlDim('d1', '')] }),
            mq({ customDimensions: [sqlDim('d1', '${orders.amount}')] }),
        );

        expect(result.customDimensions).toEqual([
            expect.objectContaining({ id: 'd1', sql: '${orders.amount}' }),
        ]);
    });

    it('rehydrates an empty SQL table calc from the saved chart by name', () => {
        const result = mergeSavedSqlBodiesIntoMetricQuery(
            fullMq({ tableCalculations: [sqlCalc('c1', '')] }),
            mq({ tableCalculations: [sqlCalc('c1', 'sum(x)')] }),
        );

        expect(result.tableCalculations).toEqual([
            expect.objectContaining({ name: 'c1', sql: 'sum(x)' }),
        ]);
    });

    it('leaves non-empty incoming SQL untouched (does not overwrite user edits)', () => {
        const result = mergeSavedSqlBodiesIntoMetricQuery(
            fullMq({ customDimensions: [sqlDim('d1', 'modified')] }),
            mq({ customDimensions: [sqlDim('d1', 'saved')] }),
        );

        expect(result.customDimensions).toEqual([
            expect.objectContaining({ sql: 'modified' }),
        ]);
    });

    it('leaves empty incoming SQL untouched when there is no matching saved field', () => {
        const result = mergeSavedSqlBodiesIntoMetricQuery(
            fullMq({ customDimensions: [sqlDim('d_orphan', '')] }),
            mq({ customDimensions: [sqlDim('d_other', 'sql')] }),
        );

        expect(result.customDimensions).toEqual([
            expect.objectContaining({ id: 'd_orphan', sql: '' }),
        ]);
    });

    it('returns the input untouched when saved is null', () => {
        const incoming = fullMq({
            customDimensions: [sqlDim('d1', '${orders.amount}')],
            tableCalculations: [sqlCalc('c1', 'sum(x)')],
        });
        expect(mergeSavedSqlBodiesIntoMetricQuery(incoming, null)).toBe(
            incoming,
        );
    });
});

describe('strip + merge round-trip', () => {
    it('reconstructs the original metricQuery for SQL custom dims and table calcs', () => {
        const original = fullMq({
            customDimensions: [sqlDim('d1', '${orders.amount}'), binDim('b1')],
            tableCalculations: [
                sqlCalc('s1', 'sum(x)'),
                formulaCalc('f1', '=SUM(x)'),
            ],
        });

        const stripped = stripSqlBodiesFromMetricQuery(original);
        const rehydrated = mergeSavedSqlBodiesIntoMetricQuery(
            stripped,
            original,
        );

        expect(rehydrated.customDimensions).toEqual(original.customDimensions);
        expect(rehydrated.tableCalculations).toEqual(
            original.tableCalculations,
        );
    });
});
