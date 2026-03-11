import {
    assertUnreachable,
    DimensionType,
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

const resultFieldTypeToDuckdbType = (type: DimensionType): string => {
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
