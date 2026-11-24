import {
    type WarehouseMetricViewDefinition,
    type WarehouseTableMetadata,
} from '@lightdash/common';
import { parse, stringify } from 'yaml';

type DefinedField = WarehouseMetricViewDefinition['measures'][number];

const isMap = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const toFieldName = (column: string): string =>
    column
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/^(?=\d)/, '_');

const quote = (column: string): string =>
    /^[A-Za-z_]\w*$/.test(column) ? column : `\`${column}\``;

const getDimensionSql = (column: string): string =>
    `\${TABLE}.${quote(column)}`;

// The warehouse only evaluates a measure through MEASURE(), so the metric passes it through
const getMeasureSql = (column: string): string => `MEASURE(\`${column}\`)`;

const normalizeSql = (sql: string): string =>
    sql
        .replace(/\$\{TABLE\}\./gi, '')
        .replace(/[`\s]/g, '')
        .toLowerCase();

/** Names the model already gives each column, keyed by its SQL, so an import updates fields in place. */
const getExistingNames = (modelYaml: string | null): Map<string, string> => {
    const names = new Map<string, string>();
    if (modelYaml === null) return names;
    let model: unknown;
    try {
        model = parse(modelYaml);
    } catch {
        return names;
    }
    if (!isMap(model)) return names;
    (Array.isArray(model.dimensions) ? model.dimensions : []).forEach(
        (dimension: unknown) => {
            if (
                isMap(dimension) &&
                typeof dimension.name === 'string' &&
                typeof dimension.sql === 'string'
            ) {
                names.set(normalizeSql(dimension.sql), dimension.name);
            }
        },
    );
    Object.entries(isMap(model.metrics) ? model.metrics : {}).forEach(
        ([name, metric]) => {
            if (isMap(metric) && typeof metric.sql === 'string') {
                names.set(normalizeSql(metric.sql), name);
            }
        },
    );
    return names;
};

const describeMeasure = (
    comment: string | null,
    defined: DefinedField | null,
): string | null => {
    const parts = [
        ...(comment ? [comment] : []),
        ...(defined ? [`Defined in the metric view as: ${defined.expr}`] : []),
        ...(defined?.window ?? []).map((window) =>
            [
                `Window: ordered by ${window.order}, range ${window.range}`,
                ...(window.semiAdditive
                    ? [`semi-additive (${window.semiAdditive})`]
                    : []),
                ...(window.offset ? [`offset ${window.offset}`] : []),
            ].join(', '),
        ),
    ];
    return parts.length > 0 ? parts.join('\n') : null;
};

/**
 * A model fragment holding every column of a described metric view: dimensions as
 * columns, measures as passthrough metrics, with the warehouse's labels,
 * comments and synonyms. `existingModelYaml` is null for a model that does not exist yet.
 */
export const buildMetricViewModelYaml = ({
    sqlFrom,
    metadata,
    existingModelYaml,
}: {
    sqlFrom: string;
    metadata: WarehouseTableMetadata;
    existingModelYaml: string | null;
}): string => {
    const existingNames = getExistingNames(existingModelYaml);
    const defined = new Map<string, DefinedField>(
        [
            ...(metadata.metricView?.dimensions ?? []).map((field) => ({
                ...field,
                window: [],
            })),
            ...(metadata.metricView?.measures ?? []),
        ].map((field) => [field.name, field]),
    );
    const getShared = (column: string, sql: string) => {
        const field = defined.get(column) ?? null;
        const name =
            existingNames.get(normalizeSql(sql)) ?? toFieldName(column);
        const label = field?.label ?? (name === column ? null : column);
        return {
            field,
            name,
            keys: {
                sql,
                ...(label ? { label } : {}),
                ...(field && field.synonyms.length > 0
                    ? { ai_hint: field.synonyms }
                    : {}),
            },
        };
    };

    const dimensions = metadata.columns
        .filter((column) => !column.isMeasure)
        .map((column) => {
            const { field, name, keys } = getShared(
                column.name,
                getDimensionSql(column.name),
            );
            const description = column.comment ?? field?.comment ?? null;
            return {
                name,
                type: column.type,
                ...keys,
                ...(description ? { description } : {}),
            };
        });
    const metrics = Object.fromEntries(
        metadata.columns
            .filter((column) => column.isMeasure)
            .map((column) => {
                const { field, name, keys } = getShared(
                    column.name,
                    getMeasureSql(column.name),
                );
                const description = describeMeasure(
                    column.comment ?? field?.comment ?? null,
                    field,
                );
                return [
                    name,
                    {
                        type: 'number',
                        ...keys,
                        ...(description ? { description } : {}),
                    },
                ];
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
