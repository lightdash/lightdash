import {
    formatRow,
    type ItemsMap,
    type PivotValuesColumn,
} from '@lightdash/common';

export type ResultsPageFormatInputs = {
    fields: ItemsMap;
    pivotValuesColumns: Record<string, PivotValuesColumn> | null;
    timezone: string | null;
};

export const buildResultsPageRowsJson = (
    lines: readonly string[],
    { fields, pivotValuesColumns, timezone }: ResultsPageFormatInputs,
): string => {
    const rows = new Array<string>(lines.length);
    for (let index = 0; index < lines.length; index += 1) {
        rows[index] = JSON.stringify(
            formatRow(
                JSON.parse(lines[index]),
                fields,
                pivotValuesColumns,
                undefined,
                timezone ?? undefined,
            ),
        );
    }
    return `[${rows.join(',')}]`;
};
