import {
    DimensionType,
    type BarChartConfig,
    type ResultRow,
} from '@lightdash/common';
import { tableFromJSON, tableToIPC } from 'apache-arrow';
import { Database } from 'duckdb-async';

type SqlColumn = {
    id: string;
    type: DimensionType;
};

// type Fields = { id: string; type: DimensionType }[];
// const defaultOptions = (fields: Fields): BarChartConfig => {
//     // x should be date or a categorical
//     let xField;
//     let yField;
//
//     return {
//         axes: {
//             x: {
//                 label: fields[0].id,
//             },
//             y: fields.slice(1).map((field) => ({
//                 label: field.id,
//             })),
//         },
//         series: [],
//     };
// };

// Bar chart defaults depends on available fields - not sql specific

// available fields depends on the initial results

// mapping the UX to the field ids is sql specific

// type SqlBarChartFieldSelectorProps = {
//     onChange: (field: Field) =>
//     fields: Fields;
//     onOptionsChange: (options: BarChartConfig) => void;
// };
// }
// export const SqlBarChartFieldSelector: FC<

// available x values
type xLayoutOptions = {
    type: 'time' | 'categorical';
    columnId: string;
    timeGrainOptions: string[];
};
const xLayoutOptions = (columns: SqlColumn[]): xLayoutOptions[] => {
    let options: xLayoutOptions[] = [];
    for (const column of columns) {
        switch (column.type) {
            case DimensionType.DATE:
                options.push({
                    type: 'time',
                    columnId: column.id,
                    timeGrainOptions: [
                        'day',
                        'week',
                        'month',
                        'quarter',
                        'year',
                    ],
                });
                break;
            case DimensionType.TIMESTAMP:
                options.push({
                    type: 'time',
                    columnId: column.id,
                    timeGrainOptions: [
                        'minute',
                        'hour',
                        'day',
                        'week',
                        'month',
                        'quarter',
                        'year',
                    ],
                });
                break;
            case DimensionType.STRING:
            case DimensionType.NUMBER:
            case DimensionType.BOOLEAN:
                options.push({
                    type: 'categorical',
                    columnId: column.id,
                    timeGrainOptions: [],
                });
                break;
        }
    }
    return options;
};

// available yValues
type yLayoutOptions = {
    columnId: string;
    aggregationOptions: string[];
};
const yLayoutOptions = (columns: SqlColumn[]): yLayoutOptions[] => {
    let options: yLayoutOptions[] = [];
    for (const column of columns) {
        switch (column.type) {
            case DimensionType.NUMBER:
                options.push({
                    columnId: column.id,
                    aggregationOptions: [
                        'none',
                        'min',
                        'max',
                        'sum',
                        'average',
                        'count',
                        'count_distinct',
                    ],
                });
                break;
            case DimensionType.STRING:
            case DimensionType.BOOLEAN:
                options.push({
                    columnId: column.id,
                    aggregationOptions: ['count', 'count_distinct'],
                });
                break;
        }
    }
    return options;
};

// available series
type seriesLayoutOptions = {
    columnId: string;
};
const seriesLayoutOptions = (columns: SqlColumn[]): seriesLayoutOptions[] => {
    let options: seriesLayoutOptions[] = [];
    for (const column of columns) {
        switch (column.type) {
            case DimensionType.STRING:
            case DimensionType.BOOLEAN:
                options.push({
                    columnId: column.id,
                });
                break;
        }
    }
    return options;
};

// data transform
type BarChartSqlTransform = {
    x: {
        columnId: string;
        timeGrain: string;
        type: 'time' | 'categorical';
    };
    y: {
        columnId: string;
        aggregation: string;
        sort: string | null;
    }[];
    colorBy: {
        columnId: string;
    };
};

const transform = (config: BarChartConfig, rows: ResultRow[]) => {};

// Not chart specific - just pivoting
export const getPivotedResults = async (
    rows: Record<string, unknown>[],
    valuesSql: string[],
    pivotsSql: string[],
    sortsSql: string[],
) => {
    // const fields = Object.keys(fieldsMap);
    const arrowTable = tableFromJSON(rows);
    const db = await Database.create(':memory:');
    await db.exec('INSTALL arrow; LOAD arrow;');
    await db.register_buffer('results_data', [tableToIPC(arrowTable)], true);

    const pivotOnSql = pivotsSql.join(', ');
    const pivotValuesSql = valuesSql.join(', ');

    const query = `PIVOT results_data
    ON ${pivotOnSql}
    USING ${pivotValuesSql} 
    ORDER BY ${sortsSql.join(',')}`;

    const pivoted = await db.all(query);
    const fieldNames = Object.keys(pivoted[0]);

    return {
        results: pivoted,
        columns: fieldNames,
    };
};
