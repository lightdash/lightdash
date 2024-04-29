import { FieldType, Format, ItemsMap, MetricQuery } from '@lightdash/common';

export const metricQuery: MetricQuery = {
    exploreName: 'test',
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

export const itemMap: ItemsMap = {
    column_number: {
        name: 'column_number',
        description: undefined,
        table: 'table',
        hidden: false,
        fieldType: FieldType.DIMENSION,
        type: 'number',
        format: Format.USD,
        tableLabel: 'table',
        label: 'column number',
        sql: '${TABLE}.column_number',
    },
    column_string: {
        // like a table calculation
        name: 'column_string',
        description: undefined,
        displayName: 'column string',
        sql: 'md5(random()::text)',
    },
    column_date: {
        name: 'column_date',
        description: undefined,
        type: 'date',
        hidden: false,
        table: 'table',
        tableLabel: 'table',
        label: 'column date',
        fieldType: FieldType.DIMENSION,
        sql: '${TABLE}.column_date',
    },
};
