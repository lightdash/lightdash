import { ManifestValidator } from '../dbt/validation';
import {
    DbtManifestVersion,
    SupportedDbtAdapter,
    type DbtModelNode,
} from '../types/dbt';
import {
    type DbtSemanticLayerMetric,
    type DbtSemanticModel,
} from '../types/dbtSemanticLayer';
import { DimensionType, MetricType } from '../types/field';
import { DEFAULT_SPOTLIGHT_CONFIG } from '../types/lightdashProjectConfig';
import { TimeFrames } from '../types/timeFrames';
import { applyDbtSemanticLayerToModels } from './dbtSemanticLayerConverter';
import {
    CLAIMS_MODEL,
    CLAIMS_SEMANTIC_MODEL,
    CLEAN_CLAIM_RATE_METRIC,
    SIMPLE_METRIC,
} from './dbtSemanticLayerConverter.mock';
import { convertTable } from './translator';

describe('applyDbtSemanticLayerToModels', () => {
    it('does not change models without a matching semantic model', () => {
        const { models, warnings } = applyDbtSemanticLayerToModels(
            [CLAIMS_MODEL],
            [],
            [],
        );
        expect(models[0]).toBe(CLAIMS_MODEL);
        expect(warnings).toEqual([]);
    });

    it('converts the claims example project', () => {
        const { models, warnings } = applyDbtSemanticLayerToModels(
            [CLAIMS_MODEL],
            [CLAIMS_SEMANTIC_MODEL],
            [CLEAN_CLAIM_RATE_METRIC],
        );
        expect(warnings).toEqual([]);
        const meta = models[0].config?.meta;

        expect(meta?.label).toEqual('Claims');
        expect(meta?.default_time_dimension).toEqual({
            field: 'claim_created_at',
            interval: TimeFrames.DAY,
        });

        expect(models[0].columns.fact_claim_id.config?.meta?.dimension).toEqual(
            {
                hidden: true,
                label: 'Claim',
                description: 'Primary entity for claim-level metrics.',
                group_label: 'Entities',
            },
        );
        expect(
            models[0].columns.clean_claim_category.config?.meta?.dimension,
        ).toEqual({
            label: 'Clean Claim Category',
            description: 'Claim categorization.',
            group_label: 'Claim Details',
        });
        expect(
            models[0].columns.claim_created_at.config?.meta?.dimension,
        ).toEqual({
            label: 'Claim Created',
            group_label: 'Claim Timestamps',
            type: DimensionType.DATE,
        });

        expect(meta?.metrics?.count_distinct_fact_claim_id).toEqual({
            type: MetricType.COUNT_DISTINCT,
            sql: '${TABLE}.fact_claim_id',
            label: 'Count of Distinct Claims',
            description: 'Distinct count of claims.',
            group_label: 'Claim Metrics',
            default_time_dimension: {
                field: 'claim_created_at',
                interval: TimeFrames.DAY,
            },
        });
        expect(meta?.metrics?.clean_claim_distinct_count).toEqual({
            type: MetricType.COUNT_DISTINCT,
            sql: "case when clean_claim_category = 'clean' then fact_claim_id end",
            label: 'Clean Claim Count',
            group_label: 'Clean Claim Metrics',
            default_time_dimension: {
                field: 'claim_adjudication_date',
                interval: TimeFrames.DAY,
            },
        });
        expect(meta?.metrics?.clean_or_dirty_claim_distinct_count).toEqual(
            expect.objectContaining({ hidden: true }),
        );
        expect(meta?.metrics?.clean_claim_rate).toEqual({
            type: MetricType.NUMBER,
            sql: '${clean_claim_distinct_count} / NULLIF(${clean_or_dirty_claim_distinct_count}, 0)',
            label: 'Clean Claim Rate',
            description: 'Percent of clean claims.',
            group_label: 'Clean Claim Metrics',
            default_time_dimension: {
                field: 'claim_adjudication_date',
                interval: TimeFrames.DAY,
            },
        });
    });

    it('matches semantic models by ref name when depends_on is missing', () => {
        const semanticModel: DbtSemanticModel = {
            ...CLAIMS_SEMANTIC_MODEL,
            depends_on: undefined,
        };
        const { models } = applyDbtSemanticLayerToModels(
            [CLAIMS_MODEL],
            [semanticModel],
            [],
        );
        expect(models[0].config?.meta?.label).toEqual('Claims');
    });

    it('writes to model meta when the model has no config block', () => {
        const modelWithoutConfig: DbtModelNode = {
            ...CLAIMS_MODEL,
            config: undefined,
        };
        const { models } = applyDbtSemanticLayerToModels(
            [modelWithoutConfig],
            [CLAIMS_SEMANTIC_MODEL],
            [],
        );
        expect(models[0].config).toBeUndefined();
        expect(models[0].meta.label).toEqual('Claims');
        expect(
            models[0].meta.metrics?.count_distinct_fact_claim_id,
        ).toBeDefined();
    });

    it('semantic layer config wins over existing Lightdash meta on conflicts', () => {
        const modelWithMeta: DbtModelNode = {
            ...CLAIMS_MODEL,
            config: {
                materialized: 'table',
                meta: {
                    label: 'User label',
                    metrics: {
                        count_distinct_fact_claim_id: {
                            type: MetricType.COUNT,
                            sql: '${TABLE}.other_column',
                        },
                        user_metric: {
                            type: MetricType.SUM,
                            sql: '${TABLE}.amount',
                        },
                    },
                },
            },
            columns: {
                clean_claim_category: {
                    name: 'clean_claim_category',
                    meta: {
                        dimension: {
                            label: 'User dimension label',
                            hidden: true,
                        },
                    },
                },
            },
        };
        const { models } = applyDbtSemanticLayerToModels(
            [modelWithMeta],
            [CLAIMS_SEMANTIC_MODEL],
            [],
        );
        const meta = models[0].config?.meta;
        expect(meta?.label).toEqual('Claims');
        expect(meta?.metrics?.count_distinct_fact_claim_id.type).toEqual(
            MetricType.COUNT_DISTINCT,
        );
        expect(meta?.metrics?.count_distinct_fact_claim_id.sql).toEqual(
            '${TABLE}.fact_claim_id',
        );
        // user config not touched by the semantic layer survives
        expect(meta?.metrics?.user_metric).toEqual({
            type: MetricType.SUM,
            sql: '${TABLE}.amount',
        });
        // config.meta.dimension wins over meta.dimension in convertTable; the
        // user's hidden flag survives because the semantic layer doesn't set it
        expect(
            models[0].columns.clean_claim_category.config?.meta?.dimension,
        ).toEqual(expect.objectContaining({ label: 'Clean Claim Category' }));
        expect(
            models[0].columns.clean_claim_category.meta?.dimension?.hidden,
        ).toEqual(true);
    });

    it('matches existing columns case-insensitively', () => {
        const modelWithUpperCaseColumns: DbtModelNode = {
            ...CLAIMS_MODEL,
            columns: {
                CLEAN_CLAIM_CATEGORY: {
                    name: 'CLEAN_CLAIM_CATEGORY',
                    description: 'existing column',
                },
            },
        };
        const { models } = applyDbtSemanticLayerToModels(
            [modelWithUpperCaseColumns],
            [CLAIMS_SEMANTIC_MODEL],
            [],
        );
        expect(models[0].columns.clean_claim_category).toBeUndefined();
        expect(
            models[0].columns.CLEAN_CLAIM_CATEGORY.config?.meta?.dimension
                ?.label,
        ).toEqual('Clean Claim Category');
    });

    it('warns when a user column-level metric collides with a semantic layer metric', () => {
        const modelWithColumnMetric: DbtModelNode = {
            ...CLAIMS_MODEL,
            columns: {
                fact_claim_id: {
                    name: 'fact_claim_id',
                    meta: {
                        metrics: {
                            count_distinct_fact_claim_id: {
                                type: MetricType.COUNT_DISTINCT,
                            },
                        },
                    },
                },
            },
        };
        const { warnings } = applyDbtSemanticLayerToModels(
            [modelWithColumnMetric],
            [CLAIMS_SEMANTIC_MODEL],
            [],
        );
        expect(warnings).toEqual([
            expect.objectContaining({
                subject: 'count_distinct_fact_claim_id',
            }),
        ]);
    });

    it('converts simple metrics by folding the referenced measure', () => {
        const { models, warnings } = applyDbtSemanticLayerToModels(
            [CLAIMS_MODEL],
            [CLAIMS_SEMANTIC_MODEL],
            [SIMPLE_METRIC],
        );
        expect(warnings).toEqual([]);
        expect(models[0].config?.meta?.metrics?.total_claims).toEqual({
            type: MetricType.COUNT_DISTINCT,
            sql: '${TABLE}.fact_claim_id',
            label: 'Total Claims',
            description: 'All claims ever.',
            group_label: 'Claim Metrics',
            default_time_dimension: {
                field: 'claim_created_at',
                interval: TimeFrames.DAY,
            },
        });
    });

    it('emits non-created measures referenced by a ratio as hidden metrics', () => {
        const semanticModel: DbtSemanticModel = {
            ...CLAIMS_SEMANTIC_MODEL,
            measures: CLAIMS_SEMANTIC_MODEL.measures.map((measure) => ({
                ...measure,
                create_metric:
                    measure.name !== 'clean_or_dirty_claim_distinct_count',
                config:
                    measure.name === 'clean_or_dirty_claim_distinct_count'
                        ? { meta: {} }
                        : measure.config,
            })),
        };
        const { models, warnings } = applyDbtSemanticLayerToModels(
            [CLAIMS_MODEL],
            [semanticModel],
            [CLEAN_CLAIM_RATE_METRIC],
        );
        expect(warnings).toEqual([]);
        const metrics = models[0].config?.meta?.metrics;
        expect(metrics?.clean_or_dirty_claim_distinct_count.hidden).toEqual(
            true,
        );
        expect(metrics?.clean_claim_rate).toBeDefined();
    });

    it('maps each measure aggregation to a metric type', () => {
        const semanticModel: DbtSemanticModel = {
            ...CLAIMS_SEMANTIC_MODEL,
            measures: [
                { name: 'm_sum', agg: 'sum', create_metric: true },
                { name: 'm_min', agg: 'min', create_metric: true },
                { name: 'm_max', agg: 'max', create_metric: true },
                { name: 'm_average', agg: 'average', create_metric: true },
                { name: 'm_count', agg: 'count', create_metric: true },
                { name: 'm_median', agg: 'median', create_metric: true },
                {
                    name: 'm_percentile',
                    agg: 'percentile',
                    agg_params: { percentile: 0.9 },
                    create_metric: true,
                },
            ],
        };
        const { models, warnings } = applyDbtSemanticLayerToModels(
            [CLAIMS_MODEL],
            [semanticModel],
            [],
        );
        expect(warnings).toEqual([]);
        const metrics = models[0].config?.meta?.metrics;
        expect(metrics?.m_sum.type).toEqual(MetricType.SUM);
        expect(metrics?.m_min.type).toEqual(MetricType.MIN);
        expect(metrics?.m_max.type).toEqual(MetricType.MAX);
        expect(metrics?.m_average.type).toEqual(MetricType.AVERAGE);
        expect(metrics?.m_count.type).toEqual(MetricType.COUNT);
        expect(metrics?.m_median.type).toEqual(MetricType.MEDIAN);
        expect(metrics?.m_percentile.type).toEqual(MetricType.PERCENTILE);
        // MetricFlow percentile is 0-1, Lightdash is 0-100
        expect(metrics?.m_percentile.percentile).toEqual(90);
        // measures without their own agg_time_dimension inherit the model default
        expect(metrics?.m_sum.default_time_dimension).toEqual({
            field: 'claim_created_at',
            interval: TimeFrames.DAY,
        });
    });

    it('skips sum_boolean measures with a warning', () => {
        const semanticModel: DbtSemanticModel = {
            ...CLAIMS_SEMANTIC_MODEL,
            measures: [
                { name: 'm_bool', agg: 'sum_boolean', create_metric: true },
            ],
        };
        const { models, warnings } = applyDbtSemanticLayerToModels(
            [CLAIMS_MODEL],
            [semanticModel],
            [],
        );
        expect(models[0].config?.meta?.metrics?.m_bool).toBeUndefined();
        expect(warnings).toEqual([
            expect.objectContaining({ subject: 'm_bool' }),
        ]);
    });

    it('maps time granularities to dimension types and intervals', () => {
        const semanticModel: DbtSemanticModel = {
            ...CLAIMS_SEMANTIC_MODEL,
            defaults: { agg_time_dimension: 'event_hour' },
            dimensions: [
                {
                    name: 'event_hour',
                    type: 'time',
                    type_params: { time_granularity: 'hour' },
                },
                {
                    name: 'event_month',
                    type: 'time',
                    type_params: { time_granularity: 'month' },
                },
                {
                    name: 'event_default',
                    type: 'time',
                },
            ],
            measures: [],
        };
        const { models } = applyDbtSemanticLayerToModels(
            [CLAIMS_MODEL],
            [semanticModel],
            [],
        );
        const { columns } = models[0];
        expect(columns.event_hour.config?.meta?.dimension?.type).toEqual(
            DimensionType.TIMESTAMP,
        );
        expect(columns.event_month.config?.meta?.dimension?.type).toEqual(
            DimensionType.DATE,
        );
        expect(columns.event_default.config?.meta?.dimension?.type).toEqual(
            DimensionType.DATE,
        );
        expect(models[0].config?.meta?.default_time_dimension).toEqual({
            field: 'event_hour',
            interval: TimeFrames.HOUR,
        });
    });

    it('sets dimension sql when expr differs from the dimension name', () => {
        const semanticModel: DbtSemanticModel = {
            ...CLAIMS_SEMANTIC_MODEL,
            dimensions: [
                {
                    name: 'category_upper',
                    type: 'categorical',
                    expr: 'UPPER(clean_claim_category)',
                },
                {
                    name: 'category_alias',
                    type: 'categorical',
                    expr: 'clean_claim_category',
                },
            ],
            measures: [],
        };
        const { models } = applyDbtSemanticLayerToModels(
            [CLAIMS_MODEL],
            [semanticModel],
            [],
        );
        expect(
            models[0].columns.category_upper.config?.meta?.dimension?.sql,
        ).toEqual('UPPER(clean_claim_category)');
        expect(
            models[0].columns.category_alias.config?.meta?.dimension?.sql,
        ).toEqual('${TABLE}.clean_claim_category');
    });

    it('skips unsupported metric types with a warning', () => {
        const unsupportedMetrics: DbtSemanticLayerMetric[] = [
            {
                unique_id: 'metric.project.cumulative_claims',
                name: 'cumulative_claims',
                type: 'cumulative',
                type_params: {
                    measure: { name: 'count_distinct_fact_claim_id' },
                },
            },
            {
                unique_id: 'metric.project.derived_claims',
                name: 'derived_claims',
                type: 'derived',
                type_params: {},
            },
        ];
        const { models, warnings } = applyDbtSemanticLayerToModels(
            [CLAIMS_MODEL],
            [CLAIMS_SEMANTIC_MODEL],
            unsupportedMetrics,
        );
        const metrics = models[0].config?.meta?.metrics;
        expect(metrics?.cumulative_claims).toBeUndefined();
        expect(metrics?.derived_claims).toBeUndefined();
        expect(warnings).toEqual([
            expect.objectContaining({ subject: 'cumulative_claims' }),
            expect.objectContaining({ subject: 'derived_claims' }),
        ]);
    });

    it('warns about metric filters but still converts the metric', () => {
        const metricWithFilter: DbtSemanticLayerMetric = {
            ...SIMPLE_METRIC,
            filter: {
                where_filters: [
                    { where_sql_template: "{{ Dimension('x') }} = 'y'" },
                ],
            },
        };
        const { models, warnings } = applyDbtSemanticLayerToModels(
            [CLAIMS_MODEL],
            [CLAIMS_SEMANTIC_MODEL],
            [metricWithFilter],
        );
        expect(models[0].config?.meta?.metrics?.total_claims).toBeDefined();
        expect(warnings).toEqual([
            expect.objectContaining({ subject: 'total_claims' }),
        ]);
    });

    it('skips ratio metrics whose inputs are on different models', () => {
        const otherModel: DbtModelNode = {
            ...CLAIMS_MODEL,
            unique_id: 'model.project.other_model',
            name: 'other_model',
        };
        const otherSemanticModel: DbtSemanticModel = {
            ...CLAIMS_SEMANTIC_MODEL,
            unique_id: 'semantic_model.project.other_model',
            name: 'other_model',
            model: "ref('other_model')",
            depends_on: { nodes: ['model.project.other_model'] },
            dimensions: [],
            entities: [],
            measures: [
                {
                    name: 'other_count',
                    agg: 'count',
                    create_metric: true,
                },
            ],
        };
        const crossModelRatio: DbtSemanticLayerMetric = {
            ...CLEAN_CLAIM_RATE_METRIC,
            name: 'cross_model_ratio',
            type_params: {
                numerator: { name: 'clean_claim_distinct_count' },
                denominator: { name: 'other_count' },
            },
        };
        const { models, warnings } = applyDbtSemanticLayerToModels(
            [CLAIMS_MODEL, otherModel],
            [CLAIMS_SEMANTIC_MODEL, otherSemanticModel],
            [crossModelRatio],
        );
        expect(
            models[0].config?.meta?.metrics?.cross_model_ratio,
        ).toBeUndefined();
        expect(warnings).toEqual([
            expect.objectContaining({ subject: 'cross_model_ratio' }),
        ]);
    });

    it('produces models that pass Lightdash schema validation and compile to a table', () => {
        const { models } = applyDbtSemanticLayerToModels(
            [CLAIMS_MODEL],
            [CLAIMS_SEMANTIC_MODEL],
            [CLEAN_CLAIM_RATE_METRIC],
        );

        const validator = new ManifestValidator(DbtManifestVersion.V12);
        const [isValid, error] = validator.isModelValid(models[0]);
        expect(error).toBeUndefined();
        expect(isValid).toEqual(true);

        const table = convertTable(
            SupportedDbtAdapter.POSTGRES,
            models[0],
            [],
            DEFAULT_SPOTLIGHT_CONFIG,
        );
        expect(table.label).toEqual('Claims');
        expect(table.defaultTimeDimension).toEqual({
            field: 'claim_created_at',
            interval: TimeFrames.DAY,
        });
        expect(Object.keys(table.metrics).sort()).toEqual([
            'clean_claim_distinct_count',
            'clean_claim_rate',
            'clean_or_dirty_claim_distinct_count',
            'count_distinct_fact_claim_id',
            'dirty_claim_distinct_count',
        ]);
        expect(table.metrics.clean_claim_rate.type).toEqual(MetricType.NUMBER);
        expect(
            table.metrics.clean_or_dirty_claim_distinct_count.hidden,
        ).toEqual(true);
        expect(table.dimensions.fact_claim_id.hidden).toEqual(true);
        expect(table.dimensions.claim_created_at.type).toEqual(
            DimensionType.DATE,
        );
        // interval dimensions generated from the date type
        expect(table.dimensions.claim_created_at_day).toBeDefined();
    });
});
