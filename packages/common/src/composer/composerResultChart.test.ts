import { DimensionType, FieldType, MetricType } from '../types/field';
import { type ResultColumn } from '../types/results';
import { TimeFrames } from '../types/timeFrames';
import {
    ComposerResultColumns,
    getComposerResultQuery,
} from './composerResultChart';

const columns: ResultColumn[] = [
    {
        reference: 'orders_month',
        type: DimensionType.TIMESTAMP,
        timeInterval: TimeFrames.MONTH,
    },
    { reference: 'status', type: DimensionType.STRING },
    {
        reference: 'revenue',
        type: DimensionType.NUMBER,
        label: 'Total revenue',
        format: '"$"#,##0.00',
    },
];

describe('getComposerResultQuery', () => {
    test('builds fields under the <composer> table, named by column', () => {
        expect(
            getComposerResultQuery(
                new ComposerResultColumns(columns),
                ['orders_month', 'status'],
                ['revenue'],
            ),
        ).toEqual({
            metricQuery: {
                exploreName: 'composer_result',
                dimensions: ['orders_month', 'status'],
                metrics: ['revenue'],
                filters: {},
                sorts: [],
                limit: 5000,
                tableCalculations: [],
            },
            fields: {
                orders_month: {
                    table: '<composer>',
                    name: 'orders_month',
                    label: 'Orders month',
                    tableLabel: '',
                    sql: '',
                    hidden: false,
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.MONTH,
                },
                status: {
                    table: '<composer>',
                    name: 'status',
                    label: 'Status',
                    tableLabel: '',
                    sql: '',
                    hidden: false,
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                },
                revenue: {
                    table: '<composer>',
                    name: 'revenue',
                    label: 'Total revenue',
                    tableLabel: '',
                    sql: '',
                    hidden: false,
                    format: '"$"#,##0.00',
                    fieldType: FieldType.METRIC,
                    type: MetricType.NUMBER,
                },
            },
        });
    });
});
