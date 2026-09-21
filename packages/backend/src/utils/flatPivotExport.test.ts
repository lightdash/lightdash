import {
    DimensionType,
    FieldType,
    VizAggregationOptions,
    type ItemsMap,
    type PivotValuesColumn,
} from '@lightdash/common';
import { prepareFlatPivotExport } from './flatPivotExport';

const fields: ItemsMap = {
    category: {
        name: 'category',
        table: '',
        tableLabel: '',
        label: 'Category',
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        sql: '',
        hidden: false,
    },
    revenue: {
        name: 'revenue',
        table: '',
        tableLabel: '',
        label: 'Revenue',
        fieldType: FieldType.DIMENSION,
        type: DimensionType.NUMBER,
        sql: '',
        hidden: false,
        format: 'usd',
    },
};

const pivotValuesColumns: PivotValuesColumn[] = [
    {
        referenceField: 'revenue',
        pivotColumnName: 'revenue_sum_january',
        aggregation: VizAggregationOptions.SUM,
        pivotValues: [{ referenceField: 'period', value: 'January' }],
    },
    {
        referenceField: 'revenue',
        pivotColumnName: 'revenue_avg_january',
        aggregation: VizAggregationOptions.AVERAGE,
        pivotValues: [{ referenceField: 'period', value: 'January' }],
    },
];

describe('prepareFlatPivotExport', () => {
    it('uses one aggregation-aware mapping for export presentation options', () => {
        const prepared = prepareFlatPivotExport({
            fields,
            pivotValuesColumns,
            columnOrder: ['category', 'revenue'],
            hiddenFields: ['revenue'],
            customLabels: { revenue: 'Sales' },
            conditionalFormattings: [
                {
                    target: { fieldId: 'revenue' },
                    color: '#ff0000',
                    rules: [],
                },
            ],
            columnTotals: { revenue_sum: 10, revenue_avg: 5 },
        });

        expect(Object.keys(prepared.fields)).toEqual([
            'category',
            'revenue_sum',
            'revenue_avg',
        ]);
        expect(prepared.fields.revenue_sum).toMatchObject({
            label: 'Revenue (SUM)',
            format: 'usd',
        });
        expect(prepared.fields.revenue_avg).toMatchObject({
            label: 'Revenue (AVG)',
            format: 'usd',
        });
        expect(prepared.columnOrder).toEqual([
            'category',
            'revenue_sum',
            'revenue_avg',
        ]);
        expect(prepared.hiddenFields).toEqual(['revenue_sum', 'revenue_avg']);
        expect(prepared.customLabels).toEqual({
            revenue_sum: 'Sales (SUM)',
            revenue_avg: 'Sales (AVG)',
        });
        expect(
            prepared.conditionalFormattings?.map(
                (config) => config.target?.fieldId,
            ),
        ).toEqual(['revenue_sum', 'revenue_avg']);
        expect(prepared.columnTotals).toEqual({
            revenue_sum: 10,
            revenue_avg: 5,
        });
    });
});
