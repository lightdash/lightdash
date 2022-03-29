import { Explore, ResultRow } from 'common';

function formatValue(format: string, value: any): any {
    switch (format) {
        case 'km':
        case 'mi':
            return `${value} ${format}`;
        // case 'date':
        //    return moment(value).format('YYYY-MM-DD');
        case 'usd':
            return `$${value}`;
        case 'gbp':
            return `${value}£`;
        case 'percent':
            return `${parseFloat(value) * 100} %`;
        case '': // no format
            return value;
        default: // unrecognized format
        // TODO throw warning ?
    }
    return value;
}

export function formatRows(
    rows: { [col: string]: any }[],
    explore: Explore,
): ResultRow[] {
    const formattedRows: ResultRow[] = [];

    // TODO do this in a better way . Suggestions? do we have a similar function somewhere ?
    // Currently,find this column format flag from explorer
    // and store it in a key/value as a way of caching
    const columnFormats: { [key: string]: string } = {};
    function getFormat(columnName: string) {
        if (columnFormats[columnName] !== undefined) {
            return columnFormats[columnName];
        }
        const tableName = columnName.split('_')[0];
        const metricName = columnName.split('_').slice(1).join('_');
        const table = explore.tables[tableName];
        const format =
            table.metrics[metricName]?.format ||
            table.dimensions[metricName]?.format;
        if (format) {
            columnFormats[columnName] = format;
            return format;
        }

        columnFormats[columnName] = '';
        return '';
    }
    rows.forEach((row) => {
        const formattedRow: ResultRow = {};
        Object.keys(row).forEach((columnName: string) => {
            const col = row[columnName];

            const format = getFormat(columnName);
            const formattedColumn = formatValue(format, col);

            formattedRow[columnName] = {
                value: {
                    raw: col,
                    formatted: formattedColumn,
                },
            };
        });

        formattedRows.push(formattedRow);
    });

    return formattedRows;
}
