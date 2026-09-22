import { FieldType, MetricType, type ItemsMap } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { savedChartExamplePrompts } from './savedChartExamplePrompts';

const metricOnlyItems = {
    orders_gross_margin: {
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name: 'gross_margin',
        label: 'Gross margin',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.gross_margin',
        hidden: false,
    },
} satisfies ItemsMap;

describe('savedChartExamplePrompts', () => {
    it('grounds every prompt in the fields available from a sparse query', () => {
        const prompts = savedChartExamplePrompts(metricOnlyItems);

        expect(Object.values(prompts)).toHaveLength(4);
        for (const prompt of Object.values(prompts)) {
            expect(prompt).toContain('Gross margin');
            expect(prompt).not.toMatch(/signup|orders/i);
        }
    });

    it('uses neutral wording when the query exposes no fields', () => {
        expect(Object.values(savedChartExamplePrompts({}))).toEqual([
            'A stream graph using the available fields',
            'A funnel using the available fields',
            'A heatmap using the available fields',
            'A waterfall using the available fields',
        ]);
    });
});
