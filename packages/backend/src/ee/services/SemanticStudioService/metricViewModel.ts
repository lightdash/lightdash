import {
    MetricType,
    parseModelDocument,
    type LightdashModel,
    type WarehouseMetricViewDefinition,
    type WarehouseTableMetadata,
} from '@lightdash/common';
import { stringify } from 'yaml';
import { toModelPath } from './draftFold';
import { metricsOf } from './draftLint';

type Measure = WarehouseMetricViewDefinition['measures'][number];

const toFieldName = (column: string): string =>
    column
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/^(?=\d)/, '_');

/** Backticks only where a name needs them, with any backtick inside it doubled. */
export const quoteIdentifier = (name: string): string =>
    /^[A-Za-z_]\w*$/.test(name) ? name : `\`${name.replaceAll('`', '``')}\``;

const getDimensionSql = (column: string): string =>
    `\${TABLE}.${quoteIdentifier(column)}`;

// The warehouse only evaluates a measure through MEASURE(), so the metric passes it through
const getMeasureSql = (column: string): string =>
    `MEASURE(\`${column.replaceAll('`', '``')}\`)`;

// Quoting, spacing and case do not change which column a field reads
const toSqlKey = (sql: string): string =>
    sql.replace(/[`\s]/g, '').toLowerCase();

const readModel = (
    modelName: string,
    modelYaml: string | null,
): LightdashModel | null => {
    if (modelYaml === null) return null;
    try {
        return parseModelDocument(modelYaml, toModelPath(modelName));
    } catch {
        return null;
    }
};

const describeMeasure = (
    comment: string | null,
    measure: Measure | null,
): string => {
    const parts = [
        ...(comment ? [comment] : []),
        ...(measure ? [`Defined in the metric view as: ${measure.expr}`] : []),
        ...(measure?.window ?? []).map((window) =>
            [
                `Window: ordered by ${window.order}, range ${window.range}`,
                ...(window.semiAdditive
                    ? [`semi-additive (${window.semiAdditive})`]
                    : []),
                ...(window.offset ? [`offset ${window.offset}`] : []),
            ].join(', '),
        ),
    ];
    return parts.join('\n');
};

/**
 * A model fragment holding every column of a described metric view: dimensions as
 * columns, measures as passthrough metrics, with the warehouse's labels, comments
 * and synonyms. A field the model already has keeps its name, and keeps its own
 * label and description where the warehouse gives none.
 */
export const buildMetricViewModelYaml = ({
    modelName,
    sqlFrom,
    metadata,
    existingModelYaml,
}: {
    modelName: string;
    sqlFrom: string;
    metadata: WarehouseTableMetadata;
    /** Null for a model that does not exist yet. */
    existingModelYaml: string | null;
}): string => {
    const existing = readModel(modelName, existingModelYaml);
    const existingMetrics = existing ? metricsOf(existing) : [];
    const dimensionNames = new Map(
        (existing?.dimensions ?? []).map(({ name, sql }) => [
            toSqlKey(sql),
            name,
        ]),
    );
    const metricNames = new Map(
        Object.entries(existing?.metrics ?? {}).flatMap(([name, { sql }]) =>
            sql ? [[toSqlKey(sql), name] as const] : [],
        ),
    );
    const taken = new Set([
        ...(existing?.dimensions ?? []).map(({ name }) => name),
        ...existingMetrics.map(([name]) => name),
    ]);
    // Two columns can reduce to one name, and a name in another script reduces to none
    const claimName = (column: string): string => {
        const base = toFieldName(column) || 'field';
        let name = base;
        for (let suffix = 2; taken.has(name); suffix += 1) {
            name = `${base}_${suffix}`;
        }
        taken.add(name);
        return name;
    };
    const defined = {
        dimensions: new Map(
            (metadata.metricView?.dimensions ?? []).map((f) => [f.name, f]),
        ),
        measures: new Map(
            (metadata.metricView?.measures ?? []).map((f) => [f.name, f]),
        ),
    };
    const getField = ({
        column,
        sql,
        existingName,
        label,
        synonyms,
        description,
    }: {
        column: string;
        sql: string;
        existingName: string | null;
        label: string | null;
        synonyms: string[];
        description: string | null;
    }) => {
        const name = existingName ?? claimName(column);
        // A new field whose name lost the column's spelling keeps it as the label
        const shownLabel =
            label ?? (existingName === null && name !== column ? column : null);
        return {
            name,
            keys: {
                sql,
                ...(shownLabel ? { label: shownLabel } : {}),
                ...(synonyms.length > 0 ? { ai_hint: synonyms } : {}),
                ...(description ? { description } : {}),
            },
        };
    };

    const dimensions = metadata.columns
        .filter((column) => !column.isMeasure)
        .map((column) => {
            const field = defined.dimensions.get(column.name) ?? null;
            const sql = getDimensionSql(column.name);
            const { name, keys } = getField({
                column: column.name,
                sql,
                existingName: dimensionNames.get(toSqlKey(sql)) ?? null,
                label: field?.label ?? null,
                synonyms: field?.synonyms ?? [],
                description: column.comment ?? field?.comment ?? null,
            });
            return { name, type: column.type, ...keys };
        });
    const metrics = Object.fromEntries(
        metadata.columns
            .filter((column) => column.isMeasure)
            .map((column) => {
                const measure = defined.measures.get(column.name) ?? null;
                const sql = getMeasureSql(column.name);
                const existingName = metricNames.get(toSqlKey(sql)) ?? null;
                const comment = column.comment ?? measure?.comment ?? null;
                const { name, keys } = getField({
                    column: column.name,
                    sql,
                    existingName,
                    label: measure?.label ?? null,
                    synonyms: measure?.synonyms ?? [],
                    // The definition alone does not replace a description someone wrote
                    description:
                        existingName === null || comment
                            ? describeMeasure(comment, measure) || null
                            : null,
                });
                return [name, { type: MetricType.NUMBER, ...keys }];
            }),
    );

    return stringify(
        {
            ...(existingModelYaml === null ? { sql_from: sqlFrom } : {}),
            ...(metadata.comment ? { description: metadata.comment } : {}),
            dimensions,
            ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
        },
        { lineWidth: 0 },
    );
};
