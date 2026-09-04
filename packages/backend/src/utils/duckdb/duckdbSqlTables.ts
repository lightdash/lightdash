import {
    assertUnreachable,
    DimensionType,
    type ResultColumn,
    type ResultColumns,
} from '@lightdash/common';

export type PreAggregateDuckdbLocator = {
    storage: 's3';
    format: 'jsonl' | 'parquet';
    uri: string;
};

const escapeSqlString = (value: string): string => value.replace(/'/g, "''");

const escapeDuckdbStructKey = (value: string): string =>
    value.replace(/"/g, '""');

export const quoteDuckdbIdentifier = (value: string): string =>
    `"${escapeDuckdbStructKey(value)}"`;

export const resultFieldTypeToDuckdbType = (type: DimensionType): string => {
    switch (type) {
        case DimensionType.NUMBER:
            return 'DOUBLE';
        case DimensionType.BOOLEAN:
            return 'BOOLEAN';
        case DimensionType.DATE:
            return 'DATE';
        case DimensionType.TIMESTAMP:
            return 'TIMESTAMP';
        case DimensionType.STRING:
            return 'VARCHAR';
        default:
            return assertUnreachable(type, `Unknown DimensionType: ${type}`);
    }
};

export const getPreAggregateDuckdbLocator = ({
    uri,
    format,
}: {
    uri: string;
    format: 'jsonl' | 'parquet';
}): PreAggregateDuckdbLocator => ({
    storage: 's3',
    format,
    uri,
});

export const getJsonlSqlTable = (
    uri: string,
    columns?: ResultColumns | null,
): string => {
    const escapedUri = escapeSqlString(uri);

    if (!columns || Object.keys(columns).length === 0) {
        return `read_json_auto('${escapedUri}')`;
    }

    const columnDefs = Object.entries(columns)
        .map(
            ([fieldId, col]) =>
                `${quoteDuckdbIdentifier(fieldId)}: '${resultFieldTypeToDuckdbType(
                    col.type,
                )}'`,
        )
        .join(', ');

    return `read_json('${escapedUri}', columns={${columnDefs}}, format='newline_delimited')`;
};

// NUMBER binds by its numeric kind; without one DOUBLE is the only type that fits every JSON number
export const resultColumnToDuckdbType = (
    column: Pick<ResultColumn, 'type' | 'numericKind'>,
): string => {
    if (column.type !== DimensionType.NUMBER) {
        return resultFieldTypeToDuckdbType(column.type);
    }
    const kind = column.numericKind;
    if (!kind) return 'DOUBLE';
    switch (kind.kind) {
        case 'integer':
            return 'HUGEINT';
        case 'decimal':
            return `DECIMAL(38,${Math.min(Math.max(kind.scale, 0), 38)})`;
        case 'float':
            return 'DOUBLE';
        default:
            return assertUnreachable(kind, 'Unknown numeric kind');
    }
};

// A date, or a date with wall-clock time and no zone; anything else is read as an instant
const NAIVE_TIMESTAMP_PATTERN =
    '^\\d{4}-\\d{2}-\\d{2}([T ]\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?)?$';

// The cast from JSONL text to the column's type, or null when the text is the value
const getReferenceColumnCast = (
    raw: string,
    column: Pick<ResultColumn, 'type' | 'numericKind'>,
): string | null => {
    switch (column.type) {
        case DimensionType.TIMESTAMP:
            return `CASE WHEN regexp_matches(${raw}, '${NAIVE_TIMESTAMP_PATTERN}') THEN TRY_CAST(${raw} AS TIMESTAMP) ELSE timezone('UTC', TRY_CAST(${raw} AS TIMESTAMPTZ)) END`;
        case DimensionType.NUMBER:
        case DimensionType.DATE:
        case DimensionType.BOOLEAN:
            return `TRY_CAST(${raw} AS ${resultColumnToDuckdbType(column)})`;
        case DimensionType.STRING:
            return null;
        default:
            return assertUnreachable(
                column.type,
                `Unknown DimensionType: ${column.type}`,
            );
    }
};

// A non-null value that does not cast refuses naming the column; read_json's own transform cannot
const getReferenceColumnSelect = (
    fieldId: string,
    column: Pick<ResultColumn, 'type' | 'numericKind'>,
): string => {
    const raw = quoteDuckdbIdentifier(fieldId);
    const cast = getReferenceColumnCast(raw, column);
    if (cast === null) return raw;
    const refusal = `error('Referenced column ${escapeSqlString(
        fieldId,
    )} holds a value that cannot be read as ${column.type}: ' || left(${raw}, 100))`;
    return `COALESCE(${cast}, CASE WHEN ${raw} IS NULL THEN NULL ELSE ${refusal} END) AS ${raw}`;
};

/**
 * The SELECT a referenced query result is exposed through: every column read as its JSONL
 * text and cast in SQL, so the digits the driver serialised reach the typed value.
 */
export const getJsonlReferenceSelect = (
    uri: string,
    columns?: ResultColumns | null,
): string => {
    const escapedUri = escapeSqlString(uri);
    const entries = Object.entries(columns ?? {});
    if (entries.length === 0) {
        return `SELECT * FROM read_json_auto('${escapedUri}')`;
    }
    const rawColumns = entries
        .map(([fieldId]) => `${quoteDuckdbIdentifier(fieldId)}: 'VARCHAR'`)
        .join(', ');
    const selectList = entries
        .map(([fieldId, column]) => getReferenceColumnSelect(fieldId, column))
        .join(', ');
    return `SELECT ${selectList} FROM read_json('${escapedUri}', columns={${rawColumns}}, format='newline_delimited')`;
};

const getParquetSqlTable = (uri: string): string => {
    const escapedUri = escapeSqlString(uri);
    return `read_parquet('${escapedUri}')`;
};

export const getDuckdbPreAggregateSqlTable = (
    locator: PreAggregateDuckdbLocator,
    columns?: ResultColumns | null,
): string => {
    switch (locator.format) {
        case 'jsonl':
            return getJsonlSqlTable(locator.uri, columns);
        case 'parquet':
            return getParquetSqlTable(locator.uri);
        default:
            return assertUnreachable(
                locator.format,
                `Unknown format: ${locator.format}`,
            );
    }
};
