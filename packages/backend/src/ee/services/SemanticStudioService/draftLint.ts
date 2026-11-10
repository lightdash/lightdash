import {
    MetricType,
    parseModelDocument,
    type DimensionType,
    type LightdashModel,
    type LightdashModelMetric,
} from '@lightdash/common';
import { isEqual } from 'es-toolkit/compat';
import { toModelPath } from './draftFold';

// ponytail: a name match, so a window function reads as an aggregate too; parse the SQL if that turns up.
const AGGREGATE_CALL =
    /\b(sum|count|avg|min|max|median|count_if|approx_count_distinct|percentile_cont|percentile_disc|array_agg|string_agg|listagg)\s*\(/i;

const metricsOf = (model: LightdashModel): [string, LightdashModelMetric][] => [
    ...model.dimensions.flatMap(({ metrics }) => Object.entries(metrics ?? {})),
    ...Object.entries(model.metrics ?? {}),
];

export type ChangedFields = {
    /** Names of the dimensions the write adds or defines differently. */
    dimensions: Set<string>;
    /** Why a metric the write adds or defines differently is not well formed, or null. */
    metricError: string | null;
};

/** What a write to a model adds or defines differently from what is live, so only that is held to the rules for new work. */
export const findChangedFields = (
    name: string,
    contents: string,
    storedContents: string | null,
): ChangedFields => {
    const model = parseModelDocument(contents, toModelPath(name));
    const stored =
        storedContents === null
            ? null
            : parseModelDocument(storedContents, toModelPath(name));
    const storedDimensions = new Map(
        (stored?.dimensions ?? []).map((dimension) => [
            dimension.name,
            dimension,
        ]),
    );
    const storedMetrics = new Map(stored ? metricsOf(stored) : []);
    const selfAggregating = metricsOf(model).find(
        ([metricName, metric]) =>
            metric.type === MetricType.NUMBER &&
            typeof metric.sql === 'string' &&
            AGGREGATE_CALL.test(metric.sql) &&
            !isEqual(storedMetrics.get(metricName), metric),
    );
    return {
        dimensions: new Set(
            model.dimensions
                .filter(
                    ({ name: dimensionName, type, sql }) =>
                        storedDimensions.get(dimensionName)?.type !== type ||
                        storedDimensions.get(dimensionName)?.sql !== sql,
                )
                .map((dimension) => dimension.name),
        ),
        metricError: selfAggregating
            ? `Metric ${selfAggregating[0]} is a number metric that aggregates in its own sql. A number metric combines other metrics: give each aggregate its own metric, then reference them as \${metric_name}.`
            : null,
    };
};

/** What a model new to the draft still lacks; advice for the next proposal, never a reason to refuse this one. */
export const findNewModelAdvice = (
    name: string,
    contents: string,
): string[] => {
    const model = parseModelDocument(contents, toModelPath(name));
    const undescribed = metricsOf(model).flatMap(([metric, { description }]) =>
        description ? [] : [metric],
    );
    return [
        ...(model.primary_key
            ? []
            : [
                  'no primary_key: set it to the columns that identify one row; it is checked on the warehouse',
              ]),
        ...(undescribed.length > 0
            ? [
                  `no description on ${undescribed.join(', ')}: say in one sentence what each measures`,
              ]
            : []),
    ];
};

const COLUMN_REFERENCE = /\$\{TABLE\}\.(\w+)/g;
const PLAIN_COLUMN = /^\s*\$\{TABLE\}\.(\w+)\s*$/;
const MAX_LISTED_COLUMNS = 30;

/** Why a model does not fit its table as the catalog describes it: a column that is not there, or a new dimension typed differently from its column. */
export const findColumnError = (
    name: string,
    contents: string,
    columns: Map<string, DimensionType>,
    changedDimensions: Set<string>,
): string | null => {
    const model = parseModelDocument(contents, toModelPath(name));
    const sqls = [
        ...model.dimensions.map(({ sql }) => sql),
        ...metricsOf(model).flatMap(([, { sql }]) =>
            typeof sql === 'string' ? [sql] : [],
        ),
    ];
    const missing = [
        ...new Set(
            sqls.flatMap((sql) =>
                [...sql.matchAll(COLUMN_REFERENCE)].map(([, column]) => column),
            ),
        ),
    ].filter((column) => !columns.has(column.toLowerCase()));
    if (missing.length > 0) {
        const known = [...columns.keys()];
        return `${name} reads ${missing.join(', ')}, which ${missing.length === 1 ? 'is not a column' : 'are not columns'} of its table. Its columns: ${known.slice(0, MAX_LISTED_COLUMNS).join(', ')}${known.length > MAX_LISTED_COLUMNS ? ', and more' : ''}.`;
    }
    const mistyped = model.dimensions.flatMap((dimension) => {
        const column = PLAIN_COLUMN.exec(dimension.sql)?.[1];
        const columnType =
            column === undefined
                ? undefined
                : columns.get(column.toLowerCase());
        return changedDimensions.has(dimension.name) &&
            columnType !== undefined &&
            columnType !== dimension.type
            ? [`${dimension.name} reads a ${columnType} column`]
            : [];
    });
    return mistyped.length > 0
        ? `${mistyped.join(', ')}, but ${mistyped.length === 1 ? 'is' : 'are'} typed differently. Use the column's type, or cast in sql to change it.`
        : null;
};
