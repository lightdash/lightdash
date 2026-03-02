import {
    assertUnreachable,
    DimensionType,
    type ResultColumns,
} from '@lightdash/common';

export type PreAggregateDuckdbLocator = {
    storage: 's3';
    format: 'jsonl';
    uri: string;
};

const escapeSqlString = (value: string): string => value.replace(/'/g, "''");

const escapeDuckdbStructKey = (value: string): string =>
    value.replace(/"/g, '""');

const quoteDuckdbStructKey = (value: string): string =>
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
    format: 'jsonl';
}): PreAggregateDuckdbLocator => ({
    storage: 's3',
    format,
    uri,
});

export const getDuckdbPreAggregateSqlTable = (
    locator: PreAggregateDuckdbLocator,
    columns?: ResultColumns | null,
): string => {
    const escapedUri = escapeSqlString(locator.uri);

    if (!columns || Object.keys(columns).length === 0) {
        return `read_json_auto('${escapedUri}')`;
    }

    const columnDefs = Object.entries(columns)
        .map(
            ([fieldId, col]) =>
                `${quoteDuckdbStructKey(fieldId)}: '${resultFieldTypeToDuckdbType(
                    col.type,
                )}'`,
        )
        .join(', ');

    return `read_json('${escapedUri}', columns={${columnDefs}}, format='newline_delimited')`;
};
