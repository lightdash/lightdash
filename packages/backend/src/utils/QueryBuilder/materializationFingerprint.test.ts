import {
    DimensionType,
    ExploreCompiler,
    FieldType,
    FilterOperator,
    MetricType,
    preAggregateMaterialization,
    UnitOfTime,
    type Explore,
    type FilterRule,
    type Metric,
    type MetricFilterRule,
    type MetricQuery,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type Table,
} from '@lightdash/common';
import { EXPLORE, warehouseClientMock } from './MetricQueryBuilder.mock';
import { QueryComposer } from './QueryComposer';

const compiler = new ExploreCompiler(warehouseClientMock);
const relativeFilter: MetricFilterRule = {
    id: 'relative',
    target: { fieldRef: 'created_at' },
    operator: FilterOperator.IN_THE_PAST,
    values: [7],
    settings: { unitOfTime: UnitOfTime.days, completed: true },
};

const metric: Metric = {
    ...EXPLORE.tables.table1.metrics.metric1,
    name: 'recent',
    table: 'table1',
    type: MetricType.COUNT,
    sql: '${TABLE}.created_at',
    filters: [relativeFilter],
};

const compileExplore = (metrics: Metric[] = [metric]): Explore => {
    const table: Table = {
        ...EXPLORE.tables.table1,
        dimensions: {
            created_at: {
                name: 'created_at',
                label: 'Created at',
                table: 'table1',
                tableLabel: 'Table 1',
                fieldType: FieldType.DIMENSION,
                type: DimensionType.TIMESTAMP,
                sql: '${TABLE}.created_at',
                hidden: false,
            },
        },
        metrics: Object.fromEntries(metrics.map((item) => [item.name, item])),
        lineageGraph: {},
    };
    const tables = { table1: table };
    return {
        ...EXPLORE,
        joinedTables: [],
        tables: {
            table1: {
                ...table,
                dimensions: {
                    created_at: compiler.compileDimension(
                        table.dimensions.created_at,
                        tables,
                        [],
                    ),
                },
                metrics: Object.fromEntries(
                    metrics.map((item) => [
                        item.name,
                        compiler.compileMetric(item, tables, []),
                    ]),
                ),
            },
        },
    };
};

const compose = (
    explore: Explore,
    options: {
        referenceTime?: Date;
        metricName?: string;
        filter?: FilterRule;
        timezone?: string;
        parameters?: ParametersValuesMap;
        parameterDefinitions?: ParameterDefinitions;
    } = {},
) => {
    const query: MetricQuery = {
        exploreName: 'table1',
        dimensions: [],
        metrics: [`table1_${options.metricName ?? 'recent'}`],
        filters: options.filter
            ? { dimensions: { id: 'group', and: [options.filter] } }
            : {},
        sorts: [],
        limit: 100,
        tableCalculations: [],
    };
    return new QueryComposer(
        { metricQuery: query },
        {
            explore,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: {},
            timezone: options.timezone ?? 'UTC',
            referenceTime: options.referenceTime,
            parameters: options.parameters,
            availableParameterDefinitions: options.parameterDefinitions,
        },
    );
};

describe('materialization fingerprints', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-04T04:12:11Z'));
    });
    afterEach(() => vi.useRealTimers());

    test('recompiles on a different day without changing the definition fingerprint', () => {
        const first = compose(compileExplore(), {
            referenceTime: new Date('2026-05-04T04:12:11Z'),
        });
        const fingerprint = first.getMaterializationFingerprint({
            columnLimit: 100,
        });
        expect(fingerprint.status).toBe('reusable');
        const firstSql = first.getSql({ columnLimit: 100 });
        vi.setSystemTime(new Date('2026-06-04T04:12:11Z'));
        const second = compose(compileExplore(), {
            referenceTime: new Date('2026-06-04T04:12:11Z'),
        });
        expect(
            second.getMaterializationFingerprint({ columnLimit: 100 }),
        ).toEqual(fingerprint);
        expect(second.getSql({ columnLimit: 100 })).not.toBe(firstSql);
        expect(first.getSql({ columnLimit: 100 })).toBe(firstSql);
    });

    test.each([
        {
            boundary: 'New York midnight',
            before: '2026-09-14T03:59:59Z',
            after: '2026-09-14T04:00:00Z',
            unitOfTime: UnitOfTime.days,
            firstStart: '2026-09-13 04:00:00+00:00',
            secondStart: '2026-09-14 04:00:00+00:00',
        },
        {
            boundary: 'New York spring DST skipped hour',
            before: '2026-03-08T06:59:59Z',
            after: '2026-03-08T07:00:00Z',
            unitOfTime: UnitOfTime.hours,
            firstStart: '2026-03-08 06:00:00+00:00',
            secondStart: '2026-03-08 07:00:00+00:00',
        },
        {
            boundary: 'New York fall DST repeated hour',
            before: '2026-11-01T05:59:59Z',
            after: '2026-11-01T06:00:00Z',
            unitOfTime: UnitOfTime.hours,
            firstStart: '2026-11-01 05:00:00+00:00',
            secondStart: '2026-11-01 06:00:00+00:00',
        },
        {
            boundary: 'ISO week/year rollover in New York',
            before: '2025-12-29T04:59:59Z',
            after: '2025-12-29T05:00:00Z',
            unitOfTime: UnitOfTime.weeks,
            firstStart: '2025-12-22 05:00:00+00:00',
            secondStart: '2025-12-29 05:00:00+00:00',
        },
        {
            boundary: 'calendar year rollover in New York',
            before: '2026-01-01T04:59:59Z',
            after: '2026-01-01T05:00:00Z',
            unitOfTime: UnitOfTime.years,
            firstStart: '2025-01-01 05:00:00+00:00',
            secondStart: '2026-01-01 05:00:00+00:00',
        },
    ])(
        '$boundary advances execution boundaries but preserves the comparison fingerprint',
        ({ before, after, unitOfTime, firstStart, secondStart }) => {
            const definition = {
                ...metric,
                filters: [
                    {
                        ...relativeFilter,
                        operator: FilterOperator.IN_THE_CURRENT,
                        settings: { unitOfTime },
                    },
                ],
            };
            vi.setSystemTime(new Date(before));
            const first = compose(compileExplore([definition]), {
                referenceTime: new Date(before),
                timezone: 'America/New_York',
            });
            const firstSql = first.getSql({ columnLimit: 100 });
            const fingerprint = first.getMaterializationFingerprint({
                columnLimit: 100,
            });
            expect(fingerprint.status).toBe('reusable');
            expect(firstSql).toContain(firstStart);

            vi.setSystemTime(new Date(after));
            const second = compose(compileExplore([definition]), {
                referenceTime: new Date(after),
                timezone: 'America/New_York',
            });
            const secondSql = second.getSql({ columnLimit: 100 });
            expect(secondSql).toContain(secondStart);
            expect(secondSql).not.toBe(firstSql);
            expect(
                second.getMaterializationFingerprint({ columnLimit: 100 }),
            ).toEqual(fingerprint);
            expect(first.getSql({ columnLimit: 100 })).toBe(firstSql);
        },
    );

    test.each([
        { unitOfTime: UnitOfTime.weeks, before: 1, after: 2, comparison: 3 },
        { unitOfTime: UnitOfTime.months, before: 30, after: 1, comparison: 15 },
        {
            unitOfTime: UnitOfTime.quarters,
            before: 90,
            after: 0,
            comparison: 75,
        },
        {
            unitOfTime: UnitOfTime.years,
            before: 181,
            after: 182,
            comparison: 167,
        },
    ])(
        'period-to-date $unitOfTime pins numeric comparison cutoffs while execution advances',
        ({ unitOfTime, before, after, comparison }) => {
            const definition = {
                ...metric,
                filters: [
                    {
                        ...relativeFilter,
                        operator: FilterOperator.IN_PERIOD_TO_DATE,
                        settings: { unitOfTime },
                    },
                ],
            };
            vi.setSystemTime(new Date('2026-07-01T03:59:59Z'));
            const first = compose(compileExplore([definition]), {
                referenceTime: new Date('2026-07-01T03:59:59Z'),
                timezone: 'America/New_York',
            });
            const firstSql = first.getSql({ columnLimit: 100 });
            const fingerprint = first.getMaterializationFingerprint({
                columnLimit: 100,
            });
            if (fingerprint.status !== 'reusable')
                throw new Error('Expected reusable fingerprint');
            expect(firstSql).toContain(`<= ${before})`);
            expect(fingerprint.comparisonSql).toContain(`<= ${comparison})`);

            vi.setSystemTime(new Date('2026-07-01T04:00:00Z'));
            const second = compose(compileExplore([definition]), {
                referenceTime: new Date('2026-07-01T04:00:00Z'),
                timezone: 'America/New_York',
            });
            expect(second.getSql({ columnLimit: 100 })).toContain(
                `<= ${after})`,
            );
            expect(second.getSql({ columnLimit: 100 })).not.toBe(firstSql);
            expect(
                second.getMaterializationFingerprint({ columnLimit: 100 }),
            ).toEqual(fingerprint);
            expect(first.getSql({ columnLimit: 100 })).toBe(firstSql);
        },
    );

    test('normalizes generated IDs but distinguishes count, completion, and timezone edits', () => {
        const fingerprint = compose(
            compileExplore(),
        ).getMaterializationFingerprint({ columnLimit: 100 });
        const changedId = compileExplore([
            {
                ...metric,
                filters: [{ ...relativeFilter, id: 'new-random-id' }],
            },
        ]);
        expect(
            compose(changedId).getMaterializationFingerprint({
                columnLimit: 100,
            }),
        ).toEqual(fingerprint);
        for (const filter of [
            { ...relativeFilter, values: [8] },
            {
                ...relativeFilter,
                settings: { unitOfTime: UnitOfTime.days, completed: false },
            },
        ]) {
            expect(
                compose(
                    compileExplore([{ ...metric, filters: [filter] }]),
                ).getMaterializationFingerprint({ columnLimit: 100 }),
            ).not.toEqual(fingerprint);
        }
        expect(
            compose(compileExplore(), {
                timezone: 'America/New_York',
            }).getMaterializationFingerprint({ columnLimit: 100 }),
        ).not.toEqual(fingerprint);
    });

    test('distinguishes relative rules whose dates collide at the comparison instant', () => {
        const fingerprintFor = (unitOfTime: UnitOfTime, count: number) =>
            compose(
                compileExplore([
                    {
                        ...metric,
                        filters: [
                            {
                                ...relativeFilter,
                                values: [count],
                                settings: { unitOfTime, completed: false },
                            },
                        ],
                    },
                ]),
            ).getMaterializationFingerprint({ columnLimit: 100 });
        const month = fingerprintFor(UnitOfTime.months, 1);
        const days = fingerprintFor(UnitOfTime.days, 31);
        if (month.status !== 'reusable' || days.status !== 'reusable')
            throw new Error('Expected reusable fingerprints');
        expect(month.comparisonSql).toBe(days.comparisonSql);
        expect(month.relativeDateFilters).not.toEqual(days.relativeDateFilters);
    });

    test('preserves an authored predicate identical to a compiler-generated relative predicate', () => {
        const baked =
            compileExplore().tables.table1.metrics.recent
                .compiledRelativeDateFilters?.[0]?.compiledSql;
        if (!baked) throw new Error('Expected a baked relative predicate');
        const withAuthoredPredicate = compileExplore([
            {
                ...metric,
                sql: `CASE WHEN ${baked} THEN \${TABLE}.created_at ELSE NULL END`,
            },
        ]);
        const composer = compose(withAuthoredPredicate, {
            referenceTime: new Date('2026-06-04T04:12:11Z'),
        });
        const executionSql = composer.getSql({ columnLimit: 100 });
        expect(executionSql).toContain(baked);
        expect(executionSql).toContain('2026-06-04');
        const fingerprint = composer.getMaterializationFingerprint({
            columnLimit: 100,
        });
        if (fingerprint.status !== 'reusable')
            throw new Error('Expected reusable fingerprint');
        expect(fingerprint.comparisonSql).toContain(baked);
        expect(fingerprint.comparisonSql).toContain('2000-06-15');
    });

    test('propagates filter slots through repeated metric references', () => {
        const derived: Metric = {
            ...metric,
            name: 'twice',
            type: MetricType.NUMBER,
            sql: '${recent} + ${recent}',
            filters: undefined,
        };
        const explorer = compileExplore([metric, derived]);
        const composer = compose(explorer, {
            metricName: 'twice',
            referenceTime: new Date('2026-06-04T04:12:11Z'),
        });
        const fingerprint = composer.getMaterializationFingerprint({
            columnLimit: 100,
        });
        expect(fingerprint.status).toBe('reusable');
        expect(composer.getSql({ columnLimit: 100 })).not.toContain(
            '2026-05-04',
        );
        expect(
            explorer.tables.table1.metrics.twice.compiledSqlTemplate?.filter(
                (part) => part.type === 'filter',
            ),
        ).toHaveLength(2);
    });

    test('legacy missing or mismatched provenance cannot claim compatibility', () => {
        const explorer = compileExplore();
        const { compiledSqlTemplate, compiledValueSqlTemplate, ...legacy } =
            explorer.tables.table1.metrics.recent;
        const legacyExplore = {
            ...explorer,
            tables: {
                ...explorer.tables,
                table1: {
                    ...explorer.tables.table1,
                    metrics: { recent: legacy },
                },
            },
        };
        expect(
            compose(legacyExplore).getMaterializationFingerprint({
                columnLimit: 100,
            }).status,
        ).toBe('non-reusable');
        const mismatched = compileExplore();
        mismatched.tables.table1.metrics.recent.compiledSql += ' + 1';
        expect(
            compose(mismatched).getMaterializationFingerprint({
                columnLimit: 100,
            }).status,
        ).toBe('non-reusable');
    });

    test('keeps native warehouse clocks and absolute query dates meaningful', () => {
        const native = compileExplore([
            {
                ...metric,
                filters: undefined,
                sql: "CASE WHEN ${TABLE}.created_at >= CURRENT_DATE - INTERVAL '7 DAYS' THEN 1 ELSE NULL END",
            },
        ]);
        const withDate = (value: string) =>
            compose(native, {
                filter: {
                    id: 'absolute',
                    target: { fieldId: 'table1_created_at' },
                    operator: FilterOperator.GREATER_THAN,
                    values: [value],
                },
            }).getMaterializationFingerprint({ columnLimit: 100 });
        const first = withDate('2026-04-01');
        if (first.status !== 'reusable')
            throw new Error('Expected reusable fingerprint');
        expect(first.comparisonSql).toContain(
            "CURRENT_DATE - INTERVAL '7 DAYS'",
        );
        expect(first.relativeDateFilters).toEqual([]);
        expect(withDate('2026-04-02')).not.toEqual(first);
    });

    test('relative query filters include resolved parameter values and Boolean position', () => {
        const explore = compileExplore([{ ...metric, filters: undefined }]);
        const withDays = (days: number) =>
            compose(explore, {
                filter: {
                    id: 'relative-query',
                    target: { fieldId: 'table1_created_at' },
                    operator: FilterOperator.IN_THE_PAST,
                    values: ['${lightdash.parameters.days}'],
                },
                parameters: { days },
                parameterDefinitions: {
                    days: { label: 'Window', type: 'number' },
                },
            }).getMaterializationFingerprint({ columnLimit: 100 });
        const first = withDays(7);
        if (first.status !== 'reusable')
            throw new Error('Expected reusable fingerprint');
        expect(first.relativeDateFilters).toEqual([
            expect.objectContaining({
                owner: {
                    type: 'query',
                    fieldId: 'table1_created_at',
                    position: 'dimension.AND[0]',
                },
                filter: expect.objectContaining({
                    count: 7,
                    unitOfTime: UnitOfTime.days,
                }),
            }),
        ]);
        expect(withDays(8)).not.toEqual(first);
    });

    test('average materialization components retain relative-filter provenance', () => {
        const explore = compileExplore([
            { ...metric, type: MetricType.AVERAGE, sql: '7' },
        ]);
        const { metricQuery } =
            preAggregateMaterialization.buildMaterializationMetricQuery({
                sourceExplore: explore,
                preAggregateDef: {
                    name: 'average',
                    dimensions: [],
                    metrics: ['recent'],
                },
                materializationConfig: { maxRows: null },
            });
        const composer = new QueryComposer(
            { metricQuery },
            {
                explore,
                warehouseSqlBuilder: warehouseClientMock,
                timezone: 'UTC',
                referenceTime: new Date('2026-06-04T04:12:11Z'),
            },
        );
        const fingerprint = composer.getMaterializationFingerprint({
            columnLimit: 100,
        });
        if (fingerprint.status !== 'reusable')
            throw new Error('Expected reusable fingerprint');
        expect(
            new Set(
                fingerprint.relativeDateFilters.map(({ owner }) =>
                    owner.type === 'metric' ? owner.metricId : owner.fieldId,
                ),
            ),
        ).toEqual(new Set(['table1_recent__sum', 'table1_recent__count']));
        expect(composer.getSql({ columnLimit: 100 })).toContain('2026-06-04');
        expect(fingerprint.comparisonSql).not.toContain('2026-05-04');
    });

    test('serving-only number formulas preserve materialization SQL and output fields', () => {
        const prepare = (formula: string) => {
            const explore = compileExplore([
                metric,
                {
                    ...metric,
                    name: 'derived',
                    type: MetricType.NUMBER,
                    sql: formula,
                    filters: undefined,
                },
            ]);
            const { metricQuery } =
                preAggregateMaterialization.buildMaterializationMetricQuery({
                    sourceExplore: explore,
                    preAggregateDef: {
                        name: 'derived',
                        dimensions: [],
                        metrics: ['recent', 'derived'],
                    },
                    materializationConfig: { maxRows: null },
                });
            const composer = new QueryComposer(
                { metricQuery },
                {
                    explore,
                    warehouseSqlBuilder: warehouseClientMock,
                    timezone: 'UTC',
                },
            );
            return {
                fingerprint: composer.getMaterializationFingerprint({
                    columnLimit: 100,
                }),
                fields: Object.entries(composer.getFields()).map(
                    ([name, field]) => ({ name, type: field.type }),
                ),
            };
        };
        expect(prepare('${recent} * 100')).toEqual(prepare('${recent} * 200'));
    });
});
