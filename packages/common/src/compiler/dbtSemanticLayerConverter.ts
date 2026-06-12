import merge from 'lodash/merge';
import {
    type DbtColumnLightdashDimension,
    type DbtModelColumn,
    type DbtModelLightdashConfig,
    type DbtModelLightdashMetric,
    type DbtRawModelNode,
} from '../types/dbt';
import {
    type DbtSemanticLayerMetric,
    type DbtSemanticModel,
    type DbtSemanticModelDimension,
    type DbtSemanticModelDimensionGranularity,
    type DbtSemanticModelMeasure,
} from '../types/dbtSemanticLayer';
import { DimensionType, MetricType } from '../types/field';
import { TimeFrames } from '../types/timeFrames';

export type SemanticLayerConversionWarning = {
    modelName?: string;
    subject?: string;
    message: string;
};

const VALID_NAME_REGEX = /^[a-zA-Z0-9_]+$/;

const GRANULARITY_TO_TIMEFRAME: Record<
    DbtSemanticModelDimensionGranularity,
    TimeFrames
> = {
    nanosecond: TimeFrames.MILLISECOND,
    microsecond: TimeFrames.MILLISECOND,
    millisecond: TimeFrames.MILLISECOND,
    second: TimeFrames.SECOND,
    minute: TimeFrames.MINUTE,
    hour: TimeFrames.HOUR,
    day: TimeFrames.DAY,
    week: TimeFrames.WEEK,
    month: TimeFrames.MONTH,
    quarter: TimeFrames.QUARTER,
    year: TimeFrames.YEAR,
};

const SUB_DAY_GRANULARITIES: DbtSemanticModelDimensionGranularity[] = [
    'nanosecond',
    'microsecond',
    'millisecond',
    'second',
    'minute',
    'hour',
];

const MEASURE_AGG_TO_METRIC_TYPE: Record<string, MetricType> = {
    sum: MetricType.SUM,
    min: MetricType.MIN,
    max: MetricType.MAX,
    average: MetricType.AVERAGE,
    count: MetricType.COUNT,
    count_distinct: MetricType.COUNT_DISTINCT,
    median: MetricType.MEDIAN,
    percentile: MetricType.PERCENTILE,
};

// Same heuristic as convertDbtMetricToLightdashMetric: a bare column name is
// prefixed with ${TABLE}, anything else is treated as raw SQL.
const sqlFromExpr = (
    expr: string | null | undefined,
    fallbackColumnName: string,
): string => {
    if (!expr) {
        // eslint-disable-next-line no-useless-escape
        return `\$\{TABLE\}.${fallbackColumnName}`;
    }
    if (VALID_NAME_REGEX.test(expr)) {
        // eslint-disable-next-line no-useless-escape
        return `\$\{TABLE\}.${expr}`;
    }
    return expr;
};

type SynthesizedModel = {
    meta: Partial<DbtModelLightdashConfig>;
    columns: Record<string, DbtColumnLightdashDimension>;
};

const findTimeDimensionInterval = (
    semanticModel: DbtSemanticModel,
    dimensionName: string,
): TimeFrames => {
    const dimension = semanticModel.dimensions.find(
        (d) => d.name === dimensionName,
    );
    const granularity = dimension?.type_params?.time_granularity;
    return granularity ? GRANULARITY_TO_TIMEFRAME[granularity] : TimeFrames.DAY;
};

const convertSemanticModelDimension = (
    dimension: DbtSemanticModelDimension,
): DbtColumnLightdashDimension => {
    const config: DbtColumnLightdashDimension = {
        ...(dimension.label ? { label: dimension.label } : {}),
        ...(dimension.description
            ? { description: dimension.description }
            : {}),
        ...(dimension.config?.meta?.group_label
            ? { group_label: dimension.config.meta.group_label }
            : {}),
        ...(dimension.config?.meta?.hidden ? { hidden: true } : {}),
    };
    if (dimension.expr && dimension.expr !== dimension.name) {
        config.sql = sqlFromExpr(dimension.expr, dimension.name);
    }
    if (dimension.type === 'time') {
        const granularity = dimension.type_params?.time_granularity ?? 'day';
        config.type = SUB_DAY_GRANULARITIES.includes(granularity)
            ? DimensionType.TIMESTAMP
            : DimensionType.DATE;
    }
    return config;
};

const convertMeasureToMetric = (
    semanticModel: DbtSemanticModel,
    measure: DbtSemanticModelMeasure,
    warnings: SemanticLayerConversionWarning[],
): DbtModelLightdashMetric | undefined => {
    const type = MEASURE_AGG_TO_METRIC_TYPE[measure.agg];
    if (!type) {
        warnings.push({
            modelName: semanticModel.name,
            subject: measure.name,
            message: `Measure "${measure.name}" has aggregation "${measure.agg}" which is not supported by Lightdash. Skipping.`,
        });
        return undefined;
    }
    const aggTimeDimension =
        measure.agg_time_dimension ??
        semanticModel.defaults?.agg_time_dimension;
    if (measure.agg_params?.use_discrete_percentile) {
        warnings.push({
            modelName: semanticModel.name,
            subject: measure.name,
            message: `Measure "${measure.name}" uses discrete percentile, which Lightdash does not support. Using continuous percentile instead.`,
        });
    }
    return {
        type,
        sql: sqlFromExpr(measure.expr, measure.name),
        ...(measure.label ? { label: measure.label } : {}),
        ...(measure.description ? { description: measure.description } : {}),
        ...(measure.config?.meta?.group_label
            ? { group_label: measure.config.meta.group_label }
            : {}),
        ...(measure.config?.meta?.hidden ? { hidden: true } : {}),
        ...(type === MetricType.PERCENTILE
            ? // MetricFlow percentile is a 0-1 fraction, Lightdash is 0-100
              { percentile: (measure.agg_params?.percentile ?? 0.5) * 100 }
            : {}),
        ...(aggTimeDimension
            ? {
                  default_time_dimension: {
                      field: aggTimeDimension,
                      interval: findTimeDimensionInterval(
                          semanticModel,
                          aggTimeDimension,
                      ),
                  },
              }
            : {}),
    };
};

const findUserColumnMetricNames = (model: DbtRawModelNode): Set<string> =>
    new Set(
        Object.values(model.columns ?? {}).flatMap((column) => [
            ...Object.keys(column.meta?.metrics ?? {}),
            ...Object.keys(column.config?.meta?.metrics ?? {}),
        ]),
    );

/**
 * Converts dbt semantic layer (MetricFlow) semantic models and metrics into
 * equivalent Lightdash meta config, merged into the dbt model nodes so the
 * existing translator pipeline compiles them. Semantic layer config wins over
 * existing Lightdash meta config on name conflicts.
 */
export const applyDbtSemanticLayerToModels = <T extends DbtRawModelNode>(
    models: T[],
    semanticModels: DbtSemanticModel[],
    slMetrics: DbtSemanticLayerMetric[],
): { models: T[]; warnings: SemanticLayerConversionWarning[] } => {
    const warnings: SemanticLayerConversionWarning[] = [];

    const modelsByUniqueId = new Map(models.map((m) => [m.unique_id, m]));
    const modelsByName = new Map(models.map((m) => [m.name, m]));

    // modelName (Lightdash table) -> synthesized config to merge in
    const synthesized = new Map<string, SynthesizedModel>();
    // measure name -> location + converted metric (measure names are unique project-wide)
    const measures = new Map<
        string,
        {
            semanticModel: DbtSemanticModel;
            measure: DbtSemanticModelMeasure;
            metric: DbtModelLightdashMetric | undefined;
            modelName: string;
        }
    >();
    // emitted metric name -> model it was emitted on
    const emittedMetrics = new Map<string, string>();

    const getSynthesized = (modelName: string): SynthesizedModel => {
        const existing = synthesized.get(modelName);
        if (existing) return existing;
        const created: SynthesizedModel = { meta: {}, columns: {} };
        synthesized.set(modelName, created);
        return created;
    };

    const emitMetric = (
        modelName: string,
        name: string,
        metric: DbtModelLightdashMetric,
    ) => {
        if (!VALID_NAME_REGEX.test(name)) {
            warnings.push({
                modelName,
                subject: name,
                message: `Metric name "${name}" contains unsupported characters. Skipping.`,
            });
            return;
        }
        const target = getSynthesized(modelName);
        target.meta.metrics = { ...target.meta.metrics, [name]: metric };
        emittedMetrics.set(name, modelName);
    };

    semanticModels.forEach((semanticModel) => {
        const dependsOnNode = semanticModel.depends_on?.nodes?.[0];
        const refName = semanticModel.model.match(/ref\(['"](.+?)['"]\)/)?.[1];
        const model =
            (dependsOnNode && modelsByUniqueId.get(dependsOnNode)) ||
            (refName && modelsByName.get(refName)) ||
            undefined;
        if (!model) {
            // Normal when compiling with model selectors
            return;
        }

        const target = getSynthesized(model.name);
        if (semanticModel.label) {
            target.meta.label = semanticModel.label;
        }
        if (semanticModel.defaults?.agg_time_dimension) {
            target.meta.default_time_dimension = {
                field: semanticModel.defaults.agg_time_dimension,
                interval: findTimeDimensionInterval(
                    semanticModel,
                    semanticModel.defaults.agg_time_dimension,
                ),
            };
        }

        semanticModel.entities
            .filter((entity) => entity.type === 'primary')
            .forEach((entity) => {
                const columnName =
                    entity.expr && VALID_NAME_REGEX.test(entity.expr)
                        ? entity.expr
                        : entity.name;
                if (!VALID_NAME_REGEX.test(columnName)) {
                    warnings.push({
                        modelName: model.name,
                        subject: entity.name,
                        message: `Entity "${entity.name}" has a name with unsupported characters. Skipping.`,
                    });
                    return;
                }
                target.columns[columnName] = {
                    hidden: true,
                    ...(entity.label ? { label: entity.label } : {}),
                    ...(entity.description
                        ? { description: entity.description }
                        : {}),
                    ...(entity.config?.meta?.group_label
                        ? { group_label: entity.config.meta.group_label }
                        : {}),
                    ...(entity.expr && !VALID_NAME_REGEX.test(entity.expr)
                        ? { sql: entity.expr }
                        : {}),
                };
            });

        semanticModel.dimensions.forEach((dimension) => {
            if (!VALID_NAME_REGEX.test(dimension.name)) {
                warnings.push({
                    modelName: model.name,
                    subject: dimension.name,
                    message: `Dimension "${dimension.name}" has a name with unsupported characters. Skipping.`,
                });
                return;
            }
            target.columns[dimension.name] =
                convertSemanticModelDimension(dimension);
        });

        semanticModel.measures.forEach((measure) => {
            const metric = convertMeasureToMetric(
                semanticModel,
                measure,
                warnings,
            );
            measures.set(measure.name, {
                semanticModel,
                measure,
                metric,
                modelName: model.name,
            });
            if (measure.create_metric && metric) {
                emitMetric(model.name, measure.name, metric);
            }
        });
    });

    // Resolve a metric input (by name) to a metric emitted on a model. Inputs
    // can reference metrics (already emitted) or fall back to a measure, which
    // is then emitted as a hidden building-block metric.
    const resolveMetricInput = (inputName: string): string | undefined => {
        const emittedOn = emittedMetrics.get(inputName);
        if (emittedOn) return emittedOn;
        const measureEntry = measures.get(inputName);
        if (measureEntry?.metric) {
            emitMetric(measureEntry.modelName, inputName, {
                ...measureEntry.metric,
                hidden: true,
            });
            return measureEntry.modelName;
        }
        return undefined;
    };

    slMetrics.forEach((slMetric) => {
        const warn = (message: string, modelName?: string) =>
            warnings.push({ modelName, subject: slMetric.name, message });

        if (slMetric.filter && slMetric.filter.where_filters.length > 0) {
            warn(
                `Metric "${slMetric.name}" has a filter, which is not supported yet. The metric is converted without it.`,
            );
        }

        switch (slMetric.type) {
            case 'simple': {
                const measureName = slMetric.type_params.measure?.name;
                const measureEntry = measureName
                    ? measures.get(measureName)
                    : undefined;
                if (!measureEntry?.metric) {
                    if (measureName && !measures.has(measureName)) {
                        // Measure's semantic model not in the compiled selection
                        return;
                    }
                    warn(
                        `Simple metric "${slMetric.name}" references measure "${measureName}" which could not be converted. Skipping.`,
                    );
                    return;
                }
                emitMetric(measureEntry.modelName, slMetric.name, {
                    ...measureEntry.metric,
                    ...(slMetric.label ? { label: slMetric.label } : {}),
                    ...(slMetric.description
                        ? { description: slMetric.description }
                        : {}),
                    ...(slMetric.config?.meta?.group_label
                        ? { group_label: slMetric.config.meta.group_label }
                        : {}),
                    ...(slMetric.config?.meta?.hidden ? { hidden: true } : {}),
                });
                break;
            }
            case 'ratio': {
                const numeratorName = slMetric.type_params.numerator?.name;
                const denominatorName = slMetric.type_params.denominator?.name;
                if (!numeratorName || !denominatorName) {
                    warn(
                        `Ratio metric "${slMetric.name}" is missing a numerator or denominator. Skipping.`,
                    );
                    return;
                }
                const numeratorModel = resolveMetricInput(numeratorName);
                const denominatorModel = resolveMetricInput(denominatorName);
                if (!numeratorModel || !denominatorModel) {
                    warn(
                        `Ratio metric "${slMetric.name}" references "${
                            numeratorModel ? denominatorName : numeratorName
                        }" which could not be resolved to a converted metric. Skipping.`,
                    );
                    return;
                }
                if (numeratorModel !== denominatorModel) {
                    warn(
                        `Ratio metric "${slMetric.name}" references metrics from different models, which is not supported. Skipping.`,
                        numeratorModel,
                    );
                    return;
                }
                const denominator =
                    measures.get(denominatorName)?.metric ??
                    getSynthesized(numeratorModel).meta.metrics?.[
                        denominatorName
                    ];
                emitMetric(numeratorModel, slMetric.name, {
                    type: MetricType.NUMBER,
                    // eslint-disable-next-line no-useless-escape
                    sql: `\$\{${numeratorName}\} / NULLIF(\$\{${denominatorName}\}, 0)`,
                    ...(slMetric.label ? { label: slMetric.label } : {}),
                    ...(slMetric.description
                        ? { description: slMetric.description }
                        : {}),
                    ...(slMetric.config?.meta?.group_label
                        ? { group_label: slMetric.config.meta.group_label }
                        : {}),
                    ...(slMetric.config?.meta?.hidden ? { hidden: true } : {}),
                    ...(denominator?.default_time_dimension
                        ? {
                              default_time_dimension:
                                  denominator.default_time_dimension,
                          }
                        : {}),
                });
                break;
            }
            default:
                warn(
                    `Metric "${slMetric.name}" has type "${slMetric.type}" which is not supported yet. Skipping.`,
                );
        }
    });

    const convertedModels = models.map((model) => {
        const synthesizedModel = synthesized.get(model.name);
        if (!synthesizedModel) return model;

        const userColumnMetrics = findUserColumnMetricNames(model);
        Object.keys(synthesizedModel.meta.metrics ?? {}).forEach(
            (metricName) => {
                if (userColumnMetrics.has(metricName)) {
                    warnings.push({
                        modelName: model.name,
                        subject: metricName,
                        message: `Metric "${metricName}" is also defined as a column-level Lightdash metric, which takes priority over the dbt semantic layer version. Remove one of the definitions.`,
                    });
                }
            },
        );

        const columns = { ...model.columns };
        const columnKeysByLowerCase = new Map(
            Object.keys(columns).map((key) => [key.toLowerCase(), key]),
        );
        Object.entries(synthesizedModel.columns).forEach(
            ([columnName, dimension]) => {
                const existingKey = columnKeysByLowerCase.get(
                    columnName.toLowerCase(),
                );
                const existing: DbtModelColumn = existingKey
                    ? columns[existingKey]
                    : { name: columnName };
                columns[existingKey ?? columnName] = {
                    ...existing,
                    config: {
                        ...existing.config,
                        meta: merge({}, existing.config?.meta, {
                            dimension,
                        }),
                    },
                };
            },
        );

        // convertTable merges config.meta over meta, so write synthesized
        // config into the highest-priority layer that exists
        if (model.config) {
            return {
                ...model,
                columns,
                config: {
                    ...model.config,
                    meta: merge({}, model.config.meta, synthesizedModel.meta),
                },
            };
        }
        return {
            ...model,
            columns,
            meta: merge({}, model.meta, synthesizedModel.meta),
        };
    });

    return { models: convertedModels, warnings };
};
