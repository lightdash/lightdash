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
 * Defensive accessor: manifests are external input, so a malformed producer
 * can put a non-array where the schema promises one. Treat that as empty
 * rather than crashing the whole compile.
 */
const measuresOf = (semanticModel: DbtSemanticModel): DbtSemanticMeasure[] =>
    Array.isArray(semanticModel.measures) ? semanticModel.measures : [];

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
    const dependsOnNodes = Array.isArray(semanticModel.depends_on?.nodes)
        ? semanticModel.depends_on.nodes
        : [];
    const modelNodeId = dependsOnNodes.find((node) =>
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
    const semanticModelsByName = new Map<string, DbtSemanticModel>();
    Object.values(semanticModels).forEach((semanticModel) => {
        semanticModelsByName.set(semanticModel.name, semanticModel);
        measuresOf(semanticModel).forEach((measure) => {
            measureIndex.set(measure.name, { semanticModel, measure });
        });
    });

    // Names of explicit manifest metrics. Measures mirroring one of these are
    // owned by the metrics pass below — translating the bare measure would
    // silently drop metric-level config such as filters.
    const manifestMetricNames = new Set(
        Object.values(metrics)
            .filter(isSemanticMetric)
            .map((metric) => metric.name),
    );

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

        if (metricType === MetricType.PERCENTILE) {
            const p = measure.agg_params?.percentile;
            if (typeof p !== 'number' || Number.isNaN(p)) {
                // Translating without a value would silently fall back to the
                // warehouse default (p50) — wrong results are worse than a gap.
                warnings.push(
                    `Skipped MetricFlow metric "${metricName}": percentile aggregation requires a numeric agg_params.percentile (got ${JSON.stringify(
                        p,
                    )}).`,
                );
                return null;
            }
            // MetricFlow stores percentile as a 0-1 decimal in the compiled
            // manifest (e.g. 0.95); Lightdash uses a 0-100 scale. The latest
            // YAML spec authors it as 0-100, so accept both: values <= 1 are
            // treated as fractions, anything larger is already a percentage.
            definition.percentile = p <= 1 ? p * 100 : p;
        }

        return { modelName, definition };
    };

    // 1. Explicit `simple` metrics.
    Object.entries(metrics).forEach(([manifestKey, rawMetric]) => {
        if (!isSemanticMetric(rawMetric)) {
            const name =
                typeof rawMetric === 'object' &&
                rawMetric !== null &&
                typeof (rawMetric as { name?: unknown }).name === 'string'
                    ? (rawMetric as { name: string }).name
                    : manifestKey;
            warnings.push(
                `Skipped MetricFlow metric "${name}": malformed metric definition in the manifest.`,
            );
            skippedCount += 1;
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

        // Resolve the metric to a semantic model + measure. Legacy manifests
        // (dbt Core) reference a measure by name; Fusion / latest-spec
        // manifests inline the aggregation as `metric_aggregation_params`.
        const measureRef = metric.type_params.measure;
        const inlineAggParams = metric.type_params.metric_aggregation_params;

        let resolved: {
            semanticModel: DbtSemanticModel;
            measure: DbtSemanticMeasure;
        } | null = null;

        if (measureRef?.name) {
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
            resolved = indexed;
        } else if (inlineAggParams) {
            const semanticModel = semanticModelsByName.get(
                inlineAggParams.semantic_model,
            );
            if (!semanticModel) {
                warnings.push(
                    `Skipped MetricFlow metric "${metric.name}": semantic model "${inlineAggParams.semantic_model}" was not found.`,
                );
                skippedCount += 1;
                return;
            }
            resolved = {
                semanticModel,
                measure: {
                    name: metric.name,
                    agg: inlineAggParams.agg,
                    expr: inlineAggParams.expr,
                    agg_params: inlineAggParams.agg_params,
                },
            };
        } else {
            warnings.push(
                `Skipped MetricFlow metric "${metric.name}": no measure reference found.`,
            );
            skippedCount += 1;
            return;
        }

        const built = buildMeasureMetric(
            metric.name,
            resolved.semanticModel,
            resolved.measure,
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
        measuresOf(semanticModel).forEach((measure) => {
            if (!measure.create_metric) {
                return;
            }
            if (manifestMetricNames.has(measure.name)) {
                // An explicit manifest metric owns this name — the metrics
                // pass above already translated or skipped it.
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
