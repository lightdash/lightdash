import { type AnyType } from '../types/any';
import { type DbtModelLightdashMetric } from '../types/dbt';
import {
    MetricFlowAggregation,
    type DbtSemanticMeasure,
    type DbtSemanticMetric,
    type DbtSemanticModel,
} from '../types/dbtSemanticLayer';
import { MetricType } from '../types/field';

/**
 * Translation for dbt's MetricFlow semantic layer as it appears in the dbt
 * manifest (`semantic_models` + `metrics`) — no dbt Cloud required.
 *
 * Only a supported subset is translated into Lightdash metrics during CLI
 * deploy/compile; unsupported definitions are skipped and surfaced as warnings.
 * See `translateMetricFlowMetrics`.
 */

const isSemanticMetric = (value: unknown): value is DbtSemanticMetric => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.name === 'string' &&
        typeof candidate.type === 'string' &&
        typeof candidate.type_params === 'object' &&
        candidate.type_params !== null
    );
};

const MEASURE_AGG_TO_METRIC_TYPE: Partial<
    Record<MetricFlowAggregation, MetricType>
> = {
    [MetricFlowAggregation.SUM]: MetricType.SUM,
    [MetricFlowAggregation.MIN]: MetricType.MIN,
    [MetricFlowAggregation.MAX]: MetricType.MAX,
    [MetricFlowAggregation.COUNT_DISTINCT]: MetricType.COUNT_DISTINCT,
    [MetricFlowAggregation.AVERAGE]: MetricType.AVERAGE,
    [MetricFlowAggregation.PERCENTILE]: MetricType.PERCENTILE,
    [MetricFlowAggregation.MEDIAN]: MetricType.MEDIAN,
    [MetricFlowAggregation.COUNT]: MetricType.COUNT,
};

const SIMPLE_COLUMN_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Build the Lightdash metric `sql` for a MetricFlow measure. The measure `expr`
 * (or the measure name when `expr` is null) is SQL evaluated against the
 * underlying model's columns. A bare column reference is qualified with
 * `${TABLE}` so it resolves unambiguously; anything more complex is passed
 * through verbatim.
 */
const measureSql = (measure: DbtSemanticMeasure): string => {
    const expr = measure.expr ?? measure.name;
    return SIMPLE_COLUMN_REGEX.test(expr) ? `\${TABLE}.${expr}` : expr;
};

/**
 * Resolve the Lightdash table (dbt model) name a semantic model targets.
 * Prefers the compiled `model.*` node in `depends_on`, mapped back to the
 * model's `name` via `modelNamesByUniqueId`.
 */
const resolveModelName = (
    semanticModel: DbtSemanticModel,
    modelNamesByUniqueId: Record<string, string>,
): string | null => {
    const modelNodeId = (semanticModel.depends_on?.nodes ?? []).find((node) =>
        node.startsWith('model.'),
    );
    if (modelNodeId && modelNamesByUniqueId[modelNodeId]) {
        return modelNamesByUniqueId[modelNodeId];
    }
    return null;
};

export type TranslateMetricFlowArgs = {
    /** `manifest.semantic_models` */
    semanticModels: Record<string, DbtSemanticModel>;
    /** `manifest.metrics` (MetricFlow-shaped in dbt >= 1.6) */
    metrics: Record<string, AnyType>;
    /** dbt model `unique_id` -> Lightdash table name, for models being deployed. */
    modelNamesByUniqueId: Record<string, string>;
};

export type TranslateMetricFlowResult = {
    /** table name -> metric name -> Lightdash metric definition. */
    metricsByModel: Record<string, Record<string, DbtModelLightdashMetric>>;
    warnings: string[];
    translatedCount: number;
    skippedCount: number;
};

/**
 * Translate supported MetricFlow metric definitions into Lightdash model
 * metrics, grouped by the dbt model they belong to.
 *
 * Supported: `simple` metrics and measures flagged `create_metric: true`, both
 * without filters (Lightdash cannot faithfully represent MetricFlow where
 * filters). Everything else (ratio / derived / cumulative / conversion,
 * filtered metrics, and `sum_boolean` measures) is skipped with a warning.
 */
export const translateMetricFlowMetrics = ({
    semanticModels,
    metrics,
    modelNamesByUniqueId,
}: TranslateMetricFlowArgs): TranslateMetricFlowResult => {
    const warnings: string[] = [];
    const metricsByModel: Record<
        string,
        Record<string, DbtModelLightdashMetric>
    > = {};
    let translatedCount = 0;
    let skippedCount = 0;

    // Index measures by name and remember which semantic model owns each one.
    const measureIndex = new Map<
        string,
        { semanticModel: DbtSemanticModel; measure: DbtSemanticMeasure }
    >();
    Object.values(semanticModels).forEach((semanticModel) => {
        (semanticModel.measures ?? []).forEach((measure) => {
            measureIndex.set(measure.name, { semanticModel, measure });
        });
    });

    const addMetric = (
        modelName: string,
        metricName: string,
        definition: DbtModelLightdashMetric,
    ) => {
        if (!metricsByModel[modelName]) {
            metricsByModel[modelName] = {};
        }
        metricsByModel[modelName][metricName] = definition;
    };

    // Build a Lightdash metric definition from a single measure. Returns null
    // (and records a warning) when the measure can't be represented.
    const buildMeasureMetric = (
        metricName: string,
        semanticModel: DbtSemanticModel,
        measure: DbtSemanticMeasure,
        overrides: { label?: string | null; description?: string | null },
    ): { modelName: string; definition: DbtModelLightdashMetric } | null => {
        const metricType = MEASURE_AGG_TO_METRIC_TYPE[measure.agg];
        if (!metricType) {
            warnings.push(
                `Skipped MetricFlow metric "${metricName}": measure aggregation "${measure.agg}" is not supported.`,
            );
            return null;
        }

        const modelName = resolveModelName(semanticModel, modelNamesByUniqueId);
        if (!modelName) {
            warnings.push(
                `Skipped MetricFlow metric "${metricName}": could not resolve the dbt model for semantic model "${semanticModel.name}".`,
            );
            return null;
        }

        const definition: DbtModelLightdashMetric = {
            type: metricType,
            sql: measureSql(measure),
            label: overrides.label ?? measure.label ?? undefined,
            description:
                overrides.description ?? measure.description ?? undefined,
        };

        if (
            metricType === MetricType.PERCENTILE &&
            typeof measure.agg_params?.percentile === 'number'
        ) {
            // MetricFlow stores percentile as a 0-1 decimal in the compiled
            // manifest (e.g. 0.95); Lightdash uses a 0-100 scale. The latest
            // YAML spec authors it as 0-100, so accept both: values <= 1 are
            // treated as fractions, anything larger is already a percentage.
            const p = measure.agg_params.percentile;
            definition.percentile = p <= 1 ? p * 100 : p;
        }

        return { modelName, definition };
    };

    // 1. Explicit `simple` metrics.
    Object.values(metrics).forEach((rawMetric) => {
        if (!isSemanticMetric(rawMetric)) {
            return;
        }
        const metric = rawMetric;

        if (metric.type !== 'simple') {
            warnings.push(
                `Skipped MetricFlow metric "${metric.name}": metric type "${metric.type}" is not supported yet (only "simple" metrics are translated).`,
            );
            skippedCount += 1;
            return;
        }

        if (metric.filter) {
            warnings.push(
                `Skipped MetricFlow metric "${metric.name}": metric filters cannot be translated to Lightdash metrics.`,
            );
            skippedCount += 1;
            return;
        }

        const measureRef = metric.type_params.measure;
        if (!measureRef?.name) {
            warnings.push(
                `Skipped MetricFlow metric "${metric.name}": no measure reference found.`,
            );
            skippedCount += 1;
            return;
        }

        if (measureRef.filter) {
            warnings.push(
                `Skipped MetricFlow metric "${metric.name}": measure-level filters cannot be translated to Lightdash metrics.`,
            );
            skippedCount += 1;
            return;
        }

        const indexed = measureIndex.get(measureRef.name);
        if (!indexed) {
            warnings.push(
                `Skipped MetricFlow metric "${metric.name}": referenced measure "${measureRef.name}" was not found in any semantic model.`,
            );
            skippedCount += 1;
            return;
        }

        const built = buildMeasureMetric(
            metric.name,
            indexed.semanticModel,
            indexed.measure,
            { label: metric.label, description: metric.description },
        );
        if (!built) {
            skippedCount += 1;
            return;
        }

        addMetric(built.modelName, metric.name, built.definition);
        translatedCount += 1;
    });

    // 2. Measures flagged `create_metric: true` auto-create a metric in
    //    MetricFlow. Translate them too, unless an explicit metric already
    //    claimed the name.
    Object.values(semanticModels).forEach((semanticModel) => {
        (semanticModel.measures ?? []).forEach((measure) => {
            if (!measure.create_metric) {
                return;
            }
            const built = buildMeasureMetric(
                measure.name,
                semanticModel,
                measure,
                { label: measure.label, description: measure.description },
            );
            if (!built) {
                skippedCount += 1;
                return;
            }
            if (metricsByModel[built.modelName]?.[measure.name]) {
                // Already translated as an explicit metric.
                return;
            }
            addMetric(built.modelName, measure.name, built.definition);
            translatedCount += 1;
        });
    });

    return { metricsByModel, warnings, translatedCount, skippedCount };
};
