import {
    convertExplores,
    DEFAULT_SPOTLIGHT_CONFIG,
    DimensionType,
    ExploreType,
    InlineErrorType,
    SupportedDbtAdapter,
    TimeFrames,
    type Explore,
} from '@lightdash/common';
import { warehouseClientMock } from '@lightdash/common/src/compiler/exploreCompiler.mock';
import {
    model,
    MODEL_WITH_DEFAULT_SHOW_UNDERLYING_VALUES,
    MODEL_WITH_METRIC,
} from '@lightdash/common/src/compiler/translator.mock';
import { PRE_AGGREGATE_MATERIALIZED_TABLE_PLACEHOLDER } from './buildPreAggregateExplore';
import { preAggregatePostProcessor } from './postProcessor';

describe('pre-aggregates metadata parsing', () => {
    it('attaches parsed pre-aggregates to explore', async () => {
        const explores = await convertExplores(
            [
                {
                    ...model,
                    meta: {
                        pre_aggregates: [
                            {
                                name: 'orders_rollup',
                                dimensions: ['myColumnName'],
                                metrics: ['order_count'],
                                time_dimension: 'myColumnName',
                                granularity: 'day',
                            },
                        ],
                    },
                },
            ],
            false,
            SupportedDbtAdapter.POSTGRES,
            [],
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
            { postProcessors: [preAggregatePostProcessor] },
        );

        expect(explores).toHaveLength(1);
        expect(explores[0]).not.toHaveProperty('errors');
        expect((explores[0] as Explore).preAggregates).toStrictEqual([
            {
                name: 'orders_rollup',
                dimensions: ['myColumnName'],
                metrics: ['order_count'],
                timeDimension: 'myColumnName',
                granularity: TimeFrames.DAY,
            },
        ]);
    });

    it('does not attach pre-aggregates when metadata is missing', async () => {
        const explores = await convertExplores(
            [{ ...model, meta: {} }],
            false,
            SupportedDbtAdapter.POSTGRES,
            [],
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
            { postProcessors: [preAggregatePostProcessor] },
        );

        expect(explores).toHaveLength(1);
        expect((explores[0] as Explore).preAggregates).toBeUndefined();
    });

    it('uses config.meta.pre_aggregates over meta.pre_aggregates', async () => {
        const explores = await convertExplores(
            [
                {
                    ...model,
                    meta: {
                        pre_aggregates: [
                            {
                                name: 'from_meta',
                                dimensions: ['myColumnName'],
                                metrics: ['meta_metric'],
                            },
                        ],
                    },
                    config: {
                        ...(model.config || { materialized: 'table' }),
                        meta: {
                            pre_aggregates: [
                                {
                                    name: 'from_config',
                                    dimensions: ['customers.first_name'],
                                    metrics: ['config_metric'],
                                },
                            ],
                        },
                    },
                },
            ],
            false,
            SupportedDbtAdapter.POSTGRES,
            [],
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
            { postProcessors: [preAggregatePostProcessor] },
        );

        expect(explores).toHaveLength(1);
        expect((explores[0] as Explore).preAggregates).toStrictEqual([
            {
                name: 'from_config',
                dimensions: ['customers.first_name'],
                metrics: ['config_metric'],
            },
        ]);
    });

    it('returns metadata parse errors when pre-aggregate shape is invalid', async () => {
        const explores = await convertExplores(
            [
                {
                    ...model,
                    meta: {
                        pre_aggregates: [
                            {
                                name: '',
                                dimensions: ['myColumnName'],
                                metrics: ['metric_1'],
                            },
                        ],
                    },
                },
            ],
            false,
            SupportedDbtAdapter.POSTGRES,
            [],
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
            { postProcessors: [preAggregatePostProcessor] },
        );

        expect(explores).toHaveLength(1);
        expect(explores[0]).toHaveProperty('errors');
    });
});

describe('pre-aggregate virtual explore generation', () => {
    const previousFlagValue = process.env.PRE_AGGREGATES_ENABLED;

    afterEach(() => {
        process.env.PRE_AGGREGATES_ENABLED = previousFlagValue;
    });

    it('generates an internal pre-aggregate explore when enabled', async () => {
        process.env.PRE_AGGREGATES_ENABLED = 'true';

        const explores = await convertExplores(
            [
                {
                    ...MODEL_WITH_METRIC,
                    meta: {
                        pre_aggregates: [
                            {
                                name: 'rollup',
                                dimensions: ['user_id'],
                                metrics: [
                                    'myTable_total_num_participating_athletes',
                                ],
                            },
                        ],
                    },
                },
            ],
            false,
            SupportedDbtAdapter.POSTGRES,
            [],
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
            { postProcessors: [preAggregatePostProcessor] },
        );

        expect(explores).toHaveLength(2);

        const baseExplore = explores.find(
            (explore) => !('errors' in explore) && explore.name === 'myTable',
        ) as Explore;
        const preAggregateExplore = explores.find(
            (explore) =>
                !('errors' in explore) &&
                explore.name === '__preagg__myTable__rollup',
        ) as Explore;

        expect(baseExplore).toBeDefined();
        expect(preAggregateExplore).toBeDefined();
        expect(preAggregateExplore.type).toBe(ExploreType.PRE_AGGREGATE);
        expect(preAggregateExplore.joinedTables).toEqual([]);
        expect(preAggregateExplore.preAggregates).toEqual([]);
        expect(
            preAggregateExplore.tables[preAggregateExplore.baseTable].sqlTable,
        ).toBe(PRE_AGGREGATE_MATERIALIZED_TABLE_PLACEHOLDER);
    });

    it('generates an internal pre-aggregate explore for average metrics without warnings', async () => {
        process.env.PRE_AGGREGATES_ENABLED = 'true';

        const explores = await convertExplores(
            [
                {
                    ...MODEL_WITH_DEFAULT_SHOW_UNDERLYING_VALUES,
                    meta: {
                        ...MODEL_WITH_DEFAULT_SHOW_UNDERLYING_VALUES.meta,
                        pre_aggregates: [
                            {
                                name: 'avg_rollup',
                                dimensions: ['user_id'],
                                metrics: ['average_revenue'],
                            },
                        ],
                    },
                },
            ],
            false,
            SupportedDbtAdapter.POSTGRES,
            [],
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
            { postProcessors: [preAggregatePostProcessor] },
        );

        expect(explores).toHaveLength(2);

        const baseExplore = explores.find(
            (explore) => !('errors' in explore) && explore.name === 'myTable',
        ) as Explore;
        const preAggregateExplore = explores.find(
            (explore) =>
                !('errors' in explore) &&
                explore.name === '__preagg__myTable__avg_rollup',
        ) as Explore;

        expect(baseExplore).toBeDefined();
        expect(preAggregateExplore).toBeDefined();
        expect(baseExplore.warnings).toBeUndefined();
        expect(
            preAggregateExplore.tables.myTable.metrics.average_revenue
                .compiledSql,
        ).toBe(
            'CAST(SUM(myTable.myTable_average_revenue__sum) AS DOUBLE) / CAST(NULLIF(SUM(myTable.myTable_average_revenue__count), 0) AS DOUBLE)',
        );
    });

    it('does not generate pre-aggregate explores for additional explores', async () => {
        process.env.PRE_AGGREGATES_ENABLED = 'true';

        const explores = await convertExplores(
            [
                {
                    ...MODEL_WITH_METRIC,
                    meta: {
                        pre_aggregates: [
                            {
                                name: 'rollup',
                                dimensions: ['user_id'],
                                metrics: [
                                    'myTable_total_num_participating_athletes',
                                ],
                            },
                        ],
                        explores: {
                            myTable_with_custom_dims: {
                                label: 'MyTable with Custom Dims',
                                additional_dimensions: {
                                    athlete_band: {
                                        type: DimensionType.STRING,
                                        sql: "CASE WHEN ${myTable.num_participating_athletes} > 10 THEN 'high' ELSE 'low' END",
                                    },
                                },
                            },
                        },
                    },
                },
            ],
            false,
            SupportedDbtAdapter.POSTGRES,
            [],
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
            { postProcessors: [preAggregatePostProcessor] },
        );

        expect(explores).toHaveLength(3);
        expect(
            explores.filter(
                (explore) =>
                    !('errors' in explore) &&
                    explore.type === ExploreType.PRE_AGGREGATE,
            ),
        ).toHaveLength(1);
        expect(explores).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'myTable' }),
                expect.objectContaining({ name: 'myTable_with_custom_dims' }),
                expect.objectContaining({
                    name: '__preagg__myTable__rollup',
                }),
            ]),
        );
        expect(explores).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: '__preagg__myTable_with_custom_dims__rollup',
                }),
            ]),
        );
    });

    it('keeps the base explore when pre-aggregate generation fails', async () => {
        process.env.PRE_AGGREGATES_ENABLED = 'true';

        const explores = await convertExplores(
            [
                {
                    ...MODEL_WITH_METRIC,
                    meta: {
                        pre_aggregates: [
                            {
                                name: 'broken_rollup',
                                dimensions: ['user_id'],
                                metrics: ['myTable_missing_metric'],
                            },
                        ],
                    },
                },
            ],
            false,
            SupportedDbtAdapter.POSTGRES,
            [],
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
            { postProcessors: [preAggregatePostProcessor] },
        );

        expect(explores).toHaveLength(1);
        expect((explores[0] as Explore).name).toBe('myTable');
        expect(
            (explores[0] as Explore).warnings?.some(
                (warning) => warning.type === InlineErrorType.FIELD_ERROR,
            ),
        ).toBe(true);
    });

    it('surfaces unsupported pre-aggregate metric types in explore warnings', async () => {
        process.env.PRE_AGGREGATES_ENABLED = 'true';

        const explores = await convertExplores(
            [
                {
                    ...MODEL_WITH_METRIC,
                    meta: {
                        pre_aggregates: [
                            {
                                name: 'broken_rollup',
                                dimensions: ['user_id'],
                                metrics: ['myTable_user_count'],
                            },
                        ],
                    },
                },
            ],
            false,
            SupportedDbtAdapter.POSTGRES,
            [],
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            },
            { postProcessors: [preAggregatePostProcessor] },
        );

        expect(explores).toHaveLength(1);
        expect((explores[0] as Explore).name).toBe('myTable');
        expect((explores[0] as Explore).warnings).toContainEqual({
            type: InlineErrorType.FIELD_ERROR,
            message:
                'Pre-aggregate "broken_rollup" references unsupported metrics: "myTable_user_count" (count_distinct). Supported metric types: sum, count, min, max, average',
        });
    });
});
