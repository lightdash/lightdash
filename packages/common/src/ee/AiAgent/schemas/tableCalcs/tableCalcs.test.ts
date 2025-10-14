import {
    TableCalculationTemplateType,
    WindowFunctionType,
} from '../../../../types/field';
import {
    convertAiTableCalcsSchemaToTableCalcs,
    type TableCalcsSchema,
} from './tableCalcs';

describe('convertAiTableCalcsSchemaToTableCalcs', () => {
    it('creates template for percent_of_column_total', () => {
        const tableCalcs: TableCalcsSchema = [
            {
                type: 'percent_of_column_total',
                name: 'percent_total_sales',
                displayName: 'Percent of total sales',
                fieldId: 'orders_revenue',
                partitionBy: null,
            },
        ];

        const [tableCalc] = convertAiTableCalcsSchemaToTableCalcs(tableCalcs);

        if (!('template' in tableCalc)) {
            throw new Error('Table calculation is not a template');
        }

        expect(tableCalc.template).toBeDefined();
        expect(tableCalc.template?.type).toBe(
            TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL,
        );
        if ('fieldId' in tableCalc.template) {
            expect(tableCalc.template.fieldId).toBe('orders_revenue');
        }
        if ('partitionBy' in tableCalc.template) {
            expect(tableCalc.template.partitionBy).toEqual([]);
        }
    });

    it('creates template for percent_of_column_total with partitionBy', () => {
        const tableCalcs: TableCalcsSchema = [
            {
                type: 'percent_of_column_total',
                name: 'percent_category_sales',
                displayName: 'Percent of category sales',
                fieldId: 'orders_revenue',
                partitionBy: ['orders_category'],
            },
        ];

        const [tableCalc] = convertAiTableCalcsSchemaToTableCalcs(tableCalcs);

        if (!('template' in tableCalc)) {
            throw new Error('Table calculation is not a template');
        }

        expect(tableCalc.template).toBeDefined();
        expect(tableCalc.template?.type).toBe(
            TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL,
        );
        if ('fieldId' in tableCalc.template) {
            expect(tableCalc.template.fieldId).toBe('orders_revenue');
        }
        if ('partitionBy' in tableCalc.template) {
            expect(tableCalc.template.partitionBy).toEqual(['orders_category']);
        }
    });

    it('creates template with orderBy for percent_change_from_previous', () => {
        const tableCalcs: TableCalcsSchema = [
            {
                type: 'percent_change_from_previous',
                name: 'percent_change_sales',
                displayName: 'Percent change sales',
                fieldId: 'orders_revenue',
                orderBy: [
                    {
                        fieldId: 'percent_change_sales',
                        order: 'asc',
                    },
                    {
                        fieldId: 'orders_revenue',
                        order: 'desc',
                    },
                ],
            },
        ];

        const [tableCalc] = convertAiTableCalcsSchemaToTableCalcs(tableCalcs);

        if (!('template' in tableCalc)) {
            throw new Error('Table calculation is not a template');
        }

        expect(tableCalc.template).toBeDefined();
        expect(tableCalc.template.type).toBe(
            TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS,
        );
        if ('orderBy' in tableCalc.template!) {
            expect(tableCalc.template.orderBy).toEqual([
                { fieldId: 'percent_change_sales', order: 'asc' },
                { fieldId: 'orders_revenue', order: 'desc' },
            ]);
        }
    });

    it('creates template for window_function with ROW_NUMBER', () => {
        const tableCalcs: TableCalcsSchema = [
            {
                type: 'window_function',
                name: 'row_num',
                displayName: 'Row Number',
                windowFunction: 'row_number',
                fieldId: null,
                orderBy: [
                    {
                        fieldId: 'orders_order_date',
                        order: 'asc',
                    },
                ],
                partitionBy: null,
                frame: null,
            },
        ];

        const [tableCalc] = convertAiTableCalcsSchemaToTableCalcs(tableCalcs);

        if (!('template' in tableCalc)) {
            throw new Error('Table calculation is not a template');
        }

        expect(tableCalc.template).toBeDefined();
        expect(tableCalc.template.type).toBe(
            TableCalculationTemplateType.WINDOW_FUNCTION,
        );
        if ('windowFunction' in tableCalc.template!) {
            expect(tableCalc.template.windowFunction).toBe(
                WindowFunctionType.ROW_NUMBER,
            );
        }
        if ('orderBy' in tableCalc.template!) {
            expect(tableCalc.template.orderBy).toEqual([
                { fieldId: 'orders_order_date', order: 'asc' },
            ]);
        }
        if ('partitionBy' in tableCalc.template!) {
            expect(tableCalc.template.partitionBy).toEqual([]);
        }
    });

    it('creates template for window_function with PERCENT_RANK and partitionBy', () => {
        const tableCalcs: TableCalcsSchema = [
            {
                type: 'window_function',
                name: 'rank_by_country',
                displayName: 'Rank by Country',
                windowFunction: 'percent_rank',
                fieldId: null,
                orderBy: [
                    {
                        fieldId: 'orders_total_revenue',
                        order: 'desc',
                    },
                ],
                partitionBy: ['orders_country'],
                frame: null,
            },
        ];

        const [tableCalc] = convertAiTableCalcsSchemaToTableCalcs(tableCalcs);

        if (!('template' in tableCalc)) {
            throw new Error('Table calculation is not a template');
        }

        expect(tableCalc.template).toBeDefined();
        expect(tableCalc.template.type).toBe(
            TableCalculationTemplateType.WINDOW_FUNCTION,
        );
        if ('windowFunction' in tableCalc.template!) {
            expect(tableCalc.template.windowFunction).toBe(
                WindowFunctionType.PERCENT_RANK,
            );
        }
        if ('orderBy' in tableCalc.template!) {
            expect(tableCalc.template.orderBy).toEqual([
                { fieldId: 'orders_total_revenue', order: 'desc' },
            ]);
        }
        if ('partitionBy' in tableCalc.template!) {
            expect(tableCalc.template.partitionBy).toEqual(['orders_country']);
        }
    });
});
