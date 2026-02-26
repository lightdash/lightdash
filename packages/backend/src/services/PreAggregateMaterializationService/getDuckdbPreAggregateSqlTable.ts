import {
    assertUnreachable,
    DimensionType,
    type ResultColumns,
} from '@lightdash/common';

export type PreAggregateDuckdbLocator = {
    storage: 's3';
    format: 'jsonl';
    key: string;
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
    bucket,
    resultsFileName,
    format,
}: {
    bucket: string;
    resultsFileName: string;
    format: 'jsonl';
}): PreAggregateDuckdbLocator => {
    const trimmedBucket = bucket.trim();
    const trimmedResultsFileName = resultsFileName.trim();

    if (trimmedBucket.length === 0) {
        throw new Error(
            'Cannot build pre-aggregate DuckDB locator without S3 bucket',
        );
    }

    if (trimmedResultsFileName.length === 0) {
        throw new Error(
            'Cannot build pre-aggregate DuckDB locator without results file name',
        );
    }

    const key = `${trimmedResultsFileName}.${format}`;

    return {
        storage: 's3',
        format,
        key,
        uri: `s3://${trimmedBucket}/${key}`,
    };
};

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
