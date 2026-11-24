import {
    capitalize,
    DimensionType,
    friendlyName,
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

const TIMEFRAME_WORDS = new Set(['day', 'week', 'month', 'quarter', 'year']);

const isTimeframeWord = (label: string): boolean =>
    TIMEFRAME_WORDS.has(label.trim().toLowerCase());

// A numeric column named only for a date part, which a date dimension's timeframes already give
const DATE_PART_NAME =
    /^(day|week|month|quarter|year)(_(num|number|no|of_[a-z]+))?$/;

/** Sentence case that keeps all-caps words and words with digits as written. */
export const toSentenceCase = (label: string): string =>
    label
        .split(' ')
        .map((word, index) => {
            if (/\d/.test(word) || /^[^a-z]*[A-Z][^a-z]*$/.test(word)) {
                return word;
            }
            return index === 0 ? capitalize(word) : word.toLowerCase();
        })
        .join(' ');

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
 * label and description where the warehouse gives none. Labels come out in sentence
 * case and distinct, and date-part columns a date dimension covers come out hidden.
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
    const existingLabels = new Map<string, string>([
        ...(existing?.dimensions ?? []).flatMap(({ name, label }) =>
            label ? [[name, label] as const] : [],
        ),
        ...existingMetrics.flatMap(([name, { label }]) =>
            label ? [[name, label] as const] : [],
        ),
    ]);
    const shownLabelOf = (name: string): string =>
        existingLabels.get(name) ?? friendlyName(name);
    const hasDateDimension = metadata.columns.some(
        ({ isMeasure, type }) =>
            !isMeasure &&
            (type === DimensionType.DATE || type === DimensionType.TIMESTAMP),
    );
    const getField = ({
        column,
        type,
        sql,
        existingName,
        label,
        synonyms,
        description,
    }: {
        column: string;
        type: DimensionType;
        sql: string;
        existingName: string | null;
        label: string | null;
        synonyms: string[];
        description: string | null;
    }) => {
        const name = existingName ?? claimName(column);
        // A new field whose name lost the column's spelling keeps it as the label
        const imported =
            label ?? (existingName === null && name !== column ? column : null);
        let shown = imported ? toSentenceCase(imported) : shownLabelOf(name);
        const hidden =
            hasDateDimension &&
            type === DimensionType.NUMBER &&
            DATE_PART_NAME.test(toFieldName(column));
        if (hidden && isTimeframeWord(shown)) {
            shown = `${shown} number`;
        }
        const isDate =
            type === DimensionType.DATE || type === DimensionType.TIMESTAMP;
        if (isDate && isTimeframeWord(shown)) {
            const fromColumn = toSentenceCase(friendlyName(column));
            shown = isTimeframeWord(fromColumn) ? 'Date' : fromColumn;
        }
        return {
            name,
            imported: imported !== null,
            shown,
            keys: {
                sql,
                ...(hidden ? { hidden: true } : {}),
                ...(synonyms.length > 0 ? { ai_hint: synonyms } : {}),
                ...(description ? { description } : {}),
            },
        };
    };

    const dimensionFields = metadata.columns
        .filter((column) => !column.isMeasure)
        .map((column) => {
            const field = defined.dimensions.get(column.name) ?? null;
            const sql = getDimensionSql(column.name);
            return {
                type: column.type,
                ...getField({
                    column: column.name,
                    type: column.type,
                    sql,
                    existingName: dimensionNames.get(toSqlKey(sql)) ?? null,
                    label: field?.label ?? null,
                    synonyms: field?.synonyms ?? [],
                    description: column.comment ?? field?.comment ?? null,
                }),
            };
        });
    const metricFields = metadata.columns
        .filter((column) => column.isMeasure)
        .map((column) => {
            const measure = defined.measures.get(column.name) ?? null;
            const sql = getMeasureSql(column.name);
            const existingName = metricNames.get(toSqlKey(sql)) ?? null;
            const comment = column.comment ?? measure?.comment ?? null;
            return getField({
                column: column.name,
                type: column.type,
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
        });

    // No two fields of the model share a label, counting the ones this import leaves alone
    const imported = [...dimensionFields, ...metricFields];
    const importedNames = new Set(imported.map(({ name }) => name));
    const takenLabels = new Set(
        [
            ...(existing?.dimensions ?? []).map(({ name }) => name),
            ...existingMetrics.map(([name]) => name),
        ]
            .filter((name) => !importedNames.has(name))
            .map((name) => shownLabelOf(name).toLowerCase()),
    );
    const withLabel = <T extends ReturnType<typeof getField>>(field: T) => {
        let label = field.shown;
        for (let n = 2; takenLabels.has(label.toLowerCase()); n += 1) {
            label = `${field.shown} ${n}`;
        }
        takenLabels.add(label.toLowerCase());
        const send = field.imported || label !== shownLabelOf(field.name);
        const { sql, ...keys } = field.keys;
        return { sql, ...(send ? { label } : {}), ...keys };
    };

    const dimensions = dimensionFields.map((field) => ({
        name: field.name,
        type: field.type,
        ...withLabel(field),
    }));
    const metrics = Object.fromEntries(
        metricFields.map((field) => [
            field.name,
            { type: MetricType.NUMBER, ...withLabel(field) },
        ]),
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
