import {
    NotSupportedError,
    ParseError,
    type PivotValuesColumn,
} from '@lightdash/common';
import { Readable } from 'stream';
import { splitJsonlStream } from './streamUtils';

/** Expand stored wide rows without changing the query's row or column limits. */
export function unpivotResultsStream(
    stream: Readable,
    valuesColumns: PivotValuesColumn[],
): Readable {
    const aggregations = new Map<string, PivotValuesColumn['aggregation']>();
    for (const { referenceField, aggregation } of valuesColumns) {
        const existing = aggregations.get(referenceField);
        if (existing !== undefined && existing !== aggregation) {
            stream.destroy();
            throw new NotSupportedError(
                'Flat export cannot represent multiple aggregations of the same field. Use the Grouped layout to export all values.',
            );
        }
        aggregations.set(referenceField, aggregation);
    }
    const groups = new Map<string, PivotValuesColumn[]>();
    const pivotColumnNames = new Set(
        valuesColumns.map((column) => column.pivotColumnName),
    );
    for (const column of valuesColumns) {
        const key = JSON.stringify(
            column.pivotValues.map(({ referenceField, value }) => [
                referenceField,
                value,
            ]),
        );
        const group = groups.get(key) ?? [];
        group.push(column);
        groups.set(key, group);
    }

    return Readable.from(
        (async function* unpivotRows() {
            for await (const line of splitJsonlStream(stream)) {
                if (line.trim()) {
                    let row: Record<string, unknown>;
                    try {
                        row = JSON.parse(line);
                    } catch {
                        throw new ParseError(
                            'Failed to parse pivot results for flat export',
                        );
                    }
                    const dimensions = Object.fromEntries(
                        Object.entries(row).filter(
                            ([key]) => !pivotColumnNames.has(key),
                        ),
                    );
                    for (const group of groups.values()) {
                        // A missing group is not a row; a present group with null values is.
                        if (
                            group.some((column) =>
                                Object.hasOwn(row, column.pivotColumnName),
                            )
                        ) {
                            const flatRow: Record<string, unknown> = {
                                ...dimensions,
                            };
                            for (const { referenceField, value } of group[0]
                                .pivotValues) {
                                flatRow[referenceField] = value;
                            }
                            for (const column of group) {
                                flatRow[column.referenceField] =
                                    row[column.pivotColumnName];
                            }
                            yield `${JSON.stringify(flatRow)}\n`;
                        }
                    }
                }
            }
        })(),
    );
}
