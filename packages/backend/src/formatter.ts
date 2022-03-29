import { Explore, fieldId as getFieldId, getFields, ResultRow } from 'common';

function formatValue(format: string, value: any): any {
    switch (format) {
        case 'km':
        case 'mi':
            return `${value} ${format}`;
        case 'usd':
            return `$${value}`;
        case 'gbp':
            return `${value}£`;
        case 'percent':
            return `${parseFloat(value) * 100} %`;
        case '': // no format
            return value;
        default:
            // unrecognized format
            return value;
    }
}

export function formatRows(
    rows: { [col: string]: any }[],
    explore: Explore,
): ResultRow[] {
    const fieldMap: Record<string, string | undefined> = getFields(
        explore,
    ).reduce(
        (sum, field) => ({
            ...sum,
            [getFieldId(field)]: field.format,
        }),
        {},
    ); // e.g { 'my_table_my_dimension': 'km'}}

    function getFormat(columnName: string): string {
        return fieldMap[columnName] || '';
    }

    return rows.map((row) => Object.keys(row).reduce((acc, columnName) => {
            const col = row[columnName];

            const format = getFormat(columnName);
            const formattedColumn = formatValue(format, col);

            return {
                ...acc,
                [columnName]: {
                    value: {
                        raw: col,
                        formatted: formattedColumn,
                    },
                },
            };
        }, {}));
}
