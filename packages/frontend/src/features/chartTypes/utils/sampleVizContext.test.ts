import { type DataAppVizSchema } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildSampleVizContext } from './sampleVizContext';

const schema: DataAppVizSchema = {
    fields: [
        {
            name: 'category',
            label: 'Category',
            type: 'dimension',
            required: true,
        },
        { name: 'split', label: 'Split', type: 'series', required: false },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [
        {
            type: 'boolean',
            name: 'showLegend',
            label: 'Show legend',
            default: true,
        },
    ],
    colorPalette: null,
};

describe('buildSampleVizContext', () => {
    it('maps every declared field, required or not', () => {
        const context = buildSampleVizContext(schema);

        expect(Object.keys(context.fieldMapping)).toEqual([
            'category',
            'split',
            'value',
        ]);
    });

    it('writes a cell for every mapped column in every row', () => {
        const context = buildSampleVizContext(schema);

        expect(context.rows.length).toBeGreaterThan(0);
        for (const row of context.rows) {
            for (const columnId of Object.values(context.fieldMapping)) {
                expect(row[columnId].value.raw).toBeDefined();
                expect(row[columnId].value.formatted).not.toBe('');
            }
        }
    });

    it('gives dimensions date raw values with display-formatted labels', () => {
        const context = buildSampleVizContext(schema);
        const columnId = context.fieldMapping.category;

        for (const row of context.rows) {
            const { raw, formatted } = row[columnId].value;
            expect(Number.isNaN(Date.parse(String(raw)))).toBe(false);
            expect(formatted).not.toBe(String(raw));
        }
    });

    it('crosses categories with the series split', () => {
        const withSeries = buildSampleVizContext(schema);
        const withoutSeries = buildSampleVizContext({
            ...schema,
            fields: schema.fields.filter((f) => f.type !== 'series'),
        });

        expect(withSeries.rows.length).toBe(withoutSeries.rows.length * 3);
    });

    it('is deterministic', () => {
        expect(buildSampleVizContext(schema)).toEqual(
            buildSampleVizContext(schema),
        );
    });

    it('resolves options to their declared defaults', () => {
        const context = buildSampleVizContext(schema);

        expect(context.options).toEqual({ showLegend: true });
    });
});
