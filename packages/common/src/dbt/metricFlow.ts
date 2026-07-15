import { type AnyType } from '../types/any';
import { type DbtModelLightdashMetric } from '../types/dbt';
import {
    MetricFlowAggregation,
    type DbtSemanticFilter,
    type DbtSemanticMeasure,
    type DbtSemanticMetric,
    type DbtSemanticMetricInput,
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
    // sum_boolean has no Lightdash metric type; it compiles to a sum over a
    // CASE WHEN that maps the boolean to 1/0 (see measureSql).
    [MetricFlowAggregation.SUM_BOOLEAN]: MetricType.SUM,
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
 * through verbatim. `sum_boolean` maps the boolean expression to 1/0 so it can
 * compile as a plain `sum`.
 */
const measureSql = (measure: DbtSemanticMeasure): string => {
    const expr = measure.expr ?? measure.name;
    const qualified = SIMPLE_COLUMN_REGEX.test(expr)
        ? `\${TABLE}.${expr}`
        : expr;
    if (measure.agg === MetricFlowAggregation.SUM_BOOLEAN) {
        return `CASE WHEN (${qualified}) THEN 1 ELSE 0 END`;
    }
    return qualified;
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

/**
 * Extract the raw where-filter SQL templates from a manifest `filter:` value.
 * Both dbt Core and Fusion normalise the YAML string into
 * `{ where_filters: [{ where_sql_template }] }`; a plain string is accepted
 * too. Returns null when the shape is unrecognisable.
 */
const extractWhereTemplates = (filter: DbtSemanticFilter): string[] | null => {
    if (filter === null || filter === undefined) {
        return [];
    }
    if (typeof filter === 'string') {
        return [filter];
    }
    if (typeof filter === 'object' && Array.isArray(filter.where_filters)) {
        const templates: string[] = [];
        const allValid = filter.where_filters.every((whereFilter) => {
            const template = whereFilter?.where_sql_template;
            if (typeof template !== 'string') {
                return false;
            }
            templates.push(template);
            return true;
        });
        return allValid ? templates : null;
    }
    return null;
};

/**
 * Resolve a MetricFlow dimension reference path (`entity__dimension`) against
 * a semantic model, returning the SQL for the dimension. Only same-model
 * references resolve: the entity and the dimension must both live on the given
 * semantic model. Entity and dimension names may themselves contain `__`, so
 * every split point is tried. Cross-model references (the entity resolves to
 * another semantic model) and time-granularity suffixes fail to resolve.
 */
const resolveDimensionSql = (
    path: string,
    semanticModel: DbtSemanticModel,
): string | null => {
    const entities = Array.isArray(semanticModel.entities)
        ? semanticModel.entities
        : [];
    const dimensions = Array.isArray(semanticModel.dimensions)
        ? semanticModel.dimensions
        : [];
    const parts = path.split('__');
    for (let i = 1; i < parts.length; i += 1) {
        const entityName = parts.slice(0, i).join('__');
        const dimensionName = parts.slice(i).join('__');
        if (entities.some((entity) => entity.name === entityName)) {
            const dimension = dimensions.find(
                (candidate) => candidate.name === dimensionName,
            );
            if (dimension) {
                const expr = dimension.expr ?? dimension.name;
                return SIMPLE_COLUMN_REGEX.test(expr)
                    ? `\${TABLE}.${expr}`
                    : `(${expr})`;
            }
        }
    }
    return null;
};

const DIMENSION_REF_REGEX =
    /\{\{\s*Dimension\(\s*(['"])([^'"]*)\1\s*\)\s*\}\}/g;
const JINJA_RESIDUE_REGEX = /\{\{|\{%/;

type FilterTranslation = { conditions: string[] } | { error: string };

/**
 * Translate MetricFlow where-filters into plain SQL conditions against a
 * single semantic model. `{{ Dimension('entity__dim') }}` references are
 * inlined when both the entity and the dimension live on that model; any other
 * template function (TimeDimension, Entity, Metric, …) or a cross-model
 * reference makes the filter untranslatable.
 */
const translateWhereFilters = (
    filters: DbtSemanticFilter[],
    semanticModel: DbtSemanticModel,
): FilterTranslation => {
    const conditions: string[] = [];
    for (let i = 0; i < filters.length; i += 1) {
        const templates = extractWhereTemplates(filters[i]);
        if (templates === null) {
            return { error: 'has a filter in an unrecognised format' };
        }
        for (let j = 0; j < templates.length; j += 1) {
            let unresolvedPath: string | null = null;
            const sql = templates[j]
                .trim()
                .replace(
                    DIMENSION_REF_REGEX,
                    (match: string, _quote: string, path: string) => {
                        const dimensionSql = resolveDimensionSql(
                            path,
                            semanticModel,
                        );
                        if (dimensionSql === null) {
                            unresolvedPath = path;
                            return match;
                        }
                        return dimensionSql;
                    },
                );
            if (unresolvedPath !== null) {
                return {
                    error: `filter references dimension "${unresolvedPath}" which does not resolve on semantic model "${semanticModel.name}" (cross-model filters are not supported)`,
                };
            }
            if (JINJA_RESIDUE_REGEX.test(sql)) {
                return {
                    error: 'filter uses template functions other than Dimension(), which are not supported',
                };
            }
            if (sql.length > 0) {
                conditions.push(sql);
            }
        }
    }
    return { conditions };
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
 * Supported: `simple` metrics and measures flagged `create_metric: true`
 * (including `sum_boolean` and same-model where-filters), plus `ratio` and
 * `derived` metrics whose inputs all resolve to metrics on the same model
 * (compiled to non-aggregate `number` metrics referencing them). Everything
 * else (cumulative / conversion metrics, cross-model inputs, time-offset
 * inputs, cross-model or non-Dimension filters) is skipped with a warning.
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

    // Explicit manifest metrics indexed by name. Measures mirroring one of
    // these are owned by the metrics pass — translating the bare measure would
    // silently drop metric-level config such as filters.
    const metricDefsByName = new Map<string, DbtSemanticMetric>();
    Object.values(metrics)
        .filter(isSemanticMetric)
        .forEach((metric) => metricDefsByName.set(metric.name, metric));

    // Which model each successfully translated metric landed on — ratio and
    // derived metrics reference their inputs through this.
    const modelByTranslatedMetric = new Map<string, string>();

    const addMetric = (
        modelName: string,
        metricName: string,
        definition: DbtModelLightdashMetric,
    ) => {
        if (!metricsByModel[modelName]) {
            metricsByModel[modelName] = {};
        }
        metricsByModel[modelName][metricName] = definition;
        modelByTranslatedMetric.set(metricName, modelName);
    };

    // Build a Lightdash metric definition from a single measure plus optional
    // pre-translated filter conditions. Returns an error description when the
    // measure can't be represented (the caller formats the skip warning).
    const buildMeasureMetric = (
        semanticModel: DbtSemanticModel,
        measure: DbtSemanticMeasure,
        filterConditions: string[],
        overrides: { label?: string | null; description?: string | null },
    ):
        | { modelName: string; definition: DbtModelLightdashMetric }
        | { error: string } => {
        const metricType = MEASURE_AGG_TO_METRIC_TYPE[measure.agg];
        if (!metricType) {
            return {
                error: `measure aggregation "${measure.agg}" is not supported`,
            };
        }

        const modelName = resolveModelName(semanticModel, modelNamesByUniqueId);
        if (!modelName) {
            return {
                error: `could not resolve the dbt model for semantic model "${semanticModel.name}"`,
            };
        }

        const baseSql = measureSql(measure);
        const sql =
            filterConditions.length > 0
                ? `CASE WHEN ${filterConditions
                      .map((condition) => `(${condition})`)
                      .join(' AND ')} THEN (${baseSql}) END`
                : baseSql;

        const definition: DbtModelLightdashMetric = {
            type: metricType,
            sql,
            label: overrides.label ?? measure.label ?? undefined,
            description:
                overrides.description ?? measure.description ?? undefined,
        };

        if (metricType === MetricType.PERCENTILE) {
            const p = measure.agg_params?.percentile;
            if (typeof p !== 'number' || Number.isNaN(p)) {
                // Translating without a value would silently fall back to the
                // warehouse default (p50) — wrong results are worse than a gap.
                return {
                    error: `percentile aggregation requires a numeric agg_params.percentile (got ${JSON.stringify(
                        p,
                    )})`,
                };
            }
            // MetricFlow stores percentile as a 0-1 decimal in the compiled
            // manifest (e.g. 0.95); Lightdash uses a 0-100 scale. The latest
            // YAML spec authors it as 0-100, so accept both: values <= 1 are
            // treated as fractions, anything larger is already a percentage.
            definition.percentile = p <= 1 ? p * 100 : p;
        }

        return { modelName, definition };
    };

    // Resolve a simple metric definition to the semantic model + measure it
    // aggregates, collecting any filters defined on the metric or its measure
    // reference along the way. Legacy manifests (dbt Core) reference a measure
    // by name; Fusion / latest-spec manifests inline the aggregation as
    // `metric_aggregation_params`.
    const resolveSimpleMetricMeasure = (
        metric: DbtSemanticMetric,
    ):
        | {
              semanticModel: DbtSemanticModel;
              measure: DbtSemanticMeasure;
              filters: DbtSemanticFilter[];
          }
        | { error: string } => {
        const filters: DbtSemanticFilter[] = [];
        if (metric.filter !== null && metric.filter !== undefined) {
            filters.push(metric.filter);
        }

        const measureRef = metric.type_params.measure;
        const inlineAggParams = metric.type_params.metric_aggregation_params;

        if (measureRef?.name) {
            if (measureRef.filter !== null && measureRef.filter !== undefined) {
                filters.push(measureRef.filter);
            }
            const indexed = measureIndex.get(measureRef.name);
            if (!indexed) {
                return {
                    error: `referenced measure "${measureRef.name}" was not found in any semantic model`,
                };
            }
            return { ...indexed, filters };
        }
        if (inlineAggParams) {
            const semanticModel = semanticModelsByName.get(
                inlineAggParams.semantic_model,
            );
            if (!semanticModel) {
                return {
                    error: `semantic model "${inlineAggParams.semantic_model}" was not found`,
                };
            }
            return {
                semanticModel,
                measure: {
                    name: metric.name,
                    agg: inlineAggParams.agg,
                    expr: inlineAggParams.expr,
                    agg_params: inlineAggParams.agg_params,
                },
                filters,
            };
        }
        return { error: 'no measure reference found' };
    };

    const skip = (metricName: string, reason: string) => {
        warnings.push(`Skipped MetricFlow metric "${metricName}": ${reason}.`);
        skippedCount += 1;
    };

    // 1. Explicit `simple` metrics. Ratio/derived are deferred to pass 3 so
    //    they can reference the metrics translated here.
    const deferredMultiMetricDefs: DbtSemanticMetric[] = [];
    Object.entries(metrics).forEach(([manifestKey, rawMetric]) => {
        if (!isSemanticMetric(rawMetric)) {
            const name =
                typeof rawMetric === 'object' &&
                rawMetric !== null &&
                typeof (rawMetric as { name?: unknown }).name === 'string'
                    ? (rawMetric as { name: string }).name
                    : manifestKey;
            skip(name, 'malformed metric definition in the manifest');
            return;
        }
        const metric = rawMetric;

        if (metric.type === 'ratio' || metric.type === 'derived') {
            deferredMultiMetricDefs.push(metric);
            return;
        }

        if (metric.type !== 'simple') {
            skip(
                metric.name,
                `metric type "${metric.type}" is not supported yet`,
            );
            return;
        }

        const resolved = resolveSimpleMetricMeasure(metric);
        if ('error' in resolved) {
            skip(metric.name, resolved.error);
            return;
        }

        const filterTranslation = translateWhereFilters(
            resolved.filters,
            resolved.semanticModel,
        );
        if ('error' in filterTranslation) {
            skip(metric.name, filterTranslation.error);
            return;
        }

        const built = buildMeasureMetric(
            resolved.semanticModel,
            resolved.measure,
            filterTranslation.conditions,
            { label: metric.label, description: metric.description },
        );
        if ('error' in built) {
            skip(metric.name, built.error);
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
            if (metricDefsByName.has(measure.name)) {
                // An explicit manifest metric owns this name — the metrics
                // pass above already translated or skipped it.
                return;
            }
            const built = buildMeasureMetric(semanticModel, measure, [], {
                label: measure.label,
                description: measure.description,
            });
            if ('error' in built) {
                skip(measure.name, built.error);
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

    // Resolve one ratio/derived input to a `${metric}` reference. Unfiltered
    // inputs point at an already-translated metric; filtered inputs compile
    // the underlying measure with the filter baked in, as a hidden helper
    // metric the visible metric references.
    type ResolvedInput = {
        ref: string;
        modelName: string;
        helper?: { name: string; definition: DbtModelLightdashMetric };
    };
    const resolveMetricInput = (
        parentMetric: DbtSemanticMetric,
        input: DbtSemanticMetricInput,
        helperSuffix: string,
    ): { value: ResolvedInput } | { error: string } => {
        if (typeof input?.name !== 'string' || input.name.length === 0) {
            return { error: 'input metric reference is missing a name' };
        }
        if (input.offset_window || input.offset_to_grain) {
            return {
                error: `input metric "${input.name}" uses offset_window/offset_to_grain, which is not supported`,
            };
        }

        // The parent metric's own filter applies to every input.
        const extraFilters: DbtSemanticFilter[] = [];
        if (parentMetric.filter !== null && parentMetric.filter !== undefined) {
            extraFilters.push(parentMetric.filter);
        }
        if (input.filter !== null && input.filter !== undefined) {
            extraFilters.push(input.filter);
        }

        if (extraFilters.length === 0) {
            const modelName = modelByTranslatedMetric.get(input.name);
            if (!modelName) {
                return {
                    error: `input metric "${input.name}" was not translated to a Lightdash metric`,
                };
            }
            return {
                value: { ref: `\${${input.name}}`, modelName },
            };
        }

        // Filtered input: rebuild the input metric's measure with the filter
        // baked in. Only simple inputs (or bare create_metric measures) work.
        const inputDef = metricDefsByName.get(input.name);
        let resolved: {
            semanticModel: DbtSemanticModel;
            measure: DbtSemanticMeasure;
            filters: DbtSemanticFilter[];
        };
        if (inputDef) {
            if (inputDef.type !== 'simple') {
                return {
                    error: `filtered input metric "${input.name}" is not a simple metric`,
                };
            }
            const resolvedSimple = resolveSimpleMetricMeasure(inputDef);
            if ('error' in resolvedSimple) {
                return {
                    error: `input metric "${input.name}": ${resolvedSimple.error}`,
                };
            }
            resolved = resolvedSimple;
        } else {
            const indexed = measureIndex.get(input.name);
            if (!indexed) {
                return {
                    error: `input metric "${input.name}" was not found in the manifest`,
                };
            }
            resolved = { ...indexed, filters: [] };
        }

        const filterTranslation = translateWhereFilters(
            [...resolved.filters, ...extraFilters],
            resolved.semanticModel,
        );
        if ('error' in filterTranslation) {
            return {
                error: `input metric "${input.name}" ${filterTranslation.error}`,
            };
        }

        const built = buildMeasureMetric(
            resolved.semanticModel,
            resolved.measure,
            filterTranslation.conditions,
            { label: null, description: null },
        );
        if ('error' in built) {
            return { error: `input metric "${input.name}": ${built.error}` };
        }

        const helperName = `${parentMetric.name}_${helperSuffix}`;
        if (
            modelByTranslatedMetric.has(helperName) ||
            metricsByModel[built.modelName]?.[helperName]
        ) {
            return {
                error: `helper metric name "${helperName}" collides with an existing metric`,
            };
        }
        return {
            value: {
                ref: `\${${helperName}}`,
                modelName: built.modelName,
                helper: {
                    name: helperName,
                    definition: {
                        ...built.definition,
                        label: undefined,
                        description: undefined,
                        hidden: true,
                    },
                },
            },
        };
    };

    // Commit a ratio/derived metric plus any hidden helper metrics its inputs
    // needed, after checking every input landed on the same model.
    const commitMultiMetric = (
        metric: DbtSemanticMetric,
        inputs: ResolvedInput[],
        sql: string,
    ): { error: string } | undefined => {
        const modelNames = new Set(inputs.map((input) => input.modelName));
        if (modelNames.size > 1) {
            return {
                error: `its input metrics live on different models (${[
                    ...modelNames,
                ].join(
                    ', ',
                )}); cross-model ${metric.type} metrics are not supported`,
            };
        }
        const [modelName] = [...modelNames];
        inputs.forEach((input) => {
            if (input.helper) {
                addMetric(
                    modelName,
                    input.helper.name,
                    input.helper.definition,
                );
            }
        });
        addMetric(modelName, metric.name, {
            type: MetricType.NUMBER,
            sql,
            label: metric.label ?? undefined,
            description: metric.description ?? undefined,
        });
        translatedCount += 1;
        return undefined;
    };

    const translateMultiMetric = (
        metric: DbtSemanticMetric,
    ): { error: string } | undefined => {
        if (metric.type === 'ratio') {
            const numeratorInput = metric.type_params.numerator;
            const denominatorInput = metric.type_params.denominator;
            if (!numeratorInput?.name || !denominatorInput?.name) {
                return {
                    error: 'ratio metric is missing a numerator or denominator',
                };
            }
            const numerator = resolveMetricInput(
                metric,
                numeratorInput,
                'numerator',
            );
            if ('error' in numerator) {
                return numerator;
            }
            const denominator = resolveMetricInput(
                metric,
                denominatorInput,
                'denominator',
            );
            if ('error' in denominator) {
                return denominator;
            }
            // * 1.0 avoids integer division on warehouses that truncate
            // (Postgres, Trino); NULLIF avoids division-by-zero errors.
            return commitMultiMetric(
                metric,
                [numerator.value, denominator.value],
                `(${numerator.value.ref} * 1.0) / NULLIF(${denominator.value.ref}, 0)`,
            );
        }

        // Derived: an expression over named input metrics.
        const { expr, metrics: inputDefs } = metric.type_params;
        if (
            typeof expr !== 'string' ||
            expr.length === 0 ||
            !Array.isArray(inputDefs) ||
            inputDefs.length === 0
        ) {
            return {
                error: 'derived metric is missing an expr or input metrics',
            };
        }

        const resolvedInputs: { token: string; value: ResolvedInput }[] = [];
        let inputError: string | null = null;
        inputDefs.some((input) => {
            const result = resolveMetricInput(
                metric,
                input,
                input?.alias ?? input?.name ?? 'input',
            );
            if ('error' in result) {
                inputError = result.error;
                return true;
            }
            resolvedInputs.push({
                token: input.alias ?? input.name,
                value: result.value,
            });
            return false;
        });
        if (inputError !== null) {
            return { error: inputError };
        }

        // Rewrite input metric names/aliases in the expression to Lightdash
        // `${metric}` references. Longest tokens first so a name that is a
        // prefix of another can't clobber it.
        const sql = resolvedInputs
            .sort((a, b) => b.token.length - a.token.length)
            .reduce((acc, { token, value }) => {
                const escapedToken = token.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    '\\$&',
                );
                return acc.replace(
                    new RegExp(`\\b${escapedToken}\\b`, 'g'),
                    () => value.ref,
                );
            }, expr.trim());

        return commitMultiMetric(
            metric,
            resolvedInputs.map((input) => input.value),
            sql,
        );
    };

    // 3. Ratio and derived metrics, now that their inputs are translated.
    //    Retried until a fixpoint so chains (a derived metric referencing
    //    another ratio/derived metric) resolve regardless of manifest order.
    let pendingMultiMetrics = deferredMultiMetricDefs;
    const lastMultiMetricErrors = new Map<string, string>();
    let previousPendingCount = Number.POSITIVE_INFINITY;
    while (
        pendingMultiMetrics.length > 0 &&
        pendingMultiMetrics.length < previousPendingCount
    ) {
        previousPendingCount = pendingMultiMetrics.length;
        pendingMultiMetrics = pendingMultiMetrics.filter((metric) => {
            const result = translateMultiMetric(metric);
            if (result === undefined) {
                lastMultiMetricErrors.delete(metric.name);
                return false;
            }
            lastMultiMetricErrors.set(metric.name, result.error);
            return true;
        });
    }
    pendingMultiMetrics.forEach((metric) => {
        skip(
            metric.name,
            lastMultiMetricErrors.get(metric.name) ??
                `metric type "${metric.type}" could not be translated`,
        );
    });

    return { metricsByModel, warnings, translatedCount, skippedCount };
};
