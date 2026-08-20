import { describe, expect, it } from 'vitest';
import {
    CustomFormatType,
    TableCalculationType,
} from '../../../../types/field';
import {
    convertAiTableCalcsSchemaToTableCalcs,
    formulaTableCalcsSchema,
    tableCalcsSchema,
} from './tableCalcs';

describe('tableCalcsSchema (wide, persisted args)', () => {
    it('parses legacy template entries', () => {
        const result = tableCalcsSchema.safeParse([
            {
                type: 'running_total',
                name: 'running_revenue',
                displayName: 'Running Revenue',
                fieldId: 'orders_revenue',
            },
        ]);
        expect(result.success).toBe(true);
    });

    it('parses formula entries', () => {
        const result = tableCalcsSchema.safeParse([
            {
                type: 'formula',
                name: 'aov',
                displayName: 'AOV',
                formula: 'orders_revenue / orders_count',
                format: null,
                resultType: null,
            },
        ]);
        expect(result.success).toBe(true);
    });
});

describe('formulaTableCalcsSchema (advertised agent contract)', () => {
    it('accepts formula entries', () => {
        const result = formulaTableCalcsSchema.safeParse([
            {
                type: 'formula',
                name: 'aov',
                displayName: 'AOV',
                formula: 'orders_revenue / orders_count',
                format: 'number',
                resultType: 'number',
            },
        ]);
        expect(result.success).toBe(true);
    });

    it('rejects legacy template entries', () => {
        const result = formulaTableCalcsSchema.safeParse([
            {
                type: 'running_total',
                name: 'running_revenue',
                displayName: 'Running Revenue',
                fieldId: 'orders_revenue',
            },
        ]);
        expect(result.success).toBe(false);
    });
});

describe('convertAiTableCalcsSchemaToTableCalcs', () => {
    it('converts a formula calc, adding the leading equals sign', () => {
        const [calc] = convertAiTableCalcsSchemaToTableCalcs([
            {
                type: 'formula',
                name: 'aov',
                displayName: 'AOV',
                formula: 'orders_revenue / orders_count',
                format: null,
                resultType: null,
            },
        ]);
        expect(calc).toEqual({
            name: 'aov',
            displayName: 'AOV',
            type: TableCalculationType.NUMBER,
            formula: '=orders_revenue / orders_count',
            format: {
                type: CustomFormatType.NUMBER,
                separator: 'default',
            },
        });
    });

    it('keeps an existing leading equals sign', () => {
        const [calc] = convertAiTableCalcsSchemaToTableCalcs([
            {
                type: 'formula',
                name: 'doubled',
                displayName: 'Doubled',
                formula: '=orders_revenue * 2',
                format: null,
                resultType: null,
            },
        ]);
        expect(calc).toMatchObject({ formula: '=orders_revenue * 2' });
    });

    it('maps percent format and non-number result types', () => {
        const [percentCalc, boolCalc] = convertAiTableCalcsSchemaToTableCalcs([
            {
                type: 'formula',
                name: 'share',
                displayName: 'Share',
                formula: 'orders_revenue / SUM(orders_revenue)',
                format: 'percent',
                resultType: null,
            },
            {
                type: 'formula',
                name: 'is_late',
                displayName: 'Is late',
                formula: 'orders_shipped_date > orders_due_date',
                format: null,
                resultType: 'boolean',
            },
        ]);
        expect(percentCalc).toMatchObject({
            format: { type: CustomFormatType.PERCENT },
            type: TableCalculationType.NUMBER,
        });
        expect(boolCalc).toMatchObject({
            type: TableCalculationType.BOOLEAN,
        });
        expect(boolCalc).not.toHaveProperty('format');
    });

    it('still converts legacy template calcs to template table calculations', () => {
        const [calc] = convertAiTableCalcsSchemaToTableCalcs([
            {
                type: 'running_total',
                name: 'running_revenue',
                displayName: 'Running Revenue',
                fieldId: 'orders_revenue',
            },
        ]);
        expect(calc).toMatchObject({
            name: 'running_revenue',
            template: {
                type: 'running_total',
                fieldId: 'orders_revenue',
            },
        });
        expect(calc).not.toHaveProperty('formula');
    });
});
