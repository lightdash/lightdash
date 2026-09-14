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

const flatSchema: DataAppVizSchema = {
    ...schema,
    fields: schema.fields.filter((f) => f.type !== 'series'),
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

    it('resolves options to their declared defaults', () => {
        const context = buildSampleVizContext(schema);

        expect(context.options).toEqual({ showLegend: true });
    });

    it('is deterministic', () => {
        expect(buildSampleVizContext(schema)).toEqual(
            buildSampleVizContext(schema),
        );
    });

    describe('without a series field', () => {
        it('leaves the rows flat', () => {
            const context = buildSampleVizContext(flatSchema);

            expect(context.pivotDetails).toBeNull();
            expect(context.rows.length).toBe(6);
        });

        it('writes a cell for every mapped column in every row', () => {
            const context = buildSampleVizContext(flatSchema);

            for (const row of context.rows) {
                for (const columnId of Object.values(context.fieldMapping)) {
                    expect(row[columnId].value.raw).toBeDefined();
                    expect(row[columnId].value.formatted).not.toBe('');
                }
            }
        });

        it('gives dimensions date raw values with display-formatted labels', () => {
            const context = buildSampleVizContext(flatSchema);
            const columnId = context.fieldMapping.category;

            for (const row of context.rows) {
                const { raw, formatted } = row[columnId].value;
                expect(Number.isNaN(Date.parse(String(raw)))).toBe(false);
                expect(formatted).not.toBe(String(raw));
            }
        });
    });

    describe('with a series field', () => {
        it('pivots the metric into one column per series value', () => {
            const context = buildSampleVizContext(schema);

            expect(context.pivotDetails?.valuesColumns).toEqual([
                expect.objectContaining({
                    referenceField: 'sample_value',
                    pivotColumnName: 'sample_value_any_Series A',
                    pivotValues: [
                        {
                            referenceField: 'sample_split',
                            value: 'Series A',
                            formatted: 'Series A',
                        },
                    ],
                }),
                expect.objectContaining({
                    pivotColumnName: 'sample_value_any_Series B',
                }),
                expect.objectContaining({
                    pivotColumnName: 'sample_value_any_Series C',
                }),
            ]);
        });

        it('indexes rows on the dimension and keys metrics by pivot column', () => {
            const { rows, pivotDetails } = buildSampleVizContext(schema);

            expect(pivotDetails).not.toBeNull();
            if (!pivotDetails) return;
            const pivotColumnNames = pivotDetails.valuesColumns.map(
                ({ pivotColumnName }) => pivotColumnName,
            );

            // One row per category, not one per category × series value.
            expect(rows.length).toBe(6);
            for (const row of rows) {
                expect(Object.keys(row).sort()).toEqual(
                    ['sample_category', ...pivotColumnNames].sort(),
                );
                for (const columnName of pivotColumnNames) {
                    expect(typeof row[columnName].value.raw).toBe('number');
                }
            }
        });

        it('declares the dimension as the index and the series as the pivot column', () => {
            const context = buildSampleVizContext(schema);

            expect(context.pivotDetails?.indexColumn).toEqual([
                { reference: 'sample_category', type: 'time' },
            ]);
            expect(context.pivotDetails?.groupByColumns).toEqual([
                { reference: 'sample_split' },
            ]);
        });

        it('describes the unpivoted columns behind the pivot', () => {
            const context = buildSampleVizContext(schema);

            expect(context.pivotDetails?.originalColumns).toEqual({
                sample_category: {
                    reference: 'sample_category',
                    type: 'date',
                    label: 'Category',
                },
                sample_split: {
                    reference: 'sample_split',
                    type: 'string',
                    label: 'Split',
                },
                sample_value: {
                    reference: 'sample_value',
                    type: 'number',
                    label: 'Value',
                },
            });
        });

        it('stays flat when there is no metric to spread', () => {
            const context = buildSampleVizContext({
                ...schema,
                fields: schema.fields.filter((f) => f.type !== 'metric'),
            });

            expect(context.pivotDetails).toBeNull();
        });
    });

    it('leaves host-resolved colors empty for synthetic rows', () => {
        const context = buildSampleVizContext(schema);

        expect(context.seriesColors).toEqual({});
        expect(context.valueColors).toEqual({});
    });
});
