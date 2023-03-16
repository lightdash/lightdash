import {
    Field,
    FieldType,
    LightdashMode,
    MetricQuery,
    TableCalculation,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';

export const rows = [...Array(5).keys()].map((i) => ({
    column_number: i,
    column_string: `value_${i}`,
    column_date: '2020-03-16T11:32:55.000Z',
}));

export const metricQuery: MetricQuery = {
    dimensions: ['column_number', 'column_date'],

    metrics: [],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [
        {
            name: 'column_string',
            displayName: 'column_string',
            sql: '',
        },
    ],
    additionalMetrics: [],
};

export const itemMap: Record<string, Field | TableCalculation> = {
    column_number: {
        name: 'column_number',
        fieldType: FieldType.DIMENSION,
        type: 'number',
        displayName: 'column number',
        format: 'usd',
        tableLabel: 'table',
        label: 'column number',
        sql: '${TABLE}.column_number',
    },
    column_string: {
        // like a table calculation
        name: 'column_string',
        displayName: 'column string',
        sql: 'md5(random()::text)',
    },
    column_date: {
        name: 'column_date',
        type: 'date',
        displayName: 'column date',
        tableLabel: 'table',
        label: 'column date',

        fieldType: FieldType.DIMENSION,
        sql: '${TABLE}.column_date',
    },
};
